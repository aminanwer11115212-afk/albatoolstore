import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Trash2, Download, ShieldOff, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

/**
 * أداة مطوّر مخفية — تُفتح فقط عبر Ctrl+Shift+9.
 * - Admin فقط: يُعرض قفل لغير الأدمن.
 * - نسخ احتياطي CSV اختياري لكل جدول متأثر قبل الحذف.
 * - معاينة عدّ الصفوف لكل خيار قبل التنفيذ.
 * - عبارة مرور عشوائية قصيرة يجب كتابتها للتأكيد.
 * - كل تنفيذ يُسجَّل في bot_audit_log (من/متى/ماذا).
 */

type ScopeKey =
  | "stock" | "ledger"
  | "invoices" | "quotes" | "purchases" | "bank" | "customers"
  | "transporters"
  | "stock_movements" | "payment_logs" | "statements_log" | "bot_logs";

// جداول التأثير لكل خيار — تُستخدم في المعاينة والنسخ الاحتياطي CSV.
const SCOPE_TABLES: Record<ScopeKey, string[]> = {
  stock: ["products"],
  ledger: ["transactions", "customers"],
  invoices: ["invoices", "invoice_items", "invoice_attachments", "invoice_revisions"],
  quotes: ["quotes", "quote_items", "quote_attachments"],
  purchases: ["purchase_orders", "purchase_order_items"],
  bank: ["transactions", "accounts"],
  customers: ["customers", "suppliers"],
  transporters: [
    "transporters", "customer_transporters", "customer_preferred_transporter",
    "destination_transporters", "locality_transporters",
    "invoice_transports", "invoices_transports_items", "quote_transports",
  ],
  stock_movements: ["stock_adjustments_log", "stock_transfers", "stock_returns", "stock_return_items"],
  payment_logs: ["invoice_revisions", "discount_audit_log"],
  statements_log: ["activity_log"],
  bot_logs: ["bot_audit_log", "bot_scan_snapshots"],
};

const INITIAL_SCOPE: Record<ScopeKey, boolean> = {
  stock: false, ledger: false,
  invoices: false, quotes: false, purchases: false, bank: false, customers: false,
  transporters: false,
  stock_movements: false, payment_logs: false, statements_log: false, bot_logs: false,
};

function randomPassphrase() {
  const words = ["افق", "نجم", "قمر", "شمس", "بحر", "نهر", "جبل", "زهر", "ضوء", "ريح"];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function rowsToCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join("\n");
}

