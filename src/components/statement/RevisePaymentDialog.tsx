import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordInvoiceRevision } from "@/utils/invoiceRevisions";

export type RevisableTx = {
  id: string;
  amount: number;
  reference_id: string | null;
  customer_id?: string | null;
  description?: string | null;
};

interface Props {
  open: boolean;
  tx: RevisableTx | null;
  onClose: () => void;
  onSaved?: () => void;
}

const REASONS: Record<string, string> = {
  unauthenticated: "غير مُصرَّح — سجّل الدخول",
  tx_not_found: "الدفعة غير موجودة",
  not_a_payment: "هذا القيد ليس دفعة قابلة للتعديل",
  credit_consumption_not_editable: "قيود استهلاك الرصيد الدائن لا تُعدَّل من هنا",
  no_linked_invoice: "الدفعة غير مرتبطة بفاتورة",
  invoice_not_found: "الفاتورة غير موجودة",
  invoice_cancelled: "الفاتورة ملغاة",
  invalid_amount: "المبلغ غير صالح",
  invalid_discount: "الخصم غير صالح",
  paid_would_be_negative: "المدفوع سيصبح سالباً",
  would_overpay: "المبلغ يتجاوز إجمالي الفاتورة — استخدم شاشة الدفعة لتحويل الفائض إلى رصيد دائن",
};

export default function RevisePaymentDialog({ open, tx, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [inv, setInv] = useState<{ invoice_number: string | null; total: number; paid_amount: number; discount: number } | null>(null);

  useEffect(() => {
    if (!open || !tx) return;
    setAmount(String(tx.amount ?? ""));
    setDiscount("");
    setInv(null);
    if (tx.reference_id) {
      (async () => {
        const { data } = await (supabase as any)
          .from("invoices")
          .select("invoice_number, total, paid_amount, discount")
          .eq("id", tx.reference_id)
          .maybeSingle();
        if (data) {
          setInv({
            invoice_number: data.invoice_number ?? null,
            total: Number(data.total || 0),
            paid_amount: Number(data.paid_amount || 0),
            discount: Number(data.discount || 0),
          });
          setDiscount(String(Number(data.discount || 0)));
        }
      })();
    }
  }, [open, tx]);

  if (!tx) return null;

  const newAmount = Number(amount) || 0;
  const newDiscount = discount === "" ? null : Number(discount) || 0;
  const oldAmount = Number(tx.amount || 0);
  // معاينة أثر التعديل على الفاتورة
  const projectedTotal = inv
    ? Math.max(0, inv.total - ((newDiscount ?? inv.discount) - inv.discount))
    : null;
  const projectedPaid = inv ? inv.paid_amount + (newAmount - oldAmount) : null;
  const wouldOverpay = projectedTotal != null && projectedPaid != null && projectedPaid > projectedTotal + 0.01;

  async function handleSave() {
    if (newAmount < 0) return toast.error("المبلغ غير صالح");
    if (wouldOverpay) return toast.error(REASONS.would_overpay, { duration: 6000 });
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("revise_invoice_payment", {
        _tx_id: tx.id,
        _new_amount: newAmount,
        _new_discount: newDiscount,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر التعديل: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      // سجل التعديل في سجل مراجعات الفاتورة
      try {
        const { data: authData } = await supabase.auth.getUser();
        const changedBy = authData?.user?.email || authData?.user?.id || "system";
        await recordInvoiceRevision({
          invoiceId: data.invoice_id,
          action: "payment",
          changedBy,
          changes: {
            paid_amount: { before: data.paid_before, after: data.paid_after },
            ...(data.discount_before !== data.discount_after
              ? { discount: { before: data.discount_before, after: data.discount_after }, total: { before: data.total_before, after: data.total_after } }
              : {}),
          },
          snapshot: { tx_id: tx.id, amount_before: data.amount_before, amount_after: data.amount_after },
          note: `تعديل دفعة ${data.amount_before?.toLocaleString?.() ?? data.amount_before} → ${data.amount_after?.toLocaleString?.() ?? data.amount_after}`,
        });
      } catch { /* audit غير حرِج */ }

      toast.success("تم تعديل الدفعة وإعادة حساب الرصيد");
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء التعديل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل الدفعة{inv?.invoice_number ? ` — فاتورة ${inv.invoice_number}` : ""}</DialogTitle>
        </DialogHeader>

        {inv && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 space-y-1">
            <div>إجمالي الفاتورة الحالي: <b className="text-foreground">{inv.total.toLocaleString()}</b></div>
            <div>المدفوع الحالي: <b className="text-foreground">{inv.paid_amount.toLocaleString()}</b></div>
            {projectedPaid != null && projectedTotal != null && (
              <div className={wouldOverpay ? "text-destructive" : "text-emerald-700"}>
                بعد التعديل: مدفوع {projectedPaid.toLocaleString()} من {projectedTotal.toLocaleString()}
                {wouldOverpay ? " (يتجاوز الإجمالي)" : ""}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">مبلغ الدفعة</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">خصم الفاتورة (اختياري)</Label>
            <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="خصم الفاتورة" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving || wouldOverpay}>
            {saving ? "جارٍ الحفظ…" : "حفظ التعديل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
