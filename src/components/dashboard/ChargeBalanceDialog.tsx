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
import { netBalanceOf } from "@/utils/balanceDisplay";
import { useQueryClient } from "@tanstack/react-query";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  balance: number | null;
  credit_balance?: number | null;
  net_balance?: number | null;
};
type Account = { id: string; name: string; bank_name: string | null; account_type: string | null };

type Method = "cash" | "card" | "bank_transfer";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

/**
 * شحن رصيد العميل — على مستوى العميل كامل، لا على فواتير محددة.
 *
 * ينشئ حركة واحدة (`customer_credit`) على العميل. تريغر `recompute_customer_balance`
 * يُحدّث `credit_balance` و`net_balance` تلقائياً، فيصبح صافي دين العميل الإجمالي
 * أقل بمقدار المبلغ — بغضّ النظر عن أي فاتورة بعينها.
 */
export default function ChargeBalanceDialog({ open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [customerId, setCustomerId] = useState<string>("");

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

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: cs }, { data: accs }] = await Promise.all([
        supabase.from("customers").select("id,name,phone,balance,credit_balance,net_balance").order("name"),
        supabase.from("accounts").select("id,name,bank_name,account_type").order("name"),
      ]);
      setCustomers((cs || []) as Customer[]);
      setBankAccounts((accs || []) as Account[]);
      const defaultAcc = (accs || []).find((a: any) => a.is_default) || (accs || [])[0];
      if (defaultAcc) setAccountId((defaultAcc as any).id);
      // استرجاع آخر حساب بنكي مستخدَم
      try {
        const lastBank = localStorage.getItem("lov:last-bank-account");
        if (lastBank && (accs || []).some((a: any) => a.id === lastBank && a.account_type === "bank")) {
          setBankAccountId(lastBank);
        }
      } catch {}
    })();
  }, [open]);

  const bankOnly = bankAccounts.filter((a) => (a.account_type || "").toLowerCase() === "bank" && isAllowedBank(a));

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const netBefore = netBalanceOf(selectedCustomer);
  const amt = Number(amount) || 0;
  const netAfter = netBefore - amt;

  const whatsappPreview = useMemo(() => {
    if (!selectedCustomer) return "";
    const [yy, mm, dd] = (date || "").split("-");
    const dateFmt = yy && mm && dd ? `${dd}/${mm}/${yy}` : date;
    // ملاحظة: لا نعرض سطر "المتبقي" في رسالة شحن الرصيد بناءً على طلب المستخدم.
    return [
      `مرحبا ${selectedCustomer.name}`,
      `تم شحن مبلغ ${amt.toLocaleString()}`,
      `التاريخ ${dateFmt}`,
    ].join("\n");
  }, [selectedCustomer, amt, date]);

  function reset() {
    setCustomerId(""); setCustomerSearch(""); setAmount(""); setMethod("cash");
    setBankAccountId(""); setReferenceNo(""); setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
  }

  async function handleSave(sendWhatsApp: boolean = false) {
    if (!customerId) return toast.error("اختر العميل");
    if (!amt || amt <= 0) return toast.error("أدخل مبلغاً صحيحاً");
    if (method === "bank_transfer") {
      const selectedAcc = bankAccounts.find((a) => a.id === bankAccountId);
      const err = validateBankTransferPayment({ method: "bank_transfer", account: selectedAcc, referenceNo });
      if (err) return toast.error(err);
    }

    setSaving(true);
    try {
      const targetAccountId = method === "bank_transfer" ? bankAccountId : (accountId || null);
      const description =
        method === "bank_transfer"
          ? `شحن رصيد - تحويل بنكي - إشعار: ${referenceNo}${notes ? ` - ${notes}` : ""}`
          : `شحن رصيد - ${method === "cash" ? "نقدي" : "بطاقة"}${notes ? ` - ${notes}` : ""}`;

      // حركة واحدة على مستوى العميل — التريغر يُحدّث credit_balance و net_balance تلقائياً
      const { error: txErr } = await supabase.from("transactions").insert({
        type: "income",
        category: "customer_credit",
        amount: amt,
        credit: amt,
        method,
        date,
        customer_id: customerId,
        account_id: targetAccountId,
        description,
      } as any);
      if (txErr) throw txErr;

      // احفظ آخر حساب بنكي مستخدَم للاسترجاع لاحقًا
      if (method === "bank_transfer" && bankAccountId) {
        try { localStorage.setItem("lov:last-bank-account", bankAccountId); } catch {}
      }

      // ملاحظة: لا نعرض "المتبقي" في رسالة شحن الرصيد بناءً على طلب المستخدم
      toast.success(`تم شحن ${amt.toLocaleString()} بنجاح`);

      if (sendWhatsApp) {
        if (!selectedCustomer?.phone) {
          toast.info("لا يوجد رقم واتساب للعميل — لم تُرسل الرسالة.");
        } else {
          openWhatsApp(selectedCustomer.phone, whatsappPreview);
        }
      }

      reset();
      // أبطل الكاش وأبلغ باقي الشاشات (InvoiceCreate/QuoteCreate/StockReturn) فوراً
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactionsWithAccounts"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      try { window.dispatchEvent(new Event("customers:changed")); } catch {}
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dlgRef} style={{ ...dlgStyle, overflowY: "auto" }} dir="rtl">
        <DialogHeader>
          <DialogTitle>شحن رصيد العميل</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer */}
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
                    return matches.map((c) => {
                      const net = netBalanceOf(c);
                      return (
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
                          {net !== 0 && (
                            <span className={`text-xs font-mono shrink-0 ${net > 0 ? "text-destructive" : "text-emerald-600"}`}>
                              {net > 0 ? "عليه " : "له "}{Math.abs(net).toLocaleString()}
                            </span>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
            {selectedCustomer && (
              <div className="text-xs mt-1">
                {netBefore > 0 && (
                  <span className="text-muted-foreground">
                    صافي الحساب: <span className="font-bold text-destructive">عليه {netBefore.toLocaleString()}</span>
                  </span>
                )}
                {netBefore < 0 && (
                  <span className="text-muted-foreground">
                    صافي الحساب: <span className="font-bold text-emerald-600">له {Math.abs(netBefore).toLocaleString()}</span>
                  </span>
                )}
                {netBefore === 0 && <span className="text-muted-foreground">الحساب مسوّى</span>}
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

          {/* Net balance preview */}
          {selectedCustomer && amt > 0 && (
            <div className="md:col-span-2 border border-border rounded-md p-3 bg-muted/40 text-sm">
              <div className="font-semibold mb-1">أثر الشحن على صافي حساب العميل:</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-muted-foreground">قبل</div>
                  <div className={`font-bold tabular-nums ${netBefore > 0 ? "text-destructive" : netBefore < 0 ? "text-emerald-600" : ""}`}>
                    {netBefore > 0 ? `عليه ${netBefore.toLocaleString()}` : netBefore < 0 ? `له ${Math.abs(netBefore).toLocaleString()}` : "مسوّى"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">الشحن</div>
                  <div className="font-bold text-primary tabular-nums">{amt.toLocaleString()}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground">بعد</div>
                  <div className={`font-bold tabular-nums ${netAfter > 0 ? "text-destructive" : netAfter < 0 ? "text-emerald-600" : ""}`}>
                    {netAfter > 0 ? `عليه ${netAfter.toLocaleString()}` : netAfter < 0 ? `له ${Math.abs(netAfter).toLocaleString()}` : "مسوّى"}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2">
                يُطبَّق الشحن على مجموع حساب العميل — لا يُوزَّع على فواتير بعينها.
              </div>
            </div>
          )}

          {/* WhatsApp message preview */}
          {whatsappPreview && (
            <div className="md:col-span-2 border border-emerald-600/40 rounded-md p-3 bg-emerald-50/60 dark:bg-emerald-950/30">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm text-emerald-800 dark:text-emerald-200">
                  معاينة رسالة الواتساب
                </div>
                {selectedCustomer?.phone ? (
                  <span className="text-xs text-muted-foreground font-mono">{selectedCustomer.phone}</span>
                ) : (
                  <span className="text-xs text-amber-600">لا يوجد رقم واتساب للعميل</span>
                )}
              </div>
              <pre className="text-xs whitespace-pre-wrap font-sans leading-6 text-foreground">
{whatsappPreview}
              </pre>
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
            title="حفظ الشحن وإرسال رسالة واتساب"
          >
            {saving ? "..." : "شحن + واتساب"}
          </Button>
          <Button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 text-white"
            title="حفظ الشحن فقط"
          >
            {saving ? "جاري الحفظ..." : "شحن الرصيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
