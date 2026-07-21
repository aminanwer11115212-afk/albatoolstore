import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  credit_consumption_not_refundable: "قيود استهلاك الرصيد الدائن لا تُسترجَع من هنا",
  no_linked_invoice: "الدفعة غير مرتبطة بفاتورة",
  invoice_not_found: "الفاتورة غير موجودة",
  invoice_cancelled: "الفاتورة ملغاة",
  invalid_amount: "المبلغ غير صالح",
  invalid_discount: "الخصم غير صالح",
  paid_would_be_negative: "المدفوع سيصبح سالباً",
  would_overpay: "المبلغ يتجاوز إجمالي الفاتورة — استخدم شاشة الدفعة لتحويل الفائض إلى رصيد دائن",
  refund_exceeds_payment: "مبلغ الاسترجاع أكبر من قيمة الدفعة",
  no_customer: "الدفعة غير مرتبطة بعميل",
};

export default function RevisePaymentDialog({ open, tx, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<"edit" | "refund">("edit");
  const [amount, setAmount] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundNote, setRefundNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [inv, setInv] = useState<{ invoice_number: string | null; total: number; paid_amount: number; discount: number } | null>(null);

  useEffect(() => {
    if (!open || !tx) return;
    setMode("edit");
    setAmount(String(tx.amount ?? ""));
    setDiscount("");
    setRefundAmount("");
    setRefundNote("");
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

  const oldAmount = Number(tx.amount || 0);
  const newAmount = Number(amount) || 0;
  const newDiscount = discount === "" ? null : Number(discount) || 0;
  const projectedTotal = inv
    ? Math.max(0, inv.total - ((newDiscount ?? inv.discount) - inv.discount))
    : null;
  const projectedPaid = inv ? inv.paid_amount + (newAmount - oldAmount) : null;
  const wouldOverpay = projectedTotal != null && projectedPaid != null && projectedPaid > projectedTotal + 0.01;

  const refundNum = Number(refundAmount) || 0;
  const refundInvalid = refundNum <= 0 || refundNum > oldAmount + 0.01;

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

  async function handleRefund() {
    if (refundInvalid) return toast.error("مبلغ الاسترجاع غير صالح");
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("refund_payment_to_customer_credit", {
        _tx_id: tx.id,
        _refund_amount: refundNum,
        _note: refundNote || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر الاسترجاع: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      try {
        if (data.invoice_id) {
          const { data: authData } = await supabase.auth.getUser();
          const changedBy = authData?.user?.email || authData?.user?.id || "system";
          await recordInvoiceRevision({
            invoiceId: data.invoice_id,
            action: "payment",
            changedBy,
            changes: {
              refund_to_credit: { amount: refundNum, tx_id: tx.id },
              payment_amount: { before: data.payment_amount_before, after: data.payment_amount_after },
            },
            snapshot: { tx_id: tx.id, refund_group: data.refund_group },
            note: `استرجاع ${refundNum.toLocaleString()} من الدفعة إلى الرصيد الدائن`,
          });
        }
      } catch { /* noop */ }
      toast.success(`تم استرجاع ${refundNum.toLocaleString()} إلى الرصيد الدائن للعميل`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الاسترجاع");
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
            <div>قيمة الدفعة الحالية: <b className="text-foreground">{oldAmount.toLocaleString()}</b></div>
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "refund")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="edit">تعديل المبلغ</TabsTrigger>
            <TabsTrigger value="refund">استرجاع إلى الرصيد الدائن</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-3 pt-3">
            <div>
              <Label className="text-xs">مبلغ الدفعة</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">خصم الفاتورة (اختياري)</Label>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="خصم الفاتورة" />
            </div>
            {projectedPaid != null && projectedTotal != null && (
              <div className={`text-xs ${wouldOverpay ? "text-destructive" : "text-emerald-700"}`}>
                بعد التعديل: مدفوع {projectedPaid.toLocaleString()} من {projectedTotal.toLocaleString()}
                {wouldOverpay ? " (يتجاوز الإجمالي)" : ""}
              </div>
            )}
          </TabsContent>

          <TabsContent value="refund" className="space-y-3 pt-3">
            <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-md p-3">
              يُقلّل مبلغ الدفعة على الفاتورة ويُضيف نفس القيمة كرصيد دائن للعميل — يستخدمه في فواتير قادمة.
              <br />الأثر على صافي رصيد العميل: صفر (يعود الدين ويزيد الرصيد الدائن بنفس المقدار).
            </div>
            <div>
              <Label className="text-xs">مبلغ الاسترجاع</Label>
              <Input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder={`حتى ${oldAmount.toLocaleString()}`}
              />
            </div>
            <div>
              <Label className="text-xs">ملاحظة (اختياري)</Label>
              <Input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="سبب الاسترجاع" />
            </div>
            {refundNum > 0 && !refundInvalid && (
              <div className="text-xs text-emerald-700">
                الدفعة ستصبح: {(oldAmount - refundNum).toLocaleString()} · رصيد دائن جديد: +{refundNum.toLocaleString()}
              </div>
            )}
            {refundNum > 0 && refundInvalid && (
              <div className="text-xs text-destructive">مبلغ الاسترجاع يجب أن يكون بين 0 و {oldAmount.toLocaleString()}</div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          {mode === "edit" ? (
            <Button onClick={handleSave} disabled={saving || wouldOverpay}>
              {saving ? "جارٍ الحفظ…" : "حفظ التعديل"}
            </Button>
          ) : (
            <Button onClick={handleRefund} disabled={saving || refundInvalid}>
              {saving ? "جارٍ الاسترجاع…" : "استرجاع للرصيد الدائن"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
