/**
 * بوت تأمين الحسابات — Accounts Safety Bot
 *
 * الميزات:
 *  - فحص شامل مع فلترة (من/إلى + نوع الاختلال).
 *  - وضع محاكاة (Dry-Run) يعرض ما سيحدث دون تنفيذ.
 *  - إصلاح فرد/شامل مع توثيق في bot_audit_log.
 *  - «إصلاح شامل» مقتصر على دور admin (يتحقّق DB + UI).
 *  - تبويب سجل تدقيق مع الحالة قبل/بعد.
 *  - عرض آخر لقطة فحص تلقائية (pg_cron كل 6 ساعات).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { runAllInvariants, type FinanceHealthReport, type InvariantResult } from "@/lib/financeInvariants";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import {
  Bot, ShieldCheck, ShieldAlert, RefreshCw, Wrench, Loader2, CheckCircle2, AlertTriangle,
  ArrowRight, PlayCircle, Filter, ScrollText, Clock, Lock, History
} from "lucide-react";
import { Link } from "react-router-dom";

type Anomaly = {
  invoice_id: string;
  invoice_number: string | null;
  customer_id: string | null;
  invoice_date: string | null;
  total: number;
  paid_amount: number;
  sum_payments: number;
  delta: number;
  kind: string;
};

type Preview = {
  ok: boolean;
  invoice_id: string;
  invoice_number?: string;
  current?: { paid_amount: number; sum_payments: number; delta: number };
  will_delete_duplicate_pairs?: number;
  will_backfill_amount?: number;
  expected_customer_balance?: number;
  action?: string;
};

type AuditRow = {
  id: string;
  action: string;
  invoice_id: string | null;
  actor_uid: string | null;
  actor_role: string | null;
  dry_run: boolean;
  filters: any;
  before_state: any;
  after_state: any;
  details: any;
  created_at: string;
};

type Snapshot = {
  id: string;
  run_at: string;
  anomalies_count: number;
  by_kind: Record<string, number>;
  source: string;
};

type HealthReport = {
  ok: boolean;
  run_at: string;
  total: number;
  sections: {
    invoice_anomalies: number;
    customer_balance_drift: number;
    supplier_balance_drift: number;
    account_balance_drift: number;
    pos_leak: number;
    stock_drift: number;
    incomplete_returns: number;
  };
};

const SECTION_META: Record<keyof HealthReport["sections"], { label: string; hint: string }> = {
  invoice_anomalies:       { label: "اختلالات الفواتير",       hint: "دفعات مفقودة/مكررة/تجاوز إجمالي" },
  customer_balance_drift:  { label: "انحراف رصيد العملاء",     hint: "customers.balance مخالف للحساب" },
  supplier_balance_drift:  { label: "انحراف رصيد الموردين",    hint: "suppliers.balance مخالف للحساب" },
  account_balance_drift:   { label: "انحراف رصيد الحسابات",   hint: "accounts.balance مخالف لحركات المعاملات" },
  pos_leak:                { label: "تسرّب مبيعات الكاش",      hint: "فاتورة POS مرتبطة بعميل حقيقي" },
  stock_drift:             { label: "انحراف كميات المخزون",    hint: "products.stock_quantity مخالف لسجل الحركات" },
  incomplete_returns:      { label: "مرتجعات غير مكتملة",      hint: "مرتجع بدون قيد إرجاع مخزون" },
};

const ALL_KINDS = [
  { key: "missing_payment_trace", label: "دفعة مفقودة", color: "border-amber-400 bg-amber-50 text-amber-900" },
  { key: "duplicate_payment", label: "دفعة مكررة", color: "border-destructive/40 bg-destructive/5 text-destructive" },
  { key: "overpaid", label: "تجاوز الإجمالي", color: "border-destructive/40 bg-destructive/5 text-destructive" },
] as const;

const kindMeta = (k: string) => ALL_KINDS.find(x => x.key === k) ?? { key: k, label: k, color: "border-border bg-muted text-foreground" };

export default function AccountsSafetyBotPage() {
  const qc = useQueryClient();
  const { role } = useUserRole();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState<"scan" | "audit">("scan");

  // Filters
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);

  // Data
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [invariants, setInvariants] = useState<FinanceHealthReport | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<Snapshot | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview | null>>({});
  const [audit, setAudit] = useState<AuditRow[]>([]);

  // State
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const filters = useMemo(() => ({
    from: dateFrom || null,
    to: dateTo || null,
    kinds: kinds.length ? kinds : null,
  }), [dateFrom, dateTo, kinds]);

  // Health v3
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [autoRepairEnabled, setAutoRepairEnabled] = useState(false);
  const [savingAutoFlag, setSavingAutoFlag] = useState(false);
  const [repairingHealth, setRepairingHealth] = useState(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const [scanRes, invRes, snapRes, healthRes, cs] = await Promise.all([
        (supabase as any).rpc("bot_scan_invoice_anomalies_v2", {
          _from: filters.from, _to: filters.to, _kinds: filters.kinds,
        }),
        runAllInvariants(),
        (supabase as any).from("bot_scan_snapshots").select("*").order("run_at", { ascending: false }).limit(1).maybeSingle(),
        (supabase as any).rpc("bot_scan_health_v3"),
        (supabase as any).from("company_settings").select("bot_auto_repair_enabled").limit(1).maybeSingle(),
      ]);
      if (scanRes.error) throw scanRes.error;
      setAnomalies((scanRes.data || []) as Anomaly[]);
      setInvariants(invRes);
      setLastSnapshot((snapRes.data as Snapshot) || null);
      setHealth((healthRes.data as HealthReport) || null);
      setAutoRepairEnabled(!!cs.data?.bot_auto_repair_enabled);
      setLastRunAt(new Date().toLocaleString("ar"));
      setPreviews({});
    } catch (e: any) {
      toast.error(`فشل الفحص: ${e?.message || e}`);
    } finally {
      setScanning(false);
    }
  }, [filters.from, filters.to, filters.kinds]);

  const toggleAutoRepair = async (next: boolean) => {
    if (!isAdmin) { toast.error("الإصلاح الذاتي مقتصر على admin."); return; }
    setSavingAutoFlag(true);
    try {
      const { data: row } = await (supabase as any).from("company_settings").select("id").limit(1).maybeSingle();
      if (!row?.id) throw new Error("company_settings not found");
      const { error } = await (supabase as any).from("company_settings")
        .update({ bot_auto_repair_enabled: next }).eq("id", row.id);
      if (error) throw error;
      setAutoRepairEnabled(next);
      toast.success(next ? "تم تفعيل الإصلاح الذاتي (كل 6 ساعات)" : "تم إيقاف الإصلاح الذاتي");
    } catch (e: any) {
      toast.error(`فشل: ${e?.message || e}`);
    } finally {
      setSavingAutoFlag(false);
    }
  };

  const repairHealth = async (dry = false) => {
    if (!isAdmin) { toast.error("مقتصر على admin."); return; }
    if (!dry && !confirm("تنفيذ الإصلاح الشامل على كل الأقسام؟")) return;
    setRepairingHealth(true);
    try {
      const { data, error } = await (supabase as any).rpc("bot_repair_health_v3", {
        _dry_run: dry, _sections: null, _note: null,
      });
      if (error) throw error;
      if (dry) toast.info("محاكاة الفحص الشامل انتهت — راجع سجل التدقيق");
      else toast.success(`تم الإصلاح الشامل — ${data?.details ? Object.keys(data.details).length : 0} قسم`);
      invalidateAll();
      await runScan();
    } catch (e: any) {
      const msg = String(e?.message || e);
      toast.error(msg.includes("unauthorized_admin_only") ? "مرفوض — يحتاج admin" : `فشل: ${msg}`);
    } finally {
      setRepairingHealth(false);
    }
  };

  const loadAudit = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("bot_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      // ليس admin → RLS تمنع القراءة، أظهر رسالة ودّية
      setAudit([]);
      return;
    }
    setAudit((data || []) as AuditRow[]);
  }, []);

  useEffect(() => { runScan(); }, [runScan]);
  useEffect(() => { if (tab === "audit") loadAudit(); }, [tab, loadAudit]);

  const invalidateAll = () => {
    ["invoices","invoices-with-customers","invoices-full","transactions","transactions-with-accounts","customers","accounts"]
      .forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("accounts:changed"));
  };

  const previewOne = async (a: Anomaly) => {
    setBusyId(a.invoice_id);
    try {
      const { data, error } = await (supabase as any).rpc("bot_repair_invoice_v2", {
        _invoice_id: a.invoice_id, _dry_run: true, _note: null,
      });
      if (error) throw error;
      setPreviews(prev => ({ ...prev, [a.invoice_id]: data as Preview }));
      toast.info("محاكاة — لم تُنفَّذ تعديلات", {
        description: `الإجراء المتوقع: ${(data as Preview)?.action}`,
      });
    } catch (e: any) {
      toast.error(`فشل المحاكاة: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  const repairOne = async (a: Anomaly) => {
    if (dryRun) return previewOne(a);
    if (!confirm(`تنفيذ الإصلاح على الفاتورة ${a.invoice_number || a.invoice_id.slice(0,8)}؟`)) return;
    setBusyId(a.invoice_id);
    try {
      const { data, error } = await (supabase as any).rpc("bot_repair_invoice_v2", {
        _invoice_id: a.invoice_id, _dry_run: false, _note: null,
      });
      if (error) throw error;
      toast.success(`تم الإصلاح — سُجّل في سجل التدقيق`, {
        description: `حُذف ${data?.deleted_duplicates || 0} مكرر — أُضيف ${data?.inserted_backfills || 0} قيد.`,
      });
      invalidateAll();
      await runScan();
    } catch (e: any) {
      toast.error(`فشل الإصلاح: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  const runAll = async () => {
    if (!isAdmin) {
      toast.error("الإصلاح الشامل مقتصر على دور «admin» فقط.");
      return;
    }
    const label = dryRun ? "محاكاة" : "إصلاح فعلي";
    if (!confirm(`${label} شامل على ${anomalies.length} فاتورة (${filters.from || "بدون تاريخ من"} → ${filters.to || "بدون تاريخ إلى"})؟`)) return;
    setBusyAll(true);
    try {
      const { data, error } = await (supabase as any).rpc("bot_repair_all_v2", {
        _from: filters.from, _to: filters.to, _kinds: filters.kinds,
        _dry_run: dryRun, _note: null,
      });
      if (error) throw error;
      if (dryRun) {
        toast.info("محاكاة شاملة انتهت — سُجّلت في التدقيق", {
          description: `${data?.candidates || 0} فاتورة مرشحة للإصلاح.`,
        });
      } else {
        toast.success("تم الإصلاح الشامل", {
          description: `أُصلحت ${data?.invoices_repaired || 0} فاتورة، وأُعيد احتساب كل الأرصدة.`,
        });
        invalidateAll();
      }
      await runScan();
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("unauthorized_admin_only")) {
        toast.error("مرفوض — الإصلاح الشامل يحتاج دور admin.");
      } else {
        toast.error(`فشل: ${msg}`);
      }
    } finally {
      setBusyAll(false);
    }
  };

  const runSnapshotNow = async () => {
    try {
      const { data, error } = await (supabase as any).rpc("bot_run_snapshot", { _source: "manual" });
      if (error) throw error;
      toast.success(`تم أخذ لقطة يدوية — ${data?.anomalies_count || 0} اختلال.`);
      await runScan();
    } catch (e: any) {
      toast.error(`فشل: ${e?.message || e}`);
    }
  };

  const failedInvariants = (invariants?.results || []).filter(r => !r.pass);
  const okAll = anomalies.length === 0 && failedInvariants.length === 0;

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Hero */}
      <header className={`rounded-2xl border-2 p-6 ${okAll ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white" : "border-destructive/40 bg-gradient-to-br from-destructive/5 to-white"}`}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className={`h-14 w-14 rounded-full flex items-center justify-center ${okAll ? "bg-emerald-500 text-white" : "bg-destructive text-destructive-foreground"}`}>
            <Bot className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-2xl font-extrabold text-foreground">بوت تأمين الحسابات</h1>
              {okAll ? <ShieldCheck className="h-6 w-6 text-emerald-600" /> : <ShieldAlert className="h-6 w-6 text-destructive" />}
              {isAdmin ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground font-bold">admin</span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-bold inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> عرض فقط
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {okAll
                ? "كل الحسابات متسقة ضمن الفلترة الحالية."
                : `${anomalies.length} فاتورة مطابقة للفلترة + ${failedInvariants.length} قاعدة اتساق فشلت.`}
            </p>
            {lastRunAt && <p className="text-xs text-muted-foreground mt-1">آخر فحص يدوي: {lastRunAt}</p>}
            {lastSnapshot && (
              <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> آخر لقطة تلقائية:{" "}
                {new Date(lastSnapshot.run_at).toLocaleString("ar")} — {lastSnapshot.anomalies_count} اختلال
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <TabBtn active={tab === "scan"} onClick={() => setTab("scan")} icon={<PlayCircle className="h-4 w-4" />}>الفحص والإصلاح</TabBtn>
        <TabBtn active={tab === "audit"} onClick={() => setTab("audit")} icon={<ScrollText className="h-4 w-4" />}>سجل التدقيق</TabBtn>
      </div>

      {tab === "scan" && (
        <>
          {/* Filters */}
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Filter className="h-4 w-4 text-primary" /> فلترة الفحص
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">من تاريخ</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5 bg-background" />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">إلى تاريخ</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full border border-border rounded px-2 py-1.5 bg-background" />
              </label>
              <div className="text-xs space-y-1 md:col-span-2">
                <span className="text-muted-foreground">نوع الاختلال (اتركه فارغًا للكل)</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_KINDS.map(k => {
                    const on = kinds.includes(k.key);
                    return (
                      <button key={k.key} type="button"
                        onClick={() => setKinds(on ? kinds.filter(x => x !== k.key) : [...kinds, k.key])}
                        className={`px-2 py-1 rounded border text-[11px] font-bold ${on ? k.color : "border-border bg-background text-muted-foreground"}`}
                      >
                        {k.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-border">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
                  className="h-4 w-4 accent-primary" />
                <span className="font-bold">وضع المحاكاة (Dry-Run)</span>
                <span className="text-xs text-muted-foreground">— يعرض ما سيحدث دون تنفيذ</span>
              </label>
              <div className="flex gap-2">
                <button onClick={runSnapshotNow} disabled={scanning}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-border bg-background hover:bg-muted text-xs">
                  <History className="h-3 w-3" /> لقطة الآن
                </button>
                <button onClick={runScan} disabled={scanning || busyAll}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-60 text-sm font-medium">
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  فحص شامل
                </button>
                <button onClick={runAll} disabled={busyAll || scanning || anomalies.length === 0 || !isAdmin}
                  title={!isAdmin ? "يحتاج دور admin" : undefined}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60 ${dryRun ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  {busyAll ? <Loader2 className="h-4 w-4 animate-spin" /> : (dryRun ? <PlayCircle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />)}
                  {dryRun ? "محاكاة شاملة" : "إصلاح شامل"}
                  {!isAdmin && <Lock className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </section>

          {/* Health v3 — الفحص الشامل للنظام */}
          <section className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
            <header className="px-4 py-3 border-b border-border flex items-center gap-2 justify-between flex-wrap">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${health?.ok ? "text-emerald-600" : "text-destructive"}`} />
                <h2 className="font-bold text-sm">
                  الفحص الشامل للنظام {health && <span className="text-muted-foreground">— إجمالي {health.total} اختلال</span>}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className={`inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded border ${autoRepairEnabled ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-border bg-background"} ${isAdmin ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}>
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600"
                    disabled={!isAdmin || savingAutoFlag}
                    checked={autoRepairEnabled}
                    onChange={e => toggleAutoRepair(e.target.checked)} />
                  الإصلاح الذاتي التلقائي كل 6 ساعات
                  {!isAdmin && <Lock className="h-3 w-3" />}
                </label>
                <button onClick={() => repairHealth(true)} disabled={repairingHealth || !isAdmin}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-border bg-background hover:bg-muted text-xs font-bold disabled:opacity-60">
                  {repairingHealth ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                  محاكاة الإصلاح الشامل
                </button>
                <button onClick={() => repairHealth(false)} disabled={repairingHealth || !isAdmin || (health?.total || 0) === 0}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-destructive text-destructive-foreground hover:opacity-90 text-xs font-bold disabled:opacity-60">
                  {repairingHealth ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                  إصلاح شامل الآن
                  {!isAdmin && <Lock className="h-3 w-3" />}
                </button>
              </div>
            </header>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3">
              {health && (Object.keys(SECTION_META) as Array<keyof HealthReport["sections"]>).map(key => {
                const meta = SECTION_META[key];
                const count = health.sections[key] || 0;
                const bad = count > 0;
                return (
                  <div key={key} className={`rounded-lg border p-3 ${bad ? "border-destructive/40 bg-destructive/5" : "border-emerald-300 bg-emerald-50"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">{meta.label}</span>
                      {bad ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    </div>
                    <div className={`text-2xl font-extrabold tabular-nums mt-1 ${bad ? "text-destructive" : "text-emerald-700"}`}>{count}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{meta.hint}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Anomalies */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-4 py-3 border-b border-border flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${anomalies.length ? "text-destructive" : "text-emerald-600"}`} />
              <h2 className="font-bold text-sm">الفواتير المطابقة للفلترة ({anomalies.length})</h2>
            </header>
            {anomalies.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" /> لا توجد اختلالات.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {anomalies.map(a => {
                  const meta = kindMeta(a.kind);
                  const busy = busyId === a.invoice_id;
                  const preview = previews[a.invoice_id];
                  return (
                    <li key={a.invoice_id} className="p-4 flex flex-wrap items-start gap-3">
                      <div className="flex-1 min-w-[240px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[11px] px-2 py-0.5 rounded border ${meta.color} font-bold`}>{meta.label}</span>
                          <Link to={`/invoices/view/${a.invoice_id}`}
                            className="text-sm font-bold text-primary hover:underline inline-flex items-center gap-1">
                            {a.invoice_number || a.invoice_id.slice(0, 8)} <ArrowRight className="h-3 w-3" />
                          </Link>
                          {a.invoice_date && <span className="text-[10px] text-muted-foreground">{a.invoice_date}</span>}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                          <Stat label="الإجمالي" value={Number(a.total).toLocaleString()} />
                          <Stat label="المدفوع" value={Number(a.paid_amount).toLocaleString()} />
                          <Stat label="Σ الدفعات" value={Number(a.sum_payments).toLocaleString()} />
                          <Stat label="الفارق" value={Number(a.delta).toLocaleString()} highlight />
                        </div>
                        {preview && (
                          <div className="mt-2 rounded border border-dashed border-primary/40 bg-primary/5 p-2 text-[11px] space-y-1">
                            <div className="font-bold text-primary inline-flex items-center gap-1">
                              <PlayCircle className="h-3 w-3" /> معاينة الإصلاح
                            </div>
                            <div>الإجراء: <b>{preview.action}</b></div>
                            {!!preview.will_delete_duplicate_pairs && <div>سيُحذف <b>{preview.will_delete_duplicate_pairs}</b> صفوف مكررة</div>}
                            {!!preview.will_backfill_amount && <div>سيُضاف قيد بمبلغ <b className="tabular-nums">{Number(preview.will_backfill_amount).toLocaleString()}</b></div>}
                            {preview.expected_customer_balance !== undefined && (
                              <div>رصيد العميل المتوقّع بعد الإصلاح: <b className="tabular-nums">{Number(preview.expected_customer_balance).toLocaleString()}</b></div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button onClick={() => previewOne(a)} disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-border bg-background hover:bg-muted text-xs font-bold disabled:opacity-60">
                          {busy && dryRun ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                          محاكاة
                        </button>
                        <button onClick={() => repairOne(a)} disabled={busy || dryRun}
                          title={dryRun ? "أوقف وضع المحاكاة لتنفيذ الإصلاح" : undefined}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 text-xs font-bold">
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                          إصلاح
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Invariants */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <header className="px-4 py-3 border-b border-border flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">قواعد الاتساق ({invariants?.pass || 0}/{invariants?.results.length || 0} ناجحة)</h2>
            </header>
            <ul className="divide-y divide-border">
              {(invariants?.results || []).map(r => <InvariantRow key={r.id} r={r} />)}
            </ul>
          </section>
        </>
      )}

      {tab === "audit" && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <header className="px-4 py-3 border-b border-border flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-sm">سجل التدقيق ({audit.length})</h2>
            </div>
            <button onClick={loadAudit} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-background hover:bg-muted">
              <RefreshCw className="h-3 w-3" /> تحديث
            </button>
          </header>
          {!isAdmin ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              سجل التدقيق مقتصر على دور «admin».
            </div>
          ) : audit.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">لا يوجد سجلات بعد.</div>
          ) : (
            <ul className="divide-y divide-border">
              {audit.map(r => <AuditRowItem key={r.id} r={r} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 -mb-px ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {icon}{children}
    </button>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded p-2 border ${highlight ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"}`}>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums text-sm">{value}</div>
    </div>
  );
}

function InvariantRow({ r }: { r: InvariantResult }) {
  return (
    <li className="p-3 flex items-start gap-3">
      {r.pass
        ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        : <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{r.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.severity}</span>
          <span className="text-[10px] text-muted-foreground">{r.ms}ms</span>
        </div>
        <div className={`text-xs mt-0.5 ${r.pass ? "text-emerald-700" : "text-destructive"}`}>{r.summary}</div>
        {!r.pass && r.fixHint && <div className="text-[11px] text-muted-foreground mt-1">💡 {r.fixHint}</div>}
      </div>
    </li>
  );
}

function AuditRowItem({ r }: { r: AuditRow }) {
  const [open, setOpen] = useState(false);
  const actionColor =
    r.action === "repair_all" ? "bg-destructive text-destructive-foreground" :
    r.action === "repair_invoice" ? "bg-primary text-primary-foreground" :
    "bg-muted text-muted-foreground";
  return (
    <li className="p-3">
      <button onClick={() => setOpen(o => !o)} className="w-full text-right flex items-start gap-3">
        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${actionColor}`}>{r.action}</span>
        {r.dry_run && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">محاكاة</span>}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("ar")}</div>
          <div className="text-xs">
            {r.invoice_id && <span>فاتورة: <code className="text-[10px]">{r.invoice_id.slice(0,8)}</code> — </span>}
            دور المنفّذ: <b>{r.actor_role || "—"}</b>
            {r.details?.invoices_repaired !== undefined && <span> — أُصلحت {r.details.invoices_repaired} فاتورة</span>}
            {r.details?.candidates !== undefined && <span> — {r.details.candidates} مرشّحة</span>}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <JsonBlock title="قبل" data={r.before_state} />
          <JsonBlock title="بعد" data={r.after_state} />
          {r.filters && <JsonBlock title="الفلترة" data={r.filters} />}
          {r.details && <JsonBlock title="التفاصيل" data={r.details} />}
        </div>
      )}
    </li>
  );
}

function JsonBlock({ title, data }: { title: string; data: any }) {
  if (!data) return null;
  return (
    <div className="rounded border border-border bg-muted/40 p-2 overflow-auto">
      <div className="text-[10px] font-bold text-muted-foreground mb-1">{title}</div>
      <pre dir="ltr" className="text-[10px] whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
