import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { recordInvoiceRevision } from "@/utils/invoiceRevisions";
import { useUserRole } from "@/hooks/useUserRole";

export type EditablePayment = {
  id: string;
  amount: number;
  reference_id: string | null;
  customer_id?: string | null;
  description?: string | null;
  method?: string | null;
  account_id?: string | null;
  date?: string | null;
};

interface Props {
  open: boolean;
  tx: EditablePayment | null;
  onClose: () => void;
  onSaved?: () => void;
}

const REASONS: Record<string, string> = {
  unauthorized_admin_only: "التعديل مسموح لمدير النظام فقط",
  unauthenticated: "غير مُصرَّح — سجّل الدخول",
  tx_not_found: "الدفعة غير موجودة",
  not_a_payment: "هذا القيد ليس دفعة قابلة للتعديل",
  credit_consumption_not_editable: "قيود استهلاك الرصيد الدائن لا تُعدَّل من هنا",
  credit_consumption_not_refundable: "قيود استهلاك الرصيد الدائن لا تُسترجَع من هنا",
  credit_consumption_not_cancellable: "قيود استهلاك الرصيد الدائن لا تُلغى من هنا",
  no_linked_invoice: "الدفعة غير مرتبطة بفاتورة",
  invoice_not_found: "الفاتورة غير موجودة",
  invoice_cancelled: "الفاتورة ملغاة",
  invalid_amount: "المبلغ غير صالح",
  invalid_discount: "الخصم غير صالح",
  paid_would_be_negative: "المدفوع سيصبح سالباً",
  would_overpay: "المبلغ يتجاوز إجمالي الفاتورة — استخدم استرجاع للرصيد الدائن أو خصم الفاتورة",
  refund_exceeds_payment: "مبلغ الاسترجاع أكبر من قيمة الدفعة",
  no_customer: "الدفعة غير مرتبطة بعميل",
};

type Account = { id: string; name: string; bank_name: string | null; account_type: string | null };

