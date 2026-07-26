import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wand2, Wallet } from "lucide-react";
import {
  SETTLE_EPS,
  autoAllocateFifo,
  round2,
  simulateSettlement,
  validateSettlement,
  type OpenInvoice,
} from "@/lib/creditSettlement";

interface Props {
  open: boolean;
  customerId: string | null;
  customerName?: string | null;
  availableCredit: number;
  storedBalance: number;
  onClose: () => void;
  onApplied?: () => void;
}

const REASONS: Record<string, string> = {
  unauthenticated: "غير مُصرَّح — سجّل الدخول",
  invalid_input: "بيانات غير صالحة",
  too_many_items: "عدد الفواتير كبير جداً في دفعة واحدة",
  customer_not_found: "العميل غير موجود",
  no_credit_available: "لا يوجد رصيد دائن متاح",
  amount_exceeds_credit: "المجموع يتجاوز الرصيد الدائن المتاح",
  nothing_to_apply: "كل الفواتير المحددة مسددة بالفعل — لم يُطبَّق شيء",
};

/**
 * «سداد فواتير من رصيد العميل» — سداد متعدد الفواتير في دفعة واحدة ذرّية عبر
 * RPC settle_invoices_from_credit. الصافي لا يتغيّر (المديونية والرصيد ينقصان
 * بنفس المبلغ) — والـ RPC يفرض ذلك بحارس يُلغي العملية عند أي انحراف.
 */
