import { useEffect, useMemo, useRef, useState } from "react";
import { useSafeQueryClient as useQueryClient } from "@/lib/safeQueryClient";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts, useSuppliers } from "@/hooks/useData";
import { validateBankTransferPayment, isBankPaymentMethod, filterAccountsForPayment } from "@/lib/bankTransferValidation";
import { refetchAndToastSupplierBalance } from "@/utils/balanceRefreshToast";
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

type Method = "cash" | "bank";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplierId?: string | null;
  supplierName?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  dueAmount?: number | null;
}

export default function SupplierPaymentDialog({
  open,
  onOpenChange,
  supplierId: initialSupplierId,
  supplierName,
  purchaseOrderId,
  purchaseOrderNumber,
  dueAmount,
}: Props) {
  const qc = useQueryClient();
  const { data: accounts } = useAccounts();
  const { data: suppliers } = useSuppliers();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const [supplierId, setSupplierId] = useState<string>(initialSupplierId || "");
  const [amount, setAmount] = useState<string>(dueAmount ? String(dueAmount) : "");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>("cash");
  const [accountId, setAccountId] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // reset on open
  useEffect(() => {
    if (open) {
      const supId = initialSupplierId || "";
      setSupplierId(supId);
      setAmount(dueAmount ? String(dueAmount) : "");
      setDate(new Date().toISOString().slice(0, 10));
      // آخر طريقة دفع لهذا المورد إن وُجدت، وإلا نقدي
      let m: Method = "cash";
      try {
        if (supId) {
          const last = localStorage.getItem(`lov:last-method:sup:${supId}`);
          if (last === "cash" || last === "bank") m = last;
        }
      } catch {}
      setMethod(m);
      setAccountId("");
      setReferenceNo("");
      setNotes("");
    }
  }, [open, initialSupplierId, dueAmount]);

  // account options filtered by method
  const accountOptions = useMemo(() => {
    const list = (accounts || []) as any[];
    if (method === "bank") return filterAccountsForPayment(list, "bank");
    if (method === "cash") {
      const cashOnly = list.filter((a) => (a.account_type || "cash") === "cash");
      return cashOnly.length > 0 ? cashOnly : list;
    }
    return list;
  }, [accounts, method]);

  useEffect(() => {
    if (!accountId && accountOptions.length > 0) {
      if (method === "bank") {
        const jaber = (accountOptions as any[]).find((a) => {
          const s = `${a.name || ""} ${a.bank_name || ""}`;
          return /اولاد\s*جابر|أولاد\s*جابر/.test(s);
        });
        if (jaber) { setAccountId(jaber.id); return; }
        try {
          const last = localStorage.getItem("lov:last-bank-account");
          const match = accountOptions.find((a: any) => a.id === last);
          if (match) { setAccountId(match.id); return; }
        } catch {}
      }
      const def = accountOptions.find((a: any) => a.is_default) || accountOptions[0];
      setAccountId(def.id);
    }
    if (accountId && !accountOptions.find((a: any) => a.id === accountId)) {
      setAccountId(accountOptions[0]?.id || "");
    }
  }, [accountOptions]); // eslint-disable-line

  const selectedAccount = (accountOptions as any[]).find((a) => a.id === accountId) || null;
  const resolvedSupplier = suppliers?.find((s: any) => s.id === (supplierId || initialSupplierId));

  async function handleSave() {
    if (savingRef.current) {
      toast.info("يتم حفظ الدفعة بالفعل — انتظر لحظة", { id: "sup-pay-inflight" });
      return;
    }
    const supId = supplierId || initialSupplierId || "";
    if (!supId) return toast.error("اختر المورد");
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("أدخل مبلغ صحيح أكبر من صفر");
    if (!accountId) return toast.error("اختر الحساب");
    if (isBankPaymentMethod(method)) {
      const err = validateBankTransferPayment({ method, account: selectedAccount, referenceNo });
      if (err) return toast.error(err);
    }

    savingRef.current = true;
    setSaving(true);
    try {
      // 1) إنشاء حركة مصروف (دفعة مورد)
      const baseNote = notes || (purchaseOrderNumber ? `دفعة على أمر الشراء ${purchaseOrderNumber}` : "دفعة للمورد");
      const description = referenceNo ? `${baseNote} — مرجع: ${referenceNo}` : baseNote;
      const txPayload: any = {
        type: "expense",
        category: "supplier_payment",
        supplier_id: supId,
        account_id: accountId,
        amount: n,
        date,
        method,
        reference_id: purchaseOrderId || null,
        description,
      };
      const { error: txErr } = await (supabase as any).from("transactions").insert(txPayload);
      if (txErr) throw txErr;

      // 2) إن كانت مربوطة بأمر شراء: حدّث paid_amount مباشرة (تريجر يعيد حساب رصيد المورد)
      if (purchaseOrderId) {
        const { data: po, error: readErr } = await (supabase as any)
          .from("purchase_orders")
          .select("total, paid_amount")
          .eq("id", purchaseOrderId)
          .maybeSingle();
        if (readErr) throw readErr;
        const nextPaid = Math.min(Number(po?.total || 0), Number(po?.paid_amount || 0) + n);
        const nextDue = Math.max(0, Number(po?.total || 0) - nextPaid);
        const { error: upErr } = await (supabase as any)
          .from("purchase_orders")
          .update({ paid_amount: nextPaid, due_amount: nextDue })
          .eq("id", purchaseOrderId);
        if (upErr) throw upErr;
      }

      if (method === "bank" && accountId) {
        try { localStorage.setItem("lov:last-bank-account", accountId); } catch {}
      }



      toast.success(
        purchaseOrderNumber
          ? `تم تسجيل دفعة ${n.toLocaleString()} على أمر الشراء ${purchaseOrderNumber}`
          : `تم تسجيل دفعة ${n.toLocaleString()} للمورد ${resolvedSupplier?.name || ""}`,
      );

      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactionsWithAccounts"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders-full"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      try { window.dispatchEvent(new Event("suppliers:changed")); } catch {}

      const sid = supplierId || (resolvedSupplier as any)?.id;
      if (sid) refetchAndToastSupplierBalance(sid);

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
            {purchaseOrderNumber
              ? `تسجيل دفعة على ${purchaseOrderNumber}`
              : `تسجيل دفعة للمورد${supplierName ? ` — ${supplierName}` : ""}`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {!initialSupplierId && !purchaseOrderId && (
            <div>
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {(suppliers || []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المبلغ</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
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
