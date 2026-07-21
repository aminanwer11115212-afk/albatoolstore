import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  customerId: string | null;
  customerName?: string | null;
  availableCredit: number;
  onClose: () => void;
  onApplied?: () => void;
}

type OpenInvoice = {
  id: string;
  invoice_number: string | null;
  date: string;
  total: number;
  paid_amount: number;
  remaining: number;
};

const REASONS: Record<string, string> = {
  unauthenticated: "غير مُصرَّح — سجّل الدخول",
  invalid_input: "بيانات غير صالحة",
  customer_not_found: "العميل غير موجود",
  invoice_not_found: "الفاتورة غير موجودة",
  invoice_cancelled: "الفاتورة ملغاة",
  invoice_is_pos: "لا يمكن تطبيق الرصيد على فواتير الكاش (POS)",
  no_credit_available: "لا يوجد رصيد دائن متاح",
  amount_exceeds_credit: "المبلغ يتجاوز الرصيد الدائن المتاح",
  invoice_already_paid: "الفاتورة مسددة بالكامل",
  inconsistent_invoice_payment: "فشل فحص التناسق — تم إلغاء العملية",
};

export default function ApplyCreditToInvoiceDialog({
  open, customerId, customerName, availableCredit, onClose, onApplied,
}: Props) {
  const qc = useQueryClient();
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !customerId) return;
    setSelectedId(null);
    setAmount("");
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
            remaining: Math.max(total - paid, 0),
          };
        })
        .filter((r: OpenInvoice) => r.remaining > 0.01);
      setInvoices(rows);
    })();
  }, [open, customerId]);

  const selected = useMemo(
    () => invoices.find((i) => i.id === selectedId) || null,
    [invoices, selectedId],
  );

  const numAmount = Number(amount) || 0;
  const maxApplicable = selected ? Math.min(availableCredit, selected.remaining) : 0;
  const amountInvalid = !selected || numAmount <= 0 || numAmount - maxApplicable > 0.01;

  function selectInvoice(inv: OpenInvoice) {
    setSelectedId(inv.id);
    // اقتراح تلقائي: طبّق الحد الأقصى الممكن.
    const suggested = Math.min(availableCredit, inv.remaining);
    setAmount(suggested > 0 ? String(suggested) : "");
  }

  async function handleApply() {
    if (!customerId || !selected) return;
    if (amountInvalid) return toast.error("مبلغ غير صالح");
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("apply_customer_credit_to_invoice", {
        _customer_id: customerId,
        _invoice_id: selected.id,
        _amount: numAmount,
        _date: new Date().toISOString().slice(0, 10),
      });
      if (error) {
        if (/inconsistent_invoice_payment/.test(error.message || "")) {
          toast.error(REASONS.inconsistent_invoice_payment);
        } else {
          toast.error(error.message || "خطأ غير معروف");
        }
        return;
      }
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر التطبيق: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      toast.success(
        `تم تطبيق ${Number(data.applied).toLocaleString()} من الرصيد الدائن على فاتورة ${data.invoice_number || ""}`,
      );
      qc.invalidateQueries({ queryKey: ["customer-transactions", customerId] });
      qc.invalidateQueries({ queryKey: ["customer-fresh", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      try { window.dispatchEvent(new Event("transactions:changed")); } catch { /* noop */ }
      onApplied?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء التطبيق");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            تطبيق رصيد دائن{customerName ? ` — ${customerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs bg-primary/5 border border-primary/20 rounded-md p-3 space-y-1">
          <div>الرصيد الدائن المتاح: <b className="text-foreground">{availableCredit.toLocaleString()}</b></div>
          <div className="text-muted-foreground">
            اختر فاتورة مفتوحة، ثم حدّد المبلغ المراد خصمه من الرصيد الدائن. يتم تحديث المدفوع وحالة الفاتورة تلقائياً.
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">الفواتير المفتوحة</Label>
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل…</div>
          ) : invoices.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-md">
              لا توجد فواتير مفتوحة لهذا العميل.
            </div>
          ) : (
            <ScrollArea className="h-56 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {invoices.map((inv) => {
                  const active = selectedId === inv.id;
                  return (
                    <li key={inv.id}>
                      <button
                        type="button"
                        onClick={() => selectInvoice(inv)}
                        className={`w-full text-right px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors ${
                          active ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground truncate">
                            فاتورة {inv.invoice_number || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{inv.date}</div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="text-xs text-muted-foreground">المتبقي</div>
                          <div className="text-sm font-bold text-destructive tabular-nums">
                            {inv.remaining.toLocaleString()}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>

        {selected && (
          <div className="space-y-2">
            <Label className="text-xs">مبلغ التطبيق (حتى {maxApplicable.toLocaleString()})</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(maxApplicable)}
            />
            {numAmount > 0 && !amountInvalid && (
              <div className="text-xs text-emerald-700 bg-emerald-500/5 border border-emerald-500/20 rounded-md p-2 space-y-1">
                <div>
                  الفاتورة: {selected.paid_amount.toLocaleString()} →{" "}
                  <b>{(selected.paid_amount + numAmount).toLocaleString()}</b> من {selected.total.toLocaleString()}
                </div>
                <div>
                  الرصيد الدائن: {availableCredit.toLocaleString()} →{" "}
                  <b>{Math.max(availableCredit - numAmount, 0).toLocaleString()}</b>
                </div>
              </div>
            )}
            {numAmount > 0 && amountInvalid && (
              <div className="text-xs text-destructive">
                المبلغ يجب أن يكون بين 0 و {maxApplicable.toLocaleString()}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={handleApply} disabled={saving || amountInvalid}>
            {saving ? "جارٍ التطبيق…" : "تطبيق"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
