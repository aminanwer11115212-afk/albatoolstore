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
import { splitPayment } from "@/utils/overpayment";
import { logDiscountEvent } from "@/utils/discountAuditLogger";
import { refetchAndToastCustomerBalance } from "@/utils/balanceRefreshToast";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { useUserRole } from "@/hooks/useUserRole";
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
  const { data: accounts, isLoading: accountsLoading, isError: accountsError, refetch: refetchAccounts } = useAccounts();
  const { isAdmin, permissions } = useUserRole();
  const canRecordPayment = isAdmin || permissions.record_payment !== false;
  const canApplyDiscount = isAdmin || permissions.apply_discount !== false;
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const remaining = Math.max(0, Number(total || 0) - Number(paidBefore || 0));

  const [amount, setAmount] = useState<string>(remaining ? String(remaining) : "");
  const [discount, setDiscount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>("bank");
  const [accountId, setAccountId] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [custBalance, setCustBalance] = useState<{ debt: number; credit: number } | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(remaining ? String(remaining) : "");
      setDiscount("");
      setDate(new Date().toISOString().slice(0, 10));
      setMethod("bank");
      setAccountId("");
      setReferenceNo("");
      setNotes("");
      setCustBalance(null);
      // اجلب رصيد العميل الحالي (له/عليه) عند فتح الحوار
      if (customerId && !isPos) {
        (async () => {
          const { data } = await supabase.from("customers").select("balance, credit_balance").eq("id", customerId).maybeSingle();
          if (data) {
            setCustBalance({
              debt: Number((data as any).balance || 0),
              credit: Number((data as any).credit_balance || 0),
            });
          }
        })();
      }
    }
  }, [open, remaining, customerId, isPos]);

  const accountOptions = useMemo(() => {
    const list = (accounts || []) as any[];
    if (method === "bank") return filterAccountsForPayment(list, "bank");
    if (method === "cash") return list.filter((a) => (a.account_type || "cash") === "cash");
    return list;
  }, [accounts, method]);

  // ثبّت الحساب البنكي المختار عبر إغلاق/فتح الحوار وتبديل الطريقة
  useEffect(() => {
    if (accountOptions.length === 0) return;
    const storageKey = method === "bank" ? "lov:last-bank-account" : `lov:last-account:${method}`;
    if (!accountId) {
      // فضّل حساب "أولاد جابر" افتراضياً للتحويلات البنكية
      const jaber = (accountOptions as any[]).find((a) => {
        const s = `${a.name || ""} ${a.bank_name || ""}`;
        return /اولاد\s*جابر|أولاد\s*جابر/.test(s);
      });
      if (method === "bank" && jaber) { setAccountId(jaber.id); return; }
      try {
        const last = localStorage.getItem(storageKey);
        const match = accountOptions.find((a: any) => a.id === last);
        if (match) { setAccountId(match.id); return; }
      } catch {}
      const def = accountOptions.find((a: any) => a.is_default) || accountOptions[0];
      setAccountId(def.id);
      return;
    }
    if (!accountOptions.find((a: any) => a.id === accountId)) {
      setAccountId(accountOptions[0]?.id || "");
    }
  }, [accountOptions, method]); // eslint-disable-line

  // احفظ الحساب المختار فور تغييره — لا ننتظر الحفظ لتثبيت الاختيار
  useEffect(() => {
    if (!accountId) return;
    const storageKey = method === "bank" ? "lov:last-bank-account" : `lov:last-account:${method}`;
    try { localStorage.setItem(storageKey, accountId); } catch {}
  }, [accountId, method]);

  const selectedAccount = (accountOptions as any[]).find((a) => a.id === accountId) || null;

  const jaberAccount = useMemo(() => {
    return (accountOptions as any[]).find((a) => {
      const s = `${a.name || ""} ${a.bank_name || ""}`;
      return /اولاد\s*جابر|أولاد\s*جابر/.test(s);
    }) || null;
  }, [accountOptions]);

  function requestSave() {
    const n = Number(amount) || 0;
    const disc = Math.max(0, Number(discount) || 0);
    if (n < 0 || (Number(discount) || 0) < 0) return toast.error("لا يُسمح بقيم سالبة");
    if (n <= 0 && disc <= 0) return toast.error("أدخل مبلغ أو خصم أكبر من صفر");
    // صلاحيات: منع تسجيل مبلغ عام أو خصم لغير المخولين
    const rem = Math.max(0, remaining - disc);
    const generalAmount = Math.max(0, n - rem); // أي فائض عن المتبقي = مبلغ عام (رصيد دائن)
    if (generalAmount > 0.01 && !canRecordPayment) {
      return toast.error("ليست لديك صلاحية تسجيل مبلغ عام (فائض/رصيد دائن) — تواصل مع المسؤول");
    }
    if (disc > 0 && !canApplyDiscount) {
      return toast.error("ليست لديك صلاحية تطبيق خصم إضافي — تواصل مع المسؤول");
    }
    if (n > 0 && !accountId) return toast.error("اختر الحساب");
    if (n > 0 && isBankPaymentMethod(method)) {
      const err = validateBankTransferPayment({ method, account: selectedAccount, referenceNo });
      if (err) return toast.error(err);
    }
    setConfirmOpen(true);
  }

  async function handleSave() {
    if (savingRef.current) {
      toast.info("يتم حفظ الدفعة بالفعل — انتظر لحظة", { id: "cust-pay-inflight" });
      return;
    }
    const n = Number(amount) || 0;
    const disc = Math.max(0, Number(discount) || 0);

    savingRef.current = true;
    setSaving(true);
    try {
      // 1) قراءة الفاتورة الحالية قبل تسجيل أي شيء
      const { data: inv, error: rErr } = await (supabase as any)
        .from("invoices")
        .select("total, paid_amount, discount, subtotal")
        .eq("id", invoiceId)
        .maybeSingle();
      if (rErr) throw rErr;

      // الخصم الإضافي يُخفّض إجمالي الفاتورة قبل حساب التقسيم
      const nextDiscount = Math.max(0, Number(inv?.discount || 0) + disc);
      const nextTotal = Math.max(0, Number(inv?.total || 0) - disc);
      const alreadyPaid = Number(inv?.paid_amount || 0);

      // 2) تقسيم الدفعة: applied يقفل الفاتورة، overpay يُسجَّل كرصيد دائن للعميل
      const split = splitPayment({ amount: n, total: nextTotal, alreadyPaid });
      const nextStatus = computeInvoiceStatusAfterPayment({ total: nextTotal, paidAfter: split.newPaid });

      // 3) تسجيل transaction الدفعة (الجزء المطبَّق على الفاتورة)
      if (split.applied > 0) {
        const baseNote = notes || (invoiceNumber ? `دفعة على الفاتورة ${invoiceNumber}` : "دفعة من العميل");
        const description = referenceNo ? `${baseNote} — مرجع: ${referenceNo}` : baseNote;
        const { error: txErr } = await (supabase as any).from("transactions").insert({
          type: "income",
          category: "customer_payment",
          customer_id: isPos ? null : customerId || null,
          account_id: accountId,
          amount: split.applied,
          date,
          method,
          reference_id: invoiceId,
          description,
        });
        if (txErr) throw txErr;
      }

      // 4) تسجيل الفائض كـ customer_credit (رصيد دائن على مستوى العميل — لا يُربط بفاتورة)
      //    يلتقطه recompute_customer_balance تلقائياً ويُحدّث customers.credit_balance و net_balance.
      if (split.overpay > 0 && !isPos && customerId) {
        const { error: cErr } = await (supabase as any).from("transactions").insert({
          type: "income",
          category: "customer_credit",
          customer_id: customerId,
          account_id: accountId,
          amount: split.overpay,
          date,
          method,
          description: `فائض دفعة${invoiceNumber ? ` من الفاتورة ${invoiceNumber}` : ""} — رصيد دائن`,
        });
        if (cErr) throw cErr;
      }

      // 5) تحديث الفاتورة
      const updatePayload: any = {
        paid_amount: split.newPaid,
        due_amount: split.newDue,
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

      if (method === "bank" && accountId) {
        try { localStorage.setItem("lov:last-bank-account", accountId); } catch {}
      }

      const parts: string[] = [];
      if (split.applied > 0) parts.push(`دفعة ${split.applied.toLocaleString()}`);
      if (split.overpay > 0) parts.push(`رصيد دائن ${split.overpay.toLocaleString()}`);
      if (disc > 0) parts.push(`خصم ${disc.toLocaleString()}`);
      toast.success(
        (parts.length ? `تم تسجيل ${parts.join(" + ")}` : "تم التسجيل") +
          ` — الحالة: ${labelStatus(nextStatus)}`,
      );

      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactionsWithAccounts"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-full"] });
      try { window.dispatchEvent(new Event("customers:changed")); } catch {}

      // audit + balance-refresh toast (fire-and-forget so UX stays snappy)
      if (customerId && !isPos) {
        const prevNet = custBalance
          ? netBalanceOf({ balance: custBalance.debt, credit_balance: custBalance.credit })
          : null;
        if (disc > 0) {
          logDiscountEvent({
            entity_type: "invoice",
            entity_id: invoiceId,
            entity_number: invoiceNumber || null,
            customer_id: customerId,
            discount_before: Number(inv?.discount || 0),
            discount_added: disc,
            discount_after: nextDiscount,
            total_before: Number(inv?.total || 0),
            total_after: nextTotal,
            balance_before: prevNet,
            balance_after: prevNet !== null ? prevNet - disc : null,
            source: "customer_payment_dialog",
            note: notes || null,
          });
        }
        refetchAndToastCustomerBalance(customerId, { previousNet: prevNet });
      }

      onSaved?.();
      setConfirmOpen(false);
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
          {!isPos && (() => {
            const debt = custBalance?.debt || 0;
            const credit = custBalance?.credit || 0;
            const net = debt - credit;
            // Positive net => customer owes us (عليه). Negative => we owe customer (له). Zero => خالص
            const isSettled = Math.abs(net) < 0.01;
            const isCredit = net < -0.01; // customer has money with us / we owe him → green
            const label = isSettled ? "خالص" : isCredit ? "له" : "عليه";
            const cls = isSettled
              ? "border-border bg-muted/40 text-muted-foreground"
              : isCredit
                ? "border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
                : "border-destructive/40 bg-destructive/5 text-destructive";
            return (
              <div className={`rounded-md border p-2 text-xs flex items-center justify-between ${cls}`}>
                <span>حساب العميل: <b>{label}{isSettled ? "" : ` ${Math.abs(net).toLocaleString()}`}</b></span>
                {credit > 0.01 && !isSettled && isCredit && (
                  <button
                    type="button"
                    className="text-primary underline text-[11px]"
                    onClick={() => setAmount(String(Math.min(remaining, Number(amount) || 0) + credit))}
                    title="أضف كامل الرصيد الدائن إلى المبلغ"
                  >
                    + استخدام الرصيد الدائن ({credit.toLocaleString()})
                  </button>
                )}
              </div>
            );
          })()}

          {/* ملخص أرقام الفاتورة + حساب العميل */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border bg-muted/40 p-2 text-center">
              <div className="text-[11px] text-muted-foreground">الإجمالي</div>
              <div className="font-bold">{Number(total).toLocaleString()}</div>
            </div>
            <div className="rounded-md border bg-muted/40 p-2 text-center">
              <div className="text-[11px] text-muted-foreground">المدفوع</div>
              <div className="font-bold">{Number(paidBefore).toLocaleString()}</div>
            </div>
            <div className="rounded-md border bg-muted/40 p-2 text-center">
              <div className="text-[11px] text-muted-foreground">خصم إضافي</div>
              <div className="font-bold">{(Number(discount) || 0).toLocaleString()}</div>
            </div>
            <div className="rounded-md border bg-destructive/5 border-destructive/40 p-2 text-center">
              <div className="text-[11px] text-muted-foreground">المتبقي</div>
              <div className="font-bold text-destructive">
                {Math.max(0, remaining - (Number(discount) || 0)).toLocaleString()}
              </div>
            </div>
          </div>

          {(() => {
            const n = Number(amount) || 0;
            const rem = Math.max(0, remaining - (Number(discount) || 0));
            const excess = Math.max(0, n - rem);
            if (excess <= 0) return null;
            return (
              <div className="rounded-md border border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 text-xs text-emerald-800 dark:text-emerald-200">
                فائض <b>{excess.toLocaleString()}</b> سيُودَع كرصيد دائن للعميل
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المبلغ المدفوع</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={amount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || Number(v) >= 0) setAmount(v);
                }}
                placeholder="0.00"
                disabled={!canRecordPayment && Number(amount || 0) > remaining}
              />
              {!canRecordPayment && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  لا يمكنك تسجيل مبلغ يتجاوز المتبقي (صلاحية «تسجيل مبلغ عام» مطلوبة)
                </div>
              )}
            </div>
            <div>
              {canApplyDiscount ? (
                <DiscountInput
                  label="خصم على الدفعة (اختياري)"
                  value={Number(discount) || 0}
                  grandBeforeDiscount={remaining}
                  onChange={(v) => setDiscount(v && Number(v) >= 0 ? String(v) : "")}
                  compact
                />
              ) : (
                <>
                  <Label>خصم على الدفعة</Label>
                  <Input value="—" readOnly disabled title="لا تملك صلاحية تطبيق خصم" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    صلاحية «تطبيق خصم» غير مفعّلة لحسابك
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Input value="تحويل بنكي" readOnly disabled />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>الحساب المستلم</Label>
              {(accountsError || (!accountsLoading && accountOptions.length === 0)) && (
                <button
                  type="button"
                  data-testid="retry-load-accounts"
                  className="text-[11px] text-primary underline"
                  onClick={() => { refetchAccounts(); }}
                >
                  إعادة المحاولة
                </button>
              )}
            </div>
            {jaberAccount && accountId === jaberAccount.id ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border border-primary/40 bg-primary/5 p-2 text-sm font-bold">
                  {jaberAccount.name}{jaberAccount.bank_name ? ` — ${jaberAccount.bank_name}` : ""}
                </div>
                {accountOptions.length > 1 && (
                  <button
                    type="button"
                    className="text-[11px] text-primary underline"
                    onClick={() => setAccountId("")}
                  >
                    تغيير
                  </button>
                )}
              </div>
            ) : (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      accountsLoading
                        ? "جارٍ التحميل…"
                        : accountOptions.length === 0
                          ? "لا يوجد حساب — أضف حسابًا بنكيًا"
                          : "اختر الحساب المستلم"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(accountOptions as any[]).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.bank_name ? ` — ${a.bank_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
          <Button onClick={requestSave} disabled={saving} data-testid="open-confirm-payment">
            {saving ? "جارٍ الحفظ..." : "حفظ الدفعة"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* نافذة تأكيد قبل الحفظ */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !saving && setConfirmOpen(v)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد تسجيل الدفعة</DialogTitle>
          </DialogHeader>
          {(() => {
            const n = Number(amount) || 0;
            const disc = Math.max(0, Number(discount) || 0);
            const rem = Math.max(0, remaining - disc);
            const excess = Math.max(0, n - rem);
            const debt = custBalance?.debt || 0;
            const credit = custBalance?.credit || 0;
            const net = debt - credit;
            const state = Math.abs(net) < 0.01 ? "خالص" : net < 0 ? `له ${Math.abs(net).toLocaleString()}` : `عليه ${net.toLocaleString()}`;
            return (
              <div className="space-y-2 text-sm">
                <div className="rounded-md border bg-muted/40 p-2 flex justify-between">
                  <span className="text-muted-foreground">حالة العميل الحالية</span>
                  <b>{state}</b>
                </div>
                <Row k="الفاتورة" v={invoiceNumber || "—"} />
                <Row k="الإجمالي" v={Number(total).toLocaleString()} />
                <Row k="المدفوع سابقًا" v={Number(paidBefore).toLocaleString()} />
                {disc > 0 && <Row k="خصم إضافي" v={disc.toLocaleString()} />}
                <Row k="مبلغ الدفعة" v={n.toLocaleString()} />
                <Row k="المتبقي بعد الحفظ" v={Math.max(0, rem - Math.min(n, rem)).toLocaleString()} highlight />
                {excess > 0 && (
                  <div className="rounded-md border border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 text-xs text-emerald-800 dark:text-emerald-200">
                    فائض <b>{excess.toLocaleString()}</b> سيُودَع كرصيد دائن للعميل
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground pt-1">
                  الحساب المستلم: <b>{selectedAccount?.name || "—"}</b>{selectedAccount?.bank_name ? ` — ${selectedAccount.bank_name}` : ""}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>رجوع</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="confirm-payment">
              {saving ? "جارٍ الحفظ..." : "تأكيد الحفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between px-1 ${highlight ? "font-bold text-destructive" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
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