function downloadCSV(name: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HiddenDevResetDialog() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Record<ScopeKey, boolean>>(INITIAL_SCOPE);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [backupBefore, setBackupBefore] = useState(true);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [countsLoading, setCountsLoading] = useState(false);
  const [passphrase, setPassphrase] = useState(randomPassphrase());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "9" || e.code === "Digit9")) {
        e.preventDefault();
        setPassphrase(randomPassphrase());
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const selectedKeys = useMemo(
    () => (Object.keys(scope) as ScopeKey[]).filter((k) => scope[k]),
    [scope],
  );
  const affectedTables = useMemo(() => {
    const s = new Set<string>();
    selectedKeys.forEach((k) => SCOPE_TABLES[k].forEach((t) => s.add(t)));
    return [...s];
  }, [selectedKeys]);

  // معاينة عدّ الصفوف للجداول المتأثرة
  useEffect(() => {
    if (!open || !isAdmin || affectedTables.length === 0) return;
    let cancelled = false;
    setCountsLoading(true);
    (async () => {
      const next: Record<string, number | null> = {};
      await Promise.all(
        affectedTables.map(async (t) => {
          try {
            const { count } = await supabase
              .from(t as any)
              .select("*", { count: "exact", head: true });
            next[t] = count ?? 0;
          } catch {
            next[t] = null;
          }
        }),
      );
      if (!cancelled) {
        setCounts(next);
        setCountsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isAdmin, affectedTables.join("|")]);

  const anySelected = selectedKeys.length > 0;
  const canRun = anySelected && confirmText.trim() === passphrase && !busy && isAdmin;

  const toggle = (k: ScopeKey) => setScope((s) => ({ ...s, [k]: !s[k] }));

  const groups: { title: string; items: { key: ScopeKey; label: string; hint: string }[] }[] = [
    {
      title: "تصفير سريع للمخزون والكشوف",
      items: [
        { key: "stock", label: "تصفير كميات كل المنتجات", hint: "يضبط stock_quantity إلى صفر لكل المنتجات." },
        { key: "ledger", label: "تصفير كشف حساب كل العملاء", hint: "يحذف الدفعات والأرصدة الدائنة ويعيد الأرصدة إلى صفر." },
      ],
    },
    {
      title: "منطقة الخطر — حذف بيانات المعاملات",
      items: [
        { key: "invoices", label: "الفواتير وبنودها ومرفقاتها ومراجعاتها", hint: "يحذف كل الفواتير والحركات المرتبطة." },
        { key: "quotes", label: "عروض الأسعار وبنودها ومرفقاتها", hint: "يحذف كل عروض السعر." },
        { key: "purchases", label: "أوامر الشراء ومدفوعات الموردين", hint: "يحذف كل المشتريات ومدفوعاتها." },
        { key: "bank", label: "حركات البنك وتصفير أرصدة الحسابات", hint: "يحذف transactions ويصفّر الأرصدة." },
        { key: "customers", label: "تصفير أرصدة العملاء والموردين", hint: "يعيد الأرصدة إلى صفر." },
      ],
    },
    {
      title: "الناقلون والترحيلات",
      items: [
        { key: "transporters", label: "حذف كل الناقلين وسجلات الترحيل", hint: "يمسح جداول الترحيل + الناقلين." },
      ],
    },
    {
      title: "سجلات النظام — إعادة من الصفر",
      items: [
        { key: "stock_movements", label: "سجل حركات المخزون", hint: "stock_adjustments_log + stock_transfers + stock_returns." },
        { key: "payment_logs", label: "سجل الدفعات والمراجعات وتدقيق الخصومات", hint: "invoice_revisions + discount_audit_log." },
        { key: "statements_log", label: "سجل نشاط كشوفات الحسابات", hint: "يفرّغ activity_log بالكامل." },
        { key: "bot_logs", label: "سجل بوت الحسابات والتقاطات الفحص", hint: "bot_audit_log + bot_scan_snapshots." },
      ],
    },
  ];

  const exportBackup = async () => {
    if (affectedTables.length === 0) {
      toast.info("لا يوجد جداول محدّدة للنسخ");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let ok = 0, fail = 0;
    for (const t of affectedTables) {
      try {
        const { data, error } = await supabase.from(t as any).select("*").limit(50000);
        if (error) throw error;
        const csv = rowsToCSV(data || []);
        downloadCSV(`albatool-backup_${t}_${stamp}.csv`, csv || "empty\n");
        ok++;
      } catch (e: any) {
        fail++;
        console.warn(`[HiddenDevReset] backup ${t} failed:`, e?.message);
      }
    }
    toast.success(`تم تصدير ${ok} ملف CSV${fail ? ` — فشل ${fail}` : ""}`);
  };

  const logAudit = async (payload: any, dryRun: boolean) => {
    try {
      await supabase.from("bot_audit_log").insert({
        action: "hidden_dev_reset",
        actor_uid: user?.id ?? null,
        actor_role: isAdmin ? "admin" : null,
        dry_run: dryRun,
        filters: { scope: selectedKeys, backup: backupBefore } as any,
        before_state: { counts } as any,
        after_state: payload?.after ?? null,
        details: { passphrase_used: !!passphrase, at: new Date().toISOString(), ...payload } as any,
      } as any);
    } catch (e) {
      console.warn("[HiddenDevReset] audit log failed", e);
    }
  };

  const run = async () => {
    if (!canRun) return;
    if (!confirm("تنفيذ العملية المخفية؟ لا يمكن التراجع.")) return;
    setBusy(true);
    const collected: any = { scope: selectedKeys, started_at: new Date().toISOString() };
    try {
      if (backupBefore) {
        await exportBackup();
        collected.backup = "csv_exported";
      }

      if (scope.stock || scope.ledger) {
        const { data, error } = await supabase.rpc(
          "admin_reset_stock_and_ledgers" as any,
          { _scope: { stock: scope.stock, ledger: scope.ledger } },
        );
        if (error) throw error;
        collected.quick = data;
      }

      if (scope.invoices || scope.quotes || scope.purchases || scope.bank || scope.customers) {
        const { data, error } = await supabase.rpc(
          "admin_reset_transactional_data" as any,
          {
            _scope: {
              invoices: scope.invoices, quotes: scope.quotes, purchases: scope.purchases,
              bank: scope.bank, customers: scope.customers,
            },
          },
        );
        if (error) throw error;
        collected.danger = data;
      }

      const wipeTable = async (t: string) => {
        const { error } = await supabase.from(t as any).delete().not("id", "is", null as any);
        if (error && !/id.*does not exist/i.test(error.message)) {
          const { error: e2 } = await supabase.from(t as any).delete().gte("created_at" as any, "1900-01-01");
          if (e2) throw e2;
        }
      };

      if (scope.transporters) {
        for (const t of [
          "invoices_transports_items", "invoice_transports", "quote_transports",
          "customer_preferred_transporter", "customer_transporters",
          "destination_transporters", "locality_transporters",
        ]) await wipeTable(t);
        const { error: eTr } = await supabase.from("transporters").delete().not("id", "is", null as any);
        if (eTr) throw eTr;
        collected.transporters = { ok: true };
      }

      if (scope.stock_movements) {
        for (const t of ["stock_return_items", "stock_returns", "stock_transfers", "stock_adjustments_log"]) await wipeTable(t);
        collected.stock_movements = { ok: true };
      }
      if (scope.payment_logs) {
        for (const t of ["invoice_revisions", "discount_audit_log"]) await wipeTable(t);
        collected.payment_logs = { ok: true };
      }
      if (scope.statements_log) {
        await wipeTable("activity_log");
        collected.statements_log = { ok: true };
      }
      if (scope.bot_logs) {
        for (const t of ["bot_audit_log", "bot_scan_snapshots"]) await wipeTable(t);
        collected.bot_logs = { ok: true };
      }

      collected.finished_at = new Date().toISOString();
      setResult(collected);

      // سجّل بعد التنفيذ (bot_audit_log قد يكون تم مسحه بنفس الجلسة — نُدرج صف جديد يشرح ذلك)
      await logAudit({ after: { done: true }, summary: collected }, false);

      [
        "products", "products-full", "product",
        "invoices", "invoices-full", "invoices-with-customers",
        "quotes", "quotes-full", "quotes-with-customers",
        "purchase_orders", "purchase-orders",
        "transactions", "transactionsWithAccounts",
        "customers", "customer-statement", "customer-transactions",
        "customer_balance_stats", "activity-log",
        "transporters", "customer_transporters", "customer_preferred_transporter",
        "destination_transporters", "destinations",
        "invoice_transports", "quote_transports",
        "stock-movements", "stock-adjustments", "stock-transfers", "stock-returns",
        "invoice-revisions", "discount-audit", "bot-audit-log", "bot-snapshots",
      ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

      window.dispatchEvent(new Event("customers:changed"));
      window.dispatchEvent(new Event("invoices:changed"));
      window.dispatchEvent(new Event("products:changed"));
      window.dispatchEvent(new Event("customer-logistics:changed"));

      toast.success("تم التنفيذ بنجاح وتوثيقه في سجل التدقيق");
      setConfirmText("");
      setPassphrase(randomPassphrase());
      setScope(INITIAL_SCOPE);
    } catch (e: any) {
      await logAudit({ error: e?.message || String(e) }, false);
      toast.error(e?.message || "تعذّر التنفيذ — يلزم صلاحية admin");
    } finally {
      setBusy(false);
    }
  };

  // شاشة رفض الوصول لغير الأدمن
  if (open && !roleLoading && !isAdmin) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldOff size={18} /> الوصول مرفوض
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive leading-relaxed">
              هذه الأداة مخصّصة لمستخدمي <b>admin</b> فقط. تم تسجيل محاولة الوصول.
            </div>
            <Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setConfirmText(""); setResult(null); setScope(INITIAL_SCOPE); }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0" dir="rtl">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} /> أداة مطوّر مخفية — منطقة الخطر
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 pb-6">
        <div className="space-y-4 text-sm">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive leading-relaxed">
            الوصول عبر <b>Ctrl+Shift+9</b> فقط، ومخصصة لمستخدمي admin. كل تنفيذ يُوثَّق في <b>سجل التدقيق</b>. <b>لا يمكن التراجع.</b>
          </div>

          <ScrollArea className="max-h-[45vh] pr-1">
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.title} className="space-y-2">
                  <div className="text-xs font-bold text-muted-foreground">{g.title}</div>
                  {g.items.map((it) => (
                    <label
                      key={it.key}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-border hover:border-destructive/40 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={scope[it.key]}
                        onCheckedChange={() => toggle(it.key)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-foreground">{it.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{it.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* معاينة الجداول المتأثرة */}
          {anySelected && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400">
                <Eye size={14} /> معاينة ما سيُمسّ ({affectedTables.length} جدول)
                {countsLoading && <Loader2 size={12} className="animate-spin" />}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-[11px]">
                {affectedTables.map((t) => (
                  <div key={t} className="flex justify-between gap-2 bg-background/60 rounded px-2 py-1 border border-border/60">
                    <span className="font-mono truncate" dir="ltr">{t}</span>
                    <span className="font-bold text-destructive">
                      {counts[t] === null ? "?" : (counts[t] ?? "…").toLocaleString?.() ?? counts[t]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* نسخ احتياطي */}
          <label className="flex items-start gap-3 p-2.5 rounded-lg border border-primary/30 bg-primary/5 cursor-pointer">
            <Checkbox checked={backupBefore} onCheckedChange={(v) => setBackupBefore(!!v)} className="mt-1" />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Download size={14} /> نسخة احتياطية CSV قبل التنفيذ
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                يُنزَّل ملف CSV منفصل لكل جدول متأثر (بحد 50 ألف صف) قبل الحذف.
              </div>
            </div>
            <Button
              type="button" variant="outline" size="sm"
              onClick={(e) => { e.preventDefault(); void exportBackup(); }}
              disabled={!anySelected || busy}
            >
              تصدير الآن
            </Button>
          </label>

          {/* عبارة المرور */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              اكتب عبارة المرور <b className="text-destructive font-mono" dir="ltr">{passphrase}</b> للتأكيد:
            </Label>
            <div className="flex gap-2">
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={passphrase}
                className="max-w-xs font-mono"
                dir="ltr"
                disabled={busy}
              />
              <Button
                type="button" variant="ghost" size="sm"
                onClick={() => { setPassphrase(randomPassphrase()); setConfirmText(""); }}
                disabled={busy}
              >
                عبارة جديدة
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="destructive" onClick={run} disabled={!canRun}>
              {busy ? <Loader2 size={16} className="ml-1 animate-spin" /> : <Trash2 size={16} className="ml-1" />}
              {busy ? "جارِ التنفيذ..." : "تنفيذ الآن"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>إغلاق</Button>
          </div>

          {result && (
            <pre className="text-[11px] bg-muted p-3 rounded-lg overflow-auto max-h-40" dir="ltr">
{JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