export default function SettleInvoicesFromCreditDialog({
  open, customerId, customerName, availableCredit, storedBalance, onClose, onApplied,
}: Props) {
  const qc = useQueryClient();
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  // invoice_id → المبلغ المُدخل (نص) — وجود المفتاح يعني أن الفاتورة محددة.
  const [amounts, setAmounts] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !customerId) return;
    setAmounts(new Map());
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, date, total, paid_amount, status, source")
        .eq("customer_id", customerId)
        .neq("status", "cancelled")
        .neq("source", "pos")
        .order("date", { ascending: true });
      setLoading(false);
      if (error) { toast.error("تعذّر جلب الفواتير"); return; }
      const rows: OpenInvoice[] = (data || [])
        .map((r: any) => {
          const total = Number(r.total || 0);
          const paid = Number(r.paid_amount || 0);
          return {
            id: r.id,
            invoice_number: r.invoice_number,
            date: r.date,
            total,
            paid_amount: paid,
            remaining: round2(Math.max(total - paid, 0)),
          };
        })
        .filter((r: OpenInvoice) => r.remaining > SETTLE_EPS);
      setInvoices(rows);
    })();
  }, [open, customerId]);

  const invoicesById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const items = useMemo(
    () =>
      Array.from(amounts.entries())
        .map(([invoice_id, raw]) => ({ invoice_id, amount: Number(raw) || 0 }))
        .filter((it) => it.amount > 0),
    [amounts],
  );

  const validation = useMemo(
    () => validateSettlement(items, invoicesById, availableCredit),
    [items, invoicesById, availableCredit],
  );

  const sim = useMemo(
    () => simulateSettlement(invoices, items, storedBalance, availableCredit),
    [invoices, items, storedBalance, availableCredit],
  );

  const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  function toggleInvoice(inv: OpenInvoice) {
    setAmounts((prev) => {
      const next = new Map(prev);
      if (next.has(inv.id)) {
        next.delete(inv.id);
      } else {
        // الاقتراح: المتبقي كاملاً بحدود ما تبقّى من الرصيد بعد بقية المحدد.
        const usedElsewhere = Array.from(next.entries())
          .reduce((s, [, v]) => s + (Number(v) || 0), 0);
        const room = round2(Math.max(availableCredit - usedElsewhere, 0));
        const suggested = round2(Math.min(inv.remaining, room));
        next.set(inv.id, suggested > 0 ? String(suggested) : "");
      }
      return next;
    });
  }

  function setAmount(id: string, raw: string) {
    setAmounts((prev) => {
      const next = new Map(prev);
      next.set(id, raw);
      return next;
    });
  }

  function handleAutoAllocate() {
    const alloc = autoAllocateFifo(invoices, availableCredit);
    if (alloc.size === 0) { toast.info("لا يوجد ما يُوزَّع"); return; }
    setAmounts(new Map(Array.from(alloc.entries()).map(([id, v]) => [id, String(v)])));
  }

  async function handleSettle() {
    if (!customerId || !validation.ok) return;
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("settle_invoices_from_credit", {
        _customer_id: customerId,
        _items: items,
        _date: new Date().toISOString().slice(0, 10),
      });
      if (error) {
        // أخطاء RAISE (فاتورة ملغاة/POS/انحراف صافي) — المعاملة أُلغيت كاملة.
        toast.error(`لم يُنفَّذ أي سداد — ${error.message || "خطأ غير معروف"}`);
        return;
      }
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر السداد: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      const paidCount = Number(data.invoices_paid || 0);
      const skipped = Number(data.skipped || 0);
      const parts = [
        `سُدِّدت ${paidCount} فاتورة بمبلغ ${fmt(Number(data.applied_total))} من الرصيد الدائن`,
        `الرصيد المتبقي: ${fmt(Number(data.credit_after))}`,
      ];
      if (skipped > 0) parts.push(`تُخطّيت ${skipped} فاتورة (مسددة بالفعل)`);
      toast.success(parts.join(" • "), { duration: 7000 });

      qc.invalidateQueries({ queryKey: ["customer-statement", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-transactions", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-fresh", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-charge-history", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      try { window.dispatchEvent(new Event("transactions:changed")); } catch { /* noop */ }
      try { window.dispatchEvent(new Event("invoices:changed")); } catch { /* noop */ }
      onApplied?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء السداد");
    } finally {
      setSaving(false);
    }
  }

  const validationMsg = (() => {
    if (validation.ok) return null;
    switch (validation.reason) {
      case "exceeds_credit":
        return `المجموع (${fmt(validation.total || 0)}) يتجاوز الرصيد الدائن المتاح (${fmt(availableCredit)})`;
      case "exceeds_remaining":
        return "مبلغ إحدى الفواتير يتجاوز المتبقي عليها";
      case "invalid_amount":
        return "أدخل مبلغاً صحيحاً أكبر من صفر";
      default:
        return null; // empty: لا رسالة — فقط عطّل الزر
    }
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl" data-testid="settle-from-credit-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet size={18} className="text-primary" />
            سداد فواتير من رصيد العميل{customerName ? ` — ${customerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs bg-primary/5 border border-primary/20 rounded-md p-3 space-y-1">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>الرصيد الدائن المتاح: <b className="text-foreground tabular-nums">{fmt(availableCredit)}</b></span>
            <span>المحدد للسداد: <b className="text-primary tabular-nums">{fmt(sim.appliedTotal)}</b></span>
            <span>الرصيد بعد السداد: <b className="text-emerald-700 tabular-nums">{fmt(Math.max(round2(availableCredit - sim.appliedTotal), 0))}</b></span>
          </div>
          <div className="text-muted-foreground">
            السداد يتم دفعة واحدة ذرّية — وصافي حساب العميل لا يتغيّر (المديونية والرصيد ينقصان بنفس المبلغ).
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">
            الفواتير غير المسددة بالكامل ({invoices.length})
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={handleAutoAllocate}
            disabled={loading || !invoices.length || availableCredit <= SETTLE_EPS}
            data-testid="auto-allocate-btn"
            title="تحديد الفواتير من الأقدم وملء مبالغها من الرصيد المتاح"
          >
            <Wand2 size={13} /> توزيع تلقائي (الأقدم أولاً)
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل…</div>
        ) : invoices.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-md">
            لا توجد فواتير غير مسددة لهذا العميل. 🎉
          </div>
        ) : (
          <ScrollArea className="h-72 rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-right w-8"></th>
                  <th className="px-2 py-2 text-right">الفاتورة</th>
                  <th className="px-2 py-2 text-right">التاريخ</th>
                  <th className="px-2 py-2 text-right">الإجمالي</th>
                  <th className="px-2 py-2 text-right">المتبقي</th>
                  <th className="px-2 py-2 text-right w-32">مبلغ السداد</th>
                  <th className="px-2 py-2 text-right">بعد السداد</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const checked = amounts.has(inv.id);
                  const amt = Number(amounts.get(inv.id)) || 0;
                  const after = checked && amt > 0 ? round2(Math.max(inv.remaining - amt, 0)) : inv.remaining;
                  const becomesPaid = checked && amt > 0 && after <= SETTLE_EPS;
                  const overRemaining = checked && amt - inv.remaining > SETTLE_EPS;
                  return (
                    <tr key={inv.id} className={`border-t border-border ${checked ? "bg-primary/5" : ""}`}>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInvoice(inv)}
                          data-testid={`settle-check-${inv.invoice_number || inv.id}`}
                          title="تحديد الفاتورة للسداد"
                        />
                      </td>
                      <td className="px-2 py-2 font-semibold text-foreground">{inv.invoice_number || "—"}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">{inv.date}</td>
                      <td className="px-2 py-2 tabular-nums">{fmt(inv.total)}</td>
                      <td className="px-2 py-2 tabular-nums text-destructive font-semibold">{fmt(inv.remaining)}</td>
                      <td className="px-2 py-2">
                        {checked ? (
                          <Input
                            type="number"
                            value={amounts.get(inv.id) ?? ""}
                            onChange={(e) => setAmount(inv.id, e.target.value)}
                            className={`h-8 text-sm tabular-nums ${overRemaining ? "border-destructive" : ""}`}
                            placeholder={String(inv.remaining)}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {checked && amt > 0 ? (
                          becomesPaid ? (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">مسددة ✓</span>
                          ) : (
                            <span className="text-xs tabular-nums text-amber-700">يتبقى {fmt(after)}</span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}

        {validationMsg && (
          <div className="text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 py-2">
            {validationMsg}
          </div>
        )}

        {validation.ok && sim.perInvoice.length > 0 && (
          <div className="text-xs text-emerald-800 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2 flex flex-wrap gap-x-6 gap-y-1">
            <span>ستُسدَّد <b>{sim.perInvoice.filter((p) => p.new_status === "paid").length}</b> فاتورة بالكامل</span>
            <span>وجزئياً <b>{sim.perInvoice.filter((p) => p.new_status === "partial").length}</b></span>
            <span>الصافي قبل/بعد: <b className="tabular-nums">{fmt(sim.netBefore)}</b> ← <b className="tabular-nums">{fmt(sim.netAfter)}</b> (بلا تغيير)</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button
            onClick={handleSettle}
            disabled={saving || !validation.ok || sim.appliedTotal <= SETTLE_EPS}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="settle-confirm-btn"
          >
            {saving ? "جارٍ السداد…" : `سداد ${fmt(sim.appliedTotal)} من الرصيد`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