export default function EditPaymentDialog({ open, tx, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const [mode, setMode] = useState<"edit" | "refund" | "cancel">("edit");
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [accountId, setAccountId] = useState<string | "none">("none");
  const [date, setDate] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [inv, setInv] = useState<{ invoice_number: string | null; total: number; paid_amount: number; discount: number } | null>(null);

  useEffect(() => {
    if (!open || !tx) return;
    setMode("edit");
    setAmount(String(tx.amount ?? ""));
    setDiscount("");
    setMethod(tx.method || "cash");
    setAccountId((tx.account_id as any) || "none");
    setDate(tx.date || new Date().toISOString().slice(0, 10));
    setReferenceNo("");
    setNote("");
    setRefundAmount("");
    setRefundNote("");
    setCancelReason("");
    setInv(null);

    (async () => {
      const { data } = await supabase.from("accounts").select("id,name,bank_name,account_type").order("name");
      setAccounts((data as Account[]) || []);
    })();

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
  const projectedTotal = inv ? Math.max(0, inv.total - ((newDiscount ?? inv.discount) - inv.discount)) : null;
  const projectedPaid = inv ? inv.paid_amount + (newAmount - oldAmount) : null;
  const wouldOverpay = projectedTotal != null && projectedPaid != null && projectedPaid > projectedTotal + 0.01;

  const refundNum = Number(refundAmount) || 0;
  const refundInvalid = refundNum <= 0 || refundNum > oldAmount + 0.01;

  const filteredAccounts = method === "bank" || method === "bank_transfer"
    ? accounts.filter((a) => a.account_type === "bank")
    : accounts;

  async function invalidateAll() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["transactionsWithAccounts"] }),
      qc.invalidateQueries({ queryKey: ["accounts"] }),
      qc.invalidateQueries({ queryKey: ["customers"] }),
      qc.invalidateQueries({ queryKey: ["invoices"] }),
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] }),
      qc.invalidateQueries({ queryKey: ["activity-log"] }),
      tx?.customer_id ? qc.invalidateQueries({ queryKey: ["customer", tx.customer_id] }) : Promise.resolve(),
      tx?.customer_id ? qc.invalidateQueries({ queryKey: ["customer-audit-log", tx.customer_id] }) : Promise.resolve(),
    ]);
  }

  async function handleSave() {
    if (!isAdmin) return toast.error(REASONS.unauthorized_admin_only);
    if (newAmount < 0) return toast.error("المبلغ غير صالح");
    if (wouldOverpay) return toast.error(REASONS.would_overpay, { duration: 6000 });
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("revise_invoice_payment", {
        _tx_id: tx.id,
        _new_amount: newAmount,
        _new_discount: newDiscount,
        _new_method: method || null,
        _new_account_id: accountId === "none" ? null : accountId,
        _new_date: date || null,
        _new_reference_no: referenceNo || null,
        _new_note: note || null,
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
          snapshot: {
            tx_id: tx.id, amount_before: data.amount_before, amount_after: data.amount_after,
            method, account_id: accountId === "none" ? null : accountId, date, reference_no: referenceNo, note,
          },
          note: `تعديل دفعة ${data.amount_before} → ${data.amount_after}${note ? " — " + note : ""}`,
        });
      } catch { /* audit is non-critical */ }
      await invalidateAll();
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
    if (!isAdmin) return toast.error(REASONS.unauthorized_admin_only);
    if (refundInvalid) return toast.error("مبلغ الاسترجاع غير صالح");
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("refund_payment_to_customer_credit", {
        _tx_id: tx.id, _refund_amount: refundNum, _note: refundNote || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر الاسترجاع: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      await invalidateAll();
      toast.success(`تم استرجاع ${refundNum.toLocaleString()} إلى الرصيد الدائن للعميل`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الاسترجاع");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!isAdmin) return toast.error(REASONS.unauthorized_admin_only);
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("cancel_invoice_payment", {
        _tx_id: tx.id, _reason: cancelReason || null,
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(REASONS[data?.reason] || `تعذّر الإلغاء: ${data?.reason || "خطأ غير معروف"}`);
        return;
      }
      await invalidateAll();
      toast.success(`تم إلغاء الدفعة (${Number(data.amount_cancelled || 0).toLocaleString()}) وإعادة حساب الرصيد`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الإلغاء");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل الدفعة{inv?.invoice_number ? ` — فاتورة ${inv.invoice_number}` : ""}</DialogTitle>
        </DialogHeader>

        {!isAdmin && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
            التعديل مسموح لمدير النظام فقط.
          </div>
        )}

        {inv && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 space-y-1">
            <div>إجمالي الفاتورة الحالي: <b className="text-foreground">{inv.total.toLocaleString()}</b></div>
            <div>المدفوع الحالي: <b className="text-foreground">{inv.paid_amount.toLocaleString()}</b></div>
            <div>قيمة الدفعة الحالية: <b className="text-foreground">{oldAmount.toLocaleString()}</b></div>
          </div>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="edit">تعديل</TabsTrigger>
            <TabsTrigger value="refund">استرجاع للرصيد</TabsTrigger>
            <TabsTrigger value="cancel">إلغاء كامل</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">المبلغ</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">طريقة الدفع</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="bank">تحويل بنكي</SelectItem>
                    <SelectItem value="mobile">محفظة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">الحساب المستلم</Label>
                <Select value={accountId} onValueChange={(v) => setAccountId(v as any)}>
                  <SelectTrigger><SelectValue placeholder="— اختر —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون —</SelectItem>
                    {filteredAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.bank_name ? `${a.bank_name} — ${a.name}` : a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">رقم العملية</Label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="اختياري" />
              </div>
              <div>
                <Label className="text-xs">خصم الفاتورة</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="اختياري" />
              </div>
            </div>
            <div>
              <Label className="text-xs">ملاحظة</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب التعديل / ملاحظة" />
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
              يُقلّل مبلغ الدفعة على الفاتورة ويُضيف نفس القيمة كرصيد دائن للعميل.
            </div>
            <div>
              <Label className="text-xs">مبلغ الاسترجاع</Label>
              <Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={`حتى ${oldAmount.toLocaleString()}`} />
            </div>
            <div>
              <Label className="text-xs">ملاحظة</Label>
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

          <TabsContent value="cancel" className="space-y-3 pt-3">
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
              سيتم حذف قيد الدفعة كلياً وإنقاص المدفوع على الفاتورة بمقدار {oldAmount.toLocaleString()}.
              العملية لا يمكن التراجع عنها — استخدم «استرجاع للرصيد» إذا كنت ترغب بالإبقاء على المبلغ للعميل.
            </div>
            <div>
              <Label className="text-xs">سبب الإلغاء</Label>
              <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="اذكر السبب للسجل" />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          {mode === "edit" && (
            <Button onClick={handleSave} disabled={saving || wouldOverpay || !isAdmin}>
              {saving ? "جارٍ الحفظ…" : "حفظ التعديل"}
            </Button>
          )}
          {mode === "refund" && (
            <Button onClick={handleRefund} disabled={saving || refundInvalid || !isAdmin}>
              {saving ? "جارٍ الاسترجاع…" : "استرجاع للرصيد الدائن"}
            </Button>
          )}
          {mode === "cancel" && (
            <Button variant="destructive" onClick={handleCancel} disabled={saving || !isAdmin}>
              {saving ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
