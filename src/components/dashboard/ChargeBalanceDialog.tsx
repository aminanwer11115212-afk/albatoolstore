import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { validateBankTransferPayment, isAllowedBank } from "@/lib/bankTransferValidation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialogSize } from "@/hooks/useDialogSize";
import { startsWithAny } from "@/utils/searchMatch";
import { openWhatsApp } from "@/utils/whatsapp";

type Customer = { id: string; name: string; phone: string | null; balance: number | null };
type Account = { id: string; name: string; bank_name: string | null; account_type: string | null };
type DueInvoice = { id: string; invoice_number: string; date: string; total: number | null; paid_amount: number | null; due_amount: number | null };

type Method = "cash" | "card" | "bank_transfer";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

export default function ChargeBalanceDialog({ open, onOpenChange, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [dueInvoices, setDueInvoices] = useState<DueInvoice[]>([]);
  const [loadingDues, setLoadingDues] = useState(false);

  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>("cash");
  const [accountId, setAccountId] = useState<string>("");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [showCustomerSugg, setShowCustomerSugg] = useState(false);
  const { dlgRef, dlgStyle } = useDialogSize("charge_balance_dialog", open, { w: "min(680px, 96vw)", h: "auto" });

  // Load customers + cash/bank accounts when opened
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: cs }, { data: accs }] = await Promise.all([
        supabase.from("customers").select("id,name,phone,balance").order("name"),
        supabase.from("accounts").select("id,name,bank_name,account_type").order("name"),
      ]);
      setCustomers((cs || []) as Customer[]);
      setBankAccounts((accs || []) as Account[]);
      const defaultAcc = (accs || []).find((a: any) => a.is_default) || (accs || [])[0];
      if (defaultAcc) setAccountId((defaultAcc as any).id);
    })();
  }, [open]);

  // Load unpaid invoices when customer changes
  useEffect(() => {
    if (!customerId) { setDueInvoices([]); return; }
    (async () => {
      setLoadingDues(true);
      const { data } = await supabase
        .from("invoices")
        .select("id,invoice_number,date,total,paid_amount,due_amount")
        .eq("customer_id", customerId)
        .order("date", { ascending: true });
      const dues = (data || [])
        .map((i: any) => ({
          ...i,
          due_amount: Number(i.due_amount ?? (Number(i.total || 0) - Number(i.paid_amount || 0))),
        }))
        .filter((i: any) => Number(i.due_amount) > 0.001);
      setDueInvoices(dues as DueInvoice[]);
      setLoadingDues(false);
    })();
  }, [customerId]);

  const totalDue = useMemo(
    () => dueInvoices.reduce((s, i) => s + Number(i.due_amount || 0), 0),
    [dueInvoices],
  );

  // Show how the entered amount will be allocated (FIFO preview)
  const allocationPreview = useMemo(() => {
    let remaining = Number(amount) || 0;
    const out: { invoice_number: string; applied: number }[] = [];
    for (const inv of dueInvoices) {
      if (remaining <= 0) break;
      const applied = Math.min(remaining, Number(inv.due_amount || 0));
      out.push({ invoice_number: inv.invoice_number, applied });
      remaining -= applied;
    }
    return { items: out, leftover: remaining };
  }, [amount, dueInvoices]);

  const bankOnly = bankAccounts.filter((a) => (a.account_type || "").toLowerCase() === "bank" && isAllowedBank(a));
  const cashOnly = bankAccounts.filter((a) => (a.account_type || "").toLowerCase() !== "bank");

  function reset() {
    setCustomerId(""); setCustomerSearch(""); setAmount(""); setMethod("cash");
    setBankAccountId(""); setReferenceNo(""); setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
  }

  // (تمت إزالة إنشاء رابط المشاركة من رسالة شحن الرصيد — يبقى رابط العميل في كشف الحساب فقط.)


  async function handleSave(sendWhatsApp: boolean = false) {
    if (!customerId) return toast.error("اختر العميل");
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("أدخل مبلغاً صحيحاً");
    if (method === "bank_transfer") {
      const selectedAcc = bankAccounts.find((a) => a.id === bankAccountId);
      const err = validateBankTransferPayment({ method: "bank_transfer", account: selectedAcc, referenceNo });
      if (err) return toast.error(err);
    }

    setSaving(true);
    try {
      const targetAccountId = method === "bank_transfer" ? bankAccountId : (accountId || null);

      // ── حساب توزيع FIFO قبل التنفيذ ──
      const allocItems: { invoice_id: string; invoice_number: string; applied: number }[] = [];
      let remaining = amt;
      for (const inv of dueInvoices) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, Number(inv.due_amount || 0));
        allocItems.push({ invoice_id: inv.id, invoice_number: inv.invoice_number, applied });
        remaining -= applied;
      }
      const leftover = Math.max(0, remaining);
      const balanceBefore = Number(selectedCustomer?.balance || totalDue || 0);
      const balanceAfter = Math.max(0, balanceBefore - (amt - leftover));

      const description =
        method === "bank_transfer"
          ? `شحن رصيد - تحويل بنكي - إشعار: ${referenceNo}${notes ? ` - ${notes}` : ""}`
          : `شحن رصيد - ${method === "cash" ? "نقدي" : "بطاقة"}${notes ? ` - ${notes}` : ""}`;

      // 1) Insert payment transaction (with allocation snapshot)
      const { data: txRow, error: txErr } = await supabase
        .from("transactions")
        .insert({
          type: "income",
          category: "payment",
          amount: amt,
          credit: amt,
          method,
          date,
          customer_id: customerId,
          account_id: targetAccountId,
          description,
          allocation: {
            items: allocItems.map((x) => ({ invoice_number: x.invoice_number, applied: x.applied })),
            leftover,
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            method,
          },
        } as any)
        .select("id")
        .single();
      if (txErr) throw txErr;
      const txId = (txRow as any)?.id as string | undefined;

      // 2) FIFO allocate to oldest unpaid invoices
      for (const a of allocItems) {
        const inv = dueInvoices.find((d) => d.id === a.invoice_id)!;
        const newPaid = Number(inv.paid_amount || 0) + a.applied;
        const newDue = Math.max(0, Number(inv.total || 0) - newPaid);
        const newStatus = newDue <= 0.001 ? "paid" : "partial";
        await supabase.from("invoices")
          .update({ paid_amount: newPaid, due_amount: newDue, status: newStatus })
          .eq("id", inv.id);
      }

      // 3) رصيد العميل يُعاد حسابه تلقائياً عبر trigger trg_invoices_recompute_cust_balance.

      // اقرأ الرصيد الفعلي بعد التريغر لمعرفة صافي المتبقي (لكلا الزرين)
      const { data: freshCust } = await supabase
        .from("customers")
        .select("balance, credit_balance")
        .eq("id", customerId)
        .maybeSingle();
      const fBal = Number((freshCust as any)?.balance || 0);
      const fCred = Number((freshCust as any)?.credit_balance || 0);
      const net = fBal - fCred;
      const netLine =
        net > 0.001
          ? `صافي المتبقي: ${net.toLocaleString()}`
          : net < -0.001
            ? `رصيد دائن: ${Math.abs(net).toLocaleString()}`
            : `الحساب مسدّد بالكامل`;

      toast.success(`تم شحن ${amt.toLocaleString()} بنجاح`, {
        description: netLine,
      });

      // 4) (اختياري) رسالة واتساب نصية مختصرة — بدون أي روابط للعميل
      if (sendWhatsApp && txId) {
        if (!selectedCustomer?.phone) {
          toast.info("لا يوجد رقم واتساب للعميل — لم تُرسل الرسالة.");
        } else {
          const [yy, mm, dd] = date.split("-");
          const dateFmt = `${dd}/${mm}/${yy}`;
          const msg = [
            `مرحبا ${selectedCustomer.name}`,
            `الحساب القديم ${balanceBefore.toLocaleString()}`,
            `تم خصم مبلغ ${amt.toLocaleString()}`,
            `المتبقى ${Math.max(0, net).toLocaleString()}`,
            `تاريخ ${dateFmt}`,
          ].join("\n");
          openWhatsApp(selectedCustomer.phone, msg);
        }
      }

      reset();
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dlgRef} style={{ ...dlgStyle, overflowY: "auto" }} dir="rtl">
        <DialogHeader>
          <DialogTitle>شحن رصيد العميل</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer (search input + dropdown suggestions) */}
          <div>
            <Label>العميل</Label>
            <div className="relative">
              <Input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setShowCustomerSugg(true);
                  if (customerId) setCustomerId("");
                }}
                onFocus={() => setShowCustomerSugg(true)}
                onBlur={() => setTimeout(() => setShowCustomerSugg(false), 150)}
                placeholder="ابحث بالاسم أو الهاتف..."
                autoComplete="off"
              />
              {showCustomerSugg && customerSearch.trim() && (
                <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                  {(() => {
                    const q = customerSearch.trim();
                    const matches = customers.filter((c) =>
                      startsWithAny([c.name, c.phone], q),
                    ).slice(0, 50);
                    if (matches.length === 0) {
                      return <div className="px-3 py-2 text-sm text-muted-foreground">لا توجد نتائج</div>;
                    }
                    return matches.map((c) => (
                      <div
                        key={c.id}
                        onMouseDown={() => {
                          setCustomerId(c.id);
                          setCustomerSearch(c.name);
                          setShowCustomerSugg(false);
                        }}
                        className="cursor-pointer px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{c.name}</span>
                          {c.phone && <span className="text-xs text-muted-foreground truncate">{c.phone}</span>}
                        </div>
                        {typeof c.balance === "number" && c.balance !== 0 && (
                          <span className={`text-xs font-mono shrink-0 ${c.balance > 0 ? "text-destructive" : "text-green-600"}`}>
                            {Number(c.balance).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            {selectedCustomer && (
              <div className="text-xs mt-1 text-muted-foreground">
                إجمالي المستحقات: <span className="font-bold text-destructive">{totalDue.toLocaleString()}</span>
                {" "}({dueInvoices.length} فاتورة)
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <Label>المبلغ</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          {/* Date */}
          <div>
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Payment method */}
          <div>
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="card">بطاقة</SelectItem>
                <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cash/card destination account */}
          {method !== "bank_transfer" && (
            <div className="md:col-span-2">
              <Label>الحساب المستلم (اختياري)</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="اختر حساباً..." /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Bank transfer fields */}
          {method === "bank_transfer" && (
            <>
              <div>
                <Label>البنك المحوَّل إليه *</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger><SelectValue placeholder="اختر البنك..." /></SelectTrigger>
                  <SelectContent>
                    {bankOnly.length === 0 && (
                      <SelectItem value="__none__" disabled>لا توجد حسابات بنكية</SelectItem>
                    )}
                    {bankOnly.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.bank_name ? `${a.bank_name} - ${a.name}` : a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>رقم الإشعار البنكي *</Label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="رقم الإشعار / المرجع" />
              </div>
            </>
          )}

          <div className="md:col-span-2">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* FIFO preview */}
          {amount && Number(amount) > 0 && dueInvoices.length > 0 && (
            <div className="md:col-span-2 border border-border rounded-md p-3 bg-muted/40">
              <div className="font-semibold mb-1 text-sm">توزيع تلقائي على الفواتير (الأقدم أولاً):</div>
              <ul className="text-xs space-y-0.5">
                {allocationPreview.items.map((a) => (
                  <li key={a.invoice_number} className="flex justify-between">
                    <span>#{a.invoice_number}</span>
                    <span className="font-mono">{a.applied.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              {allocationPreview.leftover > 0 && (
                <div className="text-xs mt-1 text-amber-600">
                  متبقٍ كرصيد دائن للعميل: {allocationPreview.leftover.toLocaleString()}
                </div>
              )}
            </div>
          )}
          {customerId && !loadingDues && dueInvoices.length === 0 && (
            <div className="md:col-span-2 text-xs text-muted-foreground">
              لا توجد فواتير غير مسددة — سيُضاف المبلغ كرصيد دائن للعميل.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving}
            variant="outline"
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
            title="حفظ الشحن وإرسال رسالة واتساب نصية مختصرة بدون روابط"
          >
            {saving ? "..." : "شحن + واتساب نصي"}
          </Button>
          <Button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white"
            title="حفظ الشحن فقط بدون إرسال أي رسالة"
          >
            {saving ? "جاري الحفظ..." : "شحن الرصيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
