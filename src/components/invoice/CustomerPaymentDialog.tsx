import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts } from "@/hooks/useData";
import {
  validateBankTransferPayment,
  isBankPaymentMethod,
  filterAccountsForPayment,
} from "@/lib/bankTransferValidation";
import { computeInvoiceStatusAfterPayment } from "@/utils/invoiceStatus";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DiscountInput from "@/components/shared/DiscountInput";

type Method = "cash" | "bank" | "card" | "mobile";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  invoiceNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  total: number;
  paidBefore: number;
  /** فاتورة POS (كاش) — يمنع إنشاء transaction مرتبطة بالعميل */
  isPos?: boolean;
  onSaved?: () => void;
}

export default function CustomerPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  customerId,
  customerName,
  total,
  paidBefore,
  isPos,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const { data: accounts } = useAccounts();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const remaining = Math.max(0, Number(total || 0) - Number(paidBefore || 0));

  const [amount, setAmount] = useState<string>(remaining ? String(remaining) : "");
  const [discount, setDiscount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>("cash");
  const [accountId, setAccountId] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  useEffect(() => {
    if (open) {
      setAmount(remaining ? String(remaining) : "");
      setDiscount("");
      setDate(new Date().toISOString().slice(0, 10));
      setMethod("cash");
      setAccountId("");
      setReferenceNo("");
      setNotes("");
    }
  }, [open, remaining]);

  const accountOptions = useMemo(() => {
    const list = (accounts || []) as any[];
    if (method === "bank") return filterAccountsForPayment(list, "bank");
    if (method === "cash") return list.filter((a) => (a.account_type || "cash") === "cash");
    return list;
  }, [accounts, method]);

  useEffect(() => {
    if (!accountId && accountOptions.length > 0) {
      const def = accountOptions.find((a: any) => a.is_default) || accountOptions[0];
      setAccountId(def.id);
    }
    if (accountId && !accountOptions.find((a: any) => a.id === accountId)) {
      setAccountId(accountOptions[0]?.id || "");
    }
  }, [accountOptions]); // eslint-disable-line

  const selectedAccount = (accountOptions as any[]).find((a) => a.id === accountId) || null;

  async function handleSave() {
    if (savingRef.current) {
      toast.info("يتم حفظ الدفعة بالفعل — انتظر لحظة", { id: "cust-pay-inflight" });
      return;
    }
    const n = Number(amount) || 0;
    const disc = Math.max(0, Number(discount) || 0);
    if (n <= 0 && disc <= 0) return toast.error("أدخل مبلغ أو خصم أكبر من صفر");
    if (n > 0 && !accountId) return toast.error("اختر الحساب");
    if (n > 0 && isBankPaymentMethod(method)) {
      const err = validateBankTransferPayment({ method, account: selectedAccount, referenceNo });
      if (err) return toast.error(err);
    }

    savingRef.current = true;
    setSaving(true);
    try {
      // 1) تسجيل transaction (إن كان هناك مبلغ فعلي) — نتجاوزها لفواتير POS بلا عميل
      if (n > 0) {
        const baseNote = notes || (invoiceNumber ? `دفعة على الفاتورة ${invoiceNumber}` : "دفعة من العميل");
        const description = referenceNo ? `${baseNote} — مرجع: ${referenceNo}` : baseNote;
        const txPayload: any = {
          type: "income",
          category: "customer_payment",
          customer_id: isPos ? null : customerId || null,
          account_id: accountId,
          amount: n,
          date,
          method,
          reference_id: invoiceId,
          description,
        };
        const { error: txErr } = await (supabase as any).from("transactions").insert(txPayload);
        if (txErr) throw txErr;
      }

      // 2) قراءة الفاتورة وحساب paid_amount + الخصم الجديد + status
      const { data: inv, error: rErr } = await (supabase as any)
        .from("invoices")
        .select("total, paid_amount, discount, subtotal")
        .eq("id", invoiceId)
        .maybeSingle();
      if (rErr) throw rErr;

      const nextDiscount = Math.max(0, Number(inv?.discount || 0) + disc);
      // إذا أضفنا خصمًا نُخفّض الإجمالي (subtotal ثابت — الإجمالي = subtotal - discount + tax/shipping)
      // نستخدم فرق الخصم فقط لتفادي إعادة حساب الضريبة هنا
      const nextTotal = Math.max(0, Number(inv?.total || 0) - disc);
      const nextPaid = Math.min(nextTotal + 1e6, Number(inv?.paid_amount || 0) + n);
      const nextDue = Math.max(0, nextTotal - nextPaid);
      const nextStatus = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter: nextPaid });

      const updatePayload: any = {
        paid_amount: nextPaid,
        due_amount: nextDue,
        status: nextStatus,
      };
      if (disc > 0) {
        updatePayload.discount = nextDiscount;
        updatePayload.total = nextTotal;
      }

      const { error: upErr } = await (supabase as any)
        .from("invoices")
        .update(updatePayload)
        .eq("id", invoiceId);
      if (upErr) throw upErr;

      toast.success(
        n > 0
          ? `تم تسجيل دفعة ${n.toLocaleString()}${disc > 0 ? ` + خصم ${disc.toLocaleString()}` : ""} — الحالة: ${labelStatus(nextStatus)}`
          : `تم تسجيل خصم ${disc.toLocaleString()}`,
      );

      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactionsWithAccounts"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-full"] });

      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ الدفعة");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            تسجيل دفعة على {invoiceNumber || "الفاتورة"}
            {customerName ? ` — ${customerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="rounded-md bg-muted/50 p-2 text-xs flex justify-between">
            <span>الإجمالي: <b>{Number(total).toLocaleString()}</b></span>
            <span>المدفوع سابقاً: <b>{Number(paidBefore).toLocaleString()}</b></span>
            <span className="text-destructive">المتبقي: <b>{remaining.toLocaleString()}</b></span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المبلغ المدفوع</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <DiscountInput
                label="خصم إضافي (اختياري)"
                value={Number(discount) || 0}
                grandBeforeDiscount={remaining}
                onChange={(v) => setDiscount(v ? String(v) : "")}
                compact
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                  <SelectItem value="mobile">محفظة</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>الحساب</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {(accountOptions as any[]).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}{a.bank_name ? ` — ${a.bank_name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {method === "bank" && (
            <div>
              <Label>رقم العملية (اختياري)</Label>
              <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="مثلاً TRX-1234" />
            </div>
          )}

          <div>
            <Label>ملاحظة</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "حفظ الدفعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function labelStatus(s: string): string {
  switch (s) {
    case "paid": return "مدفوعة";
    case "partial": return "جزئية";
    case "overdue": return "متأخرة";
    case "cancelled": return "ملغاة";
    default: return "معلّقة";
  }
}
