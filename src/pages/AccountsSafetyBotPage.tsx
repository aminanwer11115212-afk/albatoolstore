/**
 * بوت تأمين الحسابات — Accounts Safety Bot
 *
 * فحص شامل + إصلاح تلقائي لأي اختلال في الفواتير، الدفعات، والأرصدة.
 * الاستدعاءات كلها عبر RPCs آمنة (SECURITY DEFINER) في قاعدة البيانات:
 *   - bot_scan_invoice_anomalies() — يستخرج قائمة الاختلالات.
 *   - bot_repair_invoice(uuid)     — يصلح فاتورة واحدة (يحذف الدفعات المكررة أو
 *                                     يُقيّد الدفعات المفقودة، ثم يُعيد احتساب رصيد العميل).
 *   - bot_repair_all()             — إصلاح شامل لكل الاختلالات + إعادة احتساب كل الأرصدة.
 * كما يشغّل runAllInvariants (قراءة فقط) لعرض قواعد الاتساق كاملة.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { runAllInvariants, type FinanceHealthReport, type InvariantResult } from "@/lib/financeInvariants";
import { toast } from "sonner";
import { Bot, ShieldCheck, ShieldAlert, RefreshCw, Wrench, Loader2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

type Anomaly = {
  invoice_id: string;
  invoice_number: string | null;
  customer_id: string | null;
  total: number;
  paid_amount: number;
  sum_payments: number;
  delta: number;
  kind: "missing_payment_trace" | "duplicate_payment" | "overpaid" | string;
};

const KIND_LABEL: Record<string, { label: string; color: string; hint: string }> = {
  missing_payment_trace: {
    label: "دفعة مفقودة",
    color: "border-amber-400 bg-amber-50 text-amber-900",
    hint: "المدفوع مُسجّل على الفاتورة لكن بدون قيد في المعاملات. الإصلاح سيُنشئ قيد نقدي بأثر رجعي.",
  },
  duplicate_payment: {
    label: "دفعة مكررة",
    color: "border-destructive/40 bg-destructive/5 text-destructive",
    hint: "توجد دفعات مكررة على نفس الفاتورة. الإصلاح سيحذف الصفوف الزائدة ويُعيد رصيد العميل الدائن.",
  },
  overpaid: {
    label: "تجاوز الإجمالي",
    color: "border-destructive/40 bg-destructive/5 text-destructive",
    hint: "مجموع الدفعات > إجمالي الفاتورة. الإصلاح يُحوّل الفائض إلى رصيد العميل الدائن.",
  },
};

export default function AccountsSafetyBotPage() {
  const qc = useQueryClient();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [invariants, setInvariants] = useState<FinanceHealthReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [repairingAll, setRepairingAll] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const [{ data, error }, report] = await Promise.all([
        (supabase as any).rpc("bot_scan_invoice_anomalies"),
        runAllInvariants(),
      ]);
      if (error) throw error;
      setAnomalies((data || []) as Anomaly[]);
      setInvariants(report);
      setLastRunAt(new Date().toLocaleString("ar"));
    } catch (e: any) {
      toast.error(`فشل الفحص: ${e?.message || e}`);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => { runScan(); }, [runScan]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
    qc.invalidateQueries({ queryKey: ["invoices-full"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transactions-with-accounts"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    window.dispatchEvent(new Event("customers:changed"));
    window.dispatchEvent(new Event("accounts:changed"));
  };

  const repairOne = async (a: Anomaly) => {
    setRepairingId(a.invoice_id);
    try {
      const { data, error } = await (supabase as any).rpc("bot_repair_invoice", { _invoice_id: a.invoice_id });
      if (error) throw error;
      toast.success(`تم إصلاح الفاتورة ${a.invoice_number || a.invoice_id.slice(0, 8)}`, {
        description: `حُذف ${data?.deleted_duplicates || 0} مكرر — أُضيف ${data?.inserted_backfills || 0} قيد.`,
      });
      invalidateAll();
      await runScan();
    } catch (e: any) {
      toast.error(`فشل الإصلاح: ${e?.message || e}`);
    } finally {
      setRepairingId(null);
    }
  };

  const repairAll = async () => {
    if (!confirm("تشغيل الإصلاح الشامل؟ سيتم إصلاح كل الفواتير المعطوبة وإعادة احتساب كل الأرصدة.")) return;
    setRepairingAll(true);
    try {
      const { data, error } = await (supabase as any).rpc("bot_repair_all");
      if (error) throw error;
      toast.success("تم الإصلاح الشامل بنجاح", {
        description: `أُصلحت ${data?.invoices_repaired || 0} فاتورة، أُعيد احتساب كل الأرصدة.`,
      });
      invalidateAll();
      await runScan();
    } catch (e: any) {
      toast.error(`فشل الإصلاح الشامل: ${e?.message || e}`);
    } finally {
      setRepairingAll(false);
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
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-extrabold text-foreground">بوت تأمين الحسابات</h1>
              {okAll ? <ShieldCheck className="h-6 w-6 text-emerald-600" /> : <ShieldAlert className="h-6 w-6 text-destructive" />}
            </div>
            <p className="text-sm text-muted-foreground">
              {okAll
                ? "كل الحسابات متسقة — لا يوجد اختلالات في الفواتير أو الأرصدة."
                : `تم اكتشاف ${anomalies.length} فاتورة معطوبة و ${failedInvariants.length} قاعدة اتساق فشلت. اضغط "إصلاح شامل" لتصحيح الكل تلقائيًا.`}
            </p>
            {lastRunAt && <p className="text-xs text-muted-foreground mt-1">آخر فحص: {lastRunAt}</p>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={runScan}
              disabled={scanning || repairingAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-60 text-sm font-medium"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              إعادة الفحص
            </button>
            {!okAll && (
              <button
                onClick={repairAll}
                disabled={repairingAll || scanning}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-60 text-sm font-bold"
              >
                {repairingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                إصلاح شامل
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Anomalies list */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${anomalies.length ? "text-destructive" : "text-emerald-600"}`} />
          <h2 className="font-bold text-sm">الفواتير المعطوبة ({anomalies.length})</h2>
        </header>
        {anomalies.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            لا توجد فواتير معطوبة.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {anomalies.map(a => {
              const meta = KIND_LABEL[a.kind] || { label: a.kind, color: "border-border bg-muted text-foreground", hint: "" };
              const isRepairing = repairingId === a.invoice_id;
              return (
                <li key={a.invoice_id} className="p-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${meta.color} font-bold`}>{meta.label}</span>
                      <Link
                        to={`/invoices/view/${a.invoice_id}`}
                        className="text-sm font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {a.invoice_number || a.invoice_id.slice(0, 8)}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                      <Stat label="الإجمالي" value={Number(a.total).toLocaleString()} />
                      <Stat label="المدفوع" value={Number(a.paid_amount).toLocaleString()} />
                      <Stat label="Σ الدفعات" value={Number(a.sum_payments).toLocaleString()} />
                      <Stat label="الفارق" value={Number(a.delta).toLocaleString()} highlight />
                    </div>
                    {meta.hint && <p className="text-[11px] text-muted-foreground mt-2">{meta.hint}</p>}
                  </div>
                  <button
                    onClick={() => repairOne(a)}
                    disabled={isRepairing || repairingAll}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 text-xs font-bold"
                  >
                    {isRepairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                    إصلاح
                  </button>
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
    </div>
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
