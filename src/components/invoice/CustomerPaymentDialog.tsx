import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSafeQueryClient as useQueryClient } from "@/lib/safeQueryClient";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts } from "@/hooks/useData";
import {
  validateBankTransferPayment,
  isBankPaymentMethod,
  isCashPaymentMethod,
  filterAccountsForPayment,
} from "@/lib/bankTransferValidation";
import { computeInvoicePaymentAdjustment } from "@/utils/invoicePaymentMath";
import { logDiscountEvent } from "@/utils/discountAuditLogger";
import { refetchAndToastCustomerBalance } from "@/utils/balanceRefreshToast";
import { netBalanceOf, CustomerAccountSummary } from "@/utils/balanceDisplay";
import { useUserRole } from "@/hooks/useUserRole";
import { recordInvoiceRevision } from "@/utils/invoiceRevisions";
import { useCreditConsumptionOrder, allocateCreditConsumption } from "@/hooks/useCreditConsumptionOrder";
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
import { Pin, PinOff } from "lucide-react";

type Method = "cash" | "bank";

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

// مفاتيح التثبيت — عامة لكل الأجهزة (تفضيل مالي)، مع دعم المفتاح القديم
const PIN_ACCOUNT_KEY = "lov:pinned-bank-account";
const PIN_METHOD_KEY = "lov:pinned-payment-method";

function readPin(key: string): string {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}
function writePin(key: string, val: string) {
  try {
    if (val) localStorage.setItem(key, val);
    else localStorage.removeItem(key);
  } catch { /* noop */ }
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
  const consumptionOrder = useCreditConsumptionOrder();
  const canRecordPayment = isAdmin || permissions.record_payment !== false;
  const canApplyDiscount = isAdmin || permissions.apply_discount !== false;
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ackAdjustments, setAckAdjustments] = useState(false);
  useEffect(() => { if (confirmOpen) setAckAdjustments(false); }, [confirmOpen]);

  const remaining = Math.max(0, Number(total || 0) - Number(paidBefore || 0));

  // القيمة الابتدائية للطريقة — دائماً «تحويل بنكي» عند كل فتح، إلا إذا ثبّت
  // المستخدم طريقة بعينها صراحةً (زر التثبيت). لا نعتمد على «آخر طريقة للعميل»
  // حتى لا يتغيّر الافتراضي من فاتورة لأخرى. اختيار المستخدم اليدوي يتغلّب لاحقاً.
  const initialMethod = (): Method => {
    const m = readPin(PIN_METHOD_KEY) as Method;
    return (m === "cash" || m === "bank") ? m : "bank";
  };

  const [amount, setAmount] = useState<string>(remaining ? String(remaining) : "");
  const [creditUse, setCreditUse] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<Method>(initialMethod);
  const [accountId, setAccountId] = useState<string>("");
  const [pinnedAccountId, setPinnedAccountId] = useState<string>(() => readPin(PIN_ACCOUNT_KEY));
  const [pinnedMethod, setPinnedMethod] = useState<string>(() => readPin(PIN_METHOD_KEY));
  const [referenceNo, setReferenceNo] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [custBalance, setCustBalance] = useState<{ debt: number; credit: number } | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<Array<{ id: string; invoice_number: string | null; date: string; total: number; paid_amount: number; discount: number; }>>([]);


  const amountRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(remaining ? String(remaining) : "");
      setCreditUse("");
      setDiscount("");
      setDate(new Date().toISOString().slice(0, 10));
      const m0 = initialMethod();
      setMethod(m0);
      // «أولاد جابر» هو الحساب الافتراضي الثابت عند كل فتح (للطريقة البنكية).
      const jaberNow = ((accounts as any[]) || []).find((a) =>
        /اولاد\s*جابر|أولاد\s*جابر/.test(`${a.name || ""} ${a.bank_name || ""}`),
      );
      setAccountId(jaberNow && m0 !== "cash" ? jaberNow.id : "");
      setReferenceNo("");
      setNotes("");
      setCustBalance(null);

      // تركيز حقل المبلغ بعد الفتح
      setTimeout(() => {
        try { amountRef.current?.focus(); amountRef.current?.select(); } catch { /* noop */ }
      }, 80);
      // اجلب رصيد العميل الحالي (له/عليه) عند فتح الحوار
      if (customerId && !isPos) {
        (async () => {
          const { data } = await supabase.from("customers").select("balance, credit_balance").eq("id", customerId).maybeSingle();
          if (data) {
            const credit = Number((data as any).credit_balance || 0);
            setCustBalance({
              debt: Number((data as any).balance || 0),
              credit,
            });
            // اقتراح تلقائي: استخدم الرصيد الدائن أولاً لسد المتبقي
            if (credit > 0.01 && remaining > 0.01) {
              const useCredit = Math.min(credit, remaining);
              setCreditUse(String(useCredit));
              setAmount(String(Math.max(0, remaining - useCredit)));
            }
          }
        })();
        // اجلب آخر 5 فواتير للعميل (باستثناء الحالية)
        (async () => {
          const { data } = await supabase
            .from("invoices")
            .select("id, invoice_number, date, total, paid_amount, discount")
            .eq("customer_id", customerId)
            .neq("source", "pos")
            .neq("id", invoiceId)
            .order("date", { ascending: false })
            .limit(5);
          setRecentInvoices((data as any[]) || []);
        })();
      } else {
        setRecentInvoices([]);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remaining, customerId, isPos]);

  const accountOptions = useMemo(() => {
    const list = (accounts || []) as any[];
    if (method === "bank") return filterAccountsForPayment(list, "bank");
    if (method === "cash") {
      // النقدي = صندوق نقدي؛ لا نرجع للحسابات البنكية. إن لم يوجد صندوق نقدي
      // تبقى القائمة فارغة ويُسجَّل القيد بلا حساب (account_id = null).
      return list.filter((a) => (a.account_type || "cash") === "cash");
    }
    return list;
  }, [accounts, method]);

  // ثبّت الحساب المختار عبر إغلاق/فتح الحوار وتبديل الطريقة
  useEffect(() => {
    if (accountOptions.length === 0) {
      // لا خيارات (مثل النقدي بلا صندوق نقدي) — امسح أي حساب سابق حتى لا
      // تُسجَّل الدفعة على حساب بنكي مُختار قبل التبديل.
      if (accountId) setAccountId("");
      return;
    }
    const storageKey = method === "bank" ? "lov:last-bank-account" : `lov:last-account:${method}`;
    if (!accountId) {
      // 1) لطريقة "تحويل بنكي" — يظهر افتراضياً حساب "أولاد جابر" إن وُجد
      const jaber = (accountOptions as any[]).find((a) => {
        const s = `${a.name || ""} ${a.bank_name || ""}`;
        return /اولاد\s*جابر|أولاد\s*جابر/.test(s);
      });
      if (method === "bank" && jaber) { setAccountId(jaber.id); return; }
      // 2) حساب مثبَّت من المستخدم
      if (pinnedAccountId) {
        const pinned = accountOptions.find((a: any) => a.id === pinnedAccountId);
        if (pinned) { setAccountId(pinned.id); return; }
      }
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
  }, [accountOptions, method, pinnedAccountId]); // eslint-disable-line

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

  // — تحكم كامل بالكيبورد داخل الحوار —
  const focusNextField = useCallback((current: HTMLElement) => {
    const scope = current.closest('[data-pay-scope]');
    if (!scope) return;
    const nodes = Array.from(
      scope.querySelectorAll<HTMLElement>('[data-pay-field]:not([disabled]):not([aria-hidden="true"])')
    ).filter((el) => el.offsetParent !== null);
    const idx = nodes.indexOf(current);
    const next = nodes[idx + 1];
    if (next) { next.focus(); (next as any).select?.(); }
  }, []);

  const onDialogKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (saving) return;
    // Ctrl/⌘+Enter → فتح تأكيد الحفظ
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      requestSave();
      return;
    }
    // Enter داخل حقل نصي (ما عدا Textarea) → الحقل التالي
    if (e.key === "Enter") {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA") return;
      if (t.hasAttribute("data-pay-field")) {
        e.preventDefault();
        focusNextField(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, focusNextField]);

  function requestSave() {
    const n = Number(amount) || 0;
    const disc = Math.max(0, Number(discount) || 0);
    const cu = Math.max(0, Number(creditUse) || 0);
    const availCredit = custBalance?.credit || 0;
    if (n < 0 || (Number(discount) || 0) < 0 || cu < 0) return toast.error("لا يُسمح بقيم سالبة");
    if (n <= 0 && disc <= 0 && cu <= 0) return toast.error("أدخل مبلغ أو خصم أو استخدام رصيد أكبر من صفر");
    if (cu > availCredit + 0.01) return toast.error(`لا يمكن استخدام أكثر من الرصيد الدائن المتاح (${availCredit.toLocaleString()})`);
    const rem = Math.max(0, remaining - disc);
    const generalAmount = Math.max(0, n + cu - rem);
    if (generalAmount > 0.01 && !canRecordPayment) {
      return toast.error("ليست لديك صلاحية تسجيل مبلغ عام (فائض/رصيد دائن) — تواصل مع المسؤول");
    }
    if (disc > 0 && !canApplyDiscount) {
      return toast.error("ليست لديك صلاحية تطبيق خصم إضافي — تواصل مع المسؤول");
    }
    // النقدي: الحساب اختياري — يُسجَّل بلا حساب (صندوق نقدي) دون منع الحفظ.
    // التحويل البنكي: الحساب إلزامي.
    if (n > 0 && !accountId && isBankPaymentMethod(method)) {
      return toast.error("اختر الحساب المستلم للتحويل البنكي");
    }
    if (n > 0 && isBankPaymentMethod(method)) {
      const err = validateBankTransferPayment({ method, account: selectedAccount, referenceNo, requireReferenceNo: false });
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
    const cu = Math.max(0, Number(creditUse) || 0);

    savingRef.current = true;
    setSaving(true);
    const toastId = "cust-pay-flow";
    toast.loading("جارٍ تسجيل الدفعة…", { id: toastId });
    try {
      const { data: inv, error: rErr } = await (supabase as any)
        .from("invoices")
        .select("total, paid_amount, discount, subtotal")
        .eq("id", invoiceId)
        .maybeSingle();
      if (rErr) throw rErr;

      const beforeTotal = Number(inv?.total || 0);
      const beforePaid = Number(inv?.paid_amount || 0);
      const beforeDiscount = Number(inv?.discount || 0);
      const calc = computeInvoicePaymentAdjustment({
        currentTotal: beforeTotal,
        currentPaid: beforePaid,
        currentDiscount: beforeDiscount,
        paymentAmount: n,
        discountAmount: disc,
        creditUse: cu,
        isPos: !!isPos,
      });
      const nextDiscount = calc.nextDiscount;
      const nextTotal = calc.nextTotal;
      const creditApplied = calc.creditApplied;
      const split = { applied: calc.cashApplied, overpay: calc.cashOver };
      const newPaid = calc.nextPaid;
      const newDue = calc.newDue;
      const nextStatus = calc.nextStatus;

      // (a) دفعة نقدية على الفاتورة
      if (split.applied > 0) {
        const baseNote = notes || (invoiceNumber ? `دفعة على الفاتورة ${invoiceNumber}` : "دفعة من العميل");
        const description = referenceNo ? `${baseNote} — مرجع: ${referenceNo}` : baseNote;
        const { error: txErr } = await (supabase as any).from("transactions").insert({
          type: "income",
          category: "customer_payment",
          customer_id: isPos ? null : customerId || null,
          account_id: accountId || null,
          amount: split.applied,
          date,
          method,
          reference_id: invoiceId,
          description,
        });
        if (txErr) throw txErr;
      }

      // (b) فائض النقد → رصيد دائن جديد للعميل
      //     نربطه بالفاتورة (reference_id + allocation.kind) حتى يُحذف تلقائياً
      //     عند حذف الفاتورة فيرجع حساب العميل لحالته قبل الفاتورة.
      if (split.overpay > 0 && !isPos && customerId) {
        const { error: cErr } = await (supabase as any).from("transactions").insert({
          type: "income",
          category: "customer_credit",
          customer_id: customerId,
          account_id: accountId || null,
          amount: split.overpay,
          date,
          method,
          reference_id: invoiceId,
          description: `فائض دفعة${invoiceNumber ? ` من الفاتورة ${invoiceNumber}` : ""} — رصيد دائن`,
          allocation: { kind: "overpay_surplus", invoice_id: invoiceId, invoice_number: invoiceNumber || null },
        });
        if (cErr) throw cErr;
      }

      // (c) استخدام الرصيد الدائن — نقسمه على قيود customer_credit الموجودة
      //     حسب أولوية الاستهلاك (FIFO/LIFO) من إعدادات الشركة، بحيث يظهر كل
      //     استهلاك مربوطاً بمصدره الأصلي (allocation.consumed_from).
      if (creditApplied > 0 && !isPos && customerId) {
        const desc = `استخدام رصيد دائن${invoiceNumber ? ` على الفاتورة ${invoiceNumber}` : ""} (${consumptionOrder === "fifo" ? "الأقدم أولاً" : "الأحدث أولاً"})`;

        // قيد دفع بدون تدفق نقدي — يظهر في سجل دفعات العميل ويربط بالفاتورة
        const { error: cpErr } = await (supabase as any).from("transactions").insert({
          type: "income",
          category: "customer_payment",
          customer_id: customerId,
          account_id: null,
          amount: creditApplied,
          date,
          method: "credit_balance",
          reference_id: invoiceId,
          description: desc,
          allocation: { kind: "credit_used", invoice_id: invoiceId, invoice_number: invoiceNumber || null, order: consumptionOrder },
        });
        if (cpErr) throw cpErr;

        // جلب قيود customer_credit المتاحة (بعد طرح ما تم استهلاكه سابقاً) بمجموع لكل قيد
        // نطلب كل الصفوف (موجب/سالب) ونحسب صافي كل مجموعة تعريفياً حسب created_at الأصلي
        const { data: creditRows } = await (supabase as any)
          .from("transactions")
          .select("id, amount, date, description, allocation")
          .eq("customer_id", customerId)
          .eq("category", "customer_credit");

        // نبني lots من الصفوف الموجبة (الأصل)، ونطرح منها ما استُهلك عبر consumed_from
        const positives = ((creditRows as any[]) || []).filter((r) => Number(r.amount) > 0.01);
        const consumedMap = new Map<string, number>();
        for (const r of ((creditRows as any[]) || [])) {
          const from = r.allocation?.consumed_from;
          if (from && Number(r.amount) < 0) {
            consumedMap.set(from, (consumedMap.get(from) || 0) + Math.abs(Number(r.amount)));
          }
        }
        const lots = positives
          .map((r) => ({
            id: r.id as string,
            date: r.date as string,
            amount: Math.max(0, Number(r.amount) - (consumedMap.get(r.id) || 0)),
          }))
          .filter((l) => l.amount > 0.01);

        const plan = allocateCreditConsumption(lots, creditApplied, consumptionOrder);

        if (plan.length === 0) {
          // fallback: قيد استهلاك واحد بدون consumed_from إذا لم نجد lots
          const { error: ccErr } = await (supabase as any).from("transactions").insert({
            type: "expense",
            category: "customer_credit",
            customer_id: customerId,
            account_id: null,
            amount: -creditApplied,
            date,
            method: "credit_balance",
            reference_id: invoiceId,
            description: desc,
            allocation: { kind: "credit_used", invoice_id: invoiceId, invoice_number: invoiceNumber || null, order: consumptionOrder },
          });
          if (ccErr) throw ccErr;
        } else {
          for (const step of plan) {
            const { error: ccErr } = await (supabase as any).from("transactions").insert({
              type: "expense",
              category: "customer_credit",
              customer_id: customerId,
              account_id: null,
              amount: -step.consume,
              date,
              method: "credit_balance",
              reference_id: invoiceId,
              description: desc,
              allocation: {
                kind: "credit_used",
                invoice_id: invoiceId,
                invoice_number: invoiceNumber || null,
                consumed_from: step.id,
                order: consumptionOrder,
              },
            });
            if (ccErr) throw ccErr;
          }
        }
      }

      const updatePayload: any = {
        paid_amount: newPaid,
        due_amount: newDue,
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

      await Promise.allSettled([
        customerId && !isPos ? (supabase as any).rpc("recompute_customer_balance", { _customer_id: customerId }) : Promise.resolve(),
        accountId && (split.applied > 0 || split.overpay > 0) ? (supabase as any).rpc("recompute_account_balance", { _account_id: accountId }) : Promise.resolve(),
      ]);

      if (method === "bank" && accountId) {
        try { localStorage.setItem("lov:last-bank-account", accountId); } catch {}
      }
      try {
        if (customerId) localStorage.setItem(`lov:last-method:cust:${customerId}`, method);
      } catch {}

      const parts: string[] = [];
      if (split.applied > 0) parts.push(`دفعة ${split.applied.toLocaleString()}`);
      if (creditApplied > 0) parts.push(`رصيد دائن مستخدم ${creditApplied.toLocaleString()}`);
      if (split.overpay > 0) parts.push(`رصيد دائن جديد ${split.overpay.toLocaleString()}`);
      if (disc > 0) parts.push(`خصم ${disc.toLocaleString()}`);
      toast.success(
        (parts.length ? `تم تسجيل ${parts.join(" + ")}` : "تم التسجيل") +
          ` — الحالة: ${labelStatus(nextStatus)}`,
        { id: toastId },
      );

      try {
        const { data: authData } = await supabase.auth.getUser();
        const changedBy = authData?.user?.email || authData?.user?.id || "system";
        await recordInvoiceRevision({
          invoiceId,
          action: "payment",
          changedBy,
          changes: {
            paid_amount: { before: beforePaid, after: newPaid },
            ...(disc > 0
              ? {
                  discount: { before: beforeDiscount, after: nextDiscount },
                  total: { before: beforeTotal, after: nextTotal },
                }
              : {}),
          },
          snapshot: {
            amount: n,
            credit_used: creditApplied,
            applied: split.applied,
            overpay: split.overpay,
            discount: disc,
            method,
            account_id: accountId,
            account_name: selectedAccount?.name || null,
            bank_name: selectedAccount?.bank_name || null,
            reference_no: referenceNo || null,
            date,
            status: nextStatus,
          },
          note:
            (notes ? `${notes} — ` : "") +
            `دفعة ${n.toLocaleString()} (${methodLabel(method)})` +
            (creditApplied > 0 ? ` + رصيد دائن ${creditApplied.toLocaleString()}` : "") +
            (referenceNo ? ` — مرجع ${referenceNo}` : "") +
            (disc > 0 ? ` — خصم ${disc.toLocaleString()}` : ""),
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("failed to record payment revision", e);
      }


      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["transactionsWithAccounts"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-full"] });
      qc.invalidateQueries({ queryKey: ["invoice-revisions", invoiceId] });
      // تحديث كشف حساب العميل + المعاينة + إدارة العملاء
      qc.invalidateQueries({ queryKey: ["customer-statement"] });
      qc.invalidateQueries({ queryKey: ["customer-transactions"] });
      qc.invalidateQueries({ queryKey: ["customer_balance_stats"] });
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      try { window.dispatchEvent(new Event("customers:changed")); } catch {}
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
      try { window.dispatchEvent(new Event("transactions:changed")); } catch {}
      try { window.dispatchEvent(new Event("invoice-payments:changed")); } catch {}
      // انتظر اكتمال إعادة الجلب للمفاتيح الحرجة قبل تحرير أزرار الحفظ
      await Promise.allSettled([
        qc.refetchQueries({ queryKey: ["customer-statement"] }),
        qc.refetchQueries({ queryKey: ["customer-transactions"] }),
        qc.refetchQueries({ queryKey: ["customers"] }),
        qc.refetchQueries({ queryKey: ["invoices-with-customers"] }),
      ]);

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
            discount_before: beforeDiscount,
            discount_added: disc,
            discount_after: nextDiscount,
            total_before: beforeTotal,
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
      toast.error(e?.message || "تعذّر حفظ الدفعة", { id: toastId });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // — أزرار التثبيت —
  function togglePinAccount() {
    if (!accountId) return;
    if (pinnedAccountId === accountId) {
      if (!window.confirm("سيتم إلغاء تثبيت الحساب الافتراضي. متابعة؟")) return;
      setPinnedAccountId("");
      writePin(PIN_ACCOUNT_KEY, "");
      toast.success("تم إلغاء تثبيت الحساب");
      return;
    }
    const currentName = selectedAccount?.name || "هذا الحساب";
    const prevName = pinnedAccountId
      ? (accountOptions as any[]).find((a) => a.id === pinnedAccountId)?.name
      : null;
    const msg = prevName
      ? `سيتم تبديل الحساب المثبَّت من «${prevName}» إلى «${currentName}». متابعة؟`
      : `سيتم تثبيت «${currentName}» كحساب افتراضي دائم. متابعة؟`;
    if (!window.confirm(msg)) return;
    setPinnedAccountId(accountId);
    writePin(PIN_ACCOUNT_KEY, accountId);
    toast.success("تم تثبيت الحساب");
  }

  function togglePinMethod() {
    if (pinnedMethod === method) {
      if (!window.confirm("سيتم إلغاء تثبيت طريقة الدفع الافتراضية. متابعة؟")) return;
      setPinnedMethod("");
      writePin(PIN_METHOD_KEY, "");
      toast.success("تم إلغاء تثبيت طريقة الدفع");
      return;
    }
    const msg = pinnedMethod
      ? `سيتم تبديل الطريقة المثبَّتة إلى «${methodLabel(method)}». متابعة؟`
      : `سيتم تثبيت «${methodLabel(method)}» كطريقة دفع افتراضية دائمة. متابعة؟`;
    if (!window.confirm(msg)) return;
    setPinnedMethod(method);
    writePin(PIN_METHOD_KEY, method);
    toast.success("تم تثبيت طريقة الدفع");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent
        className="max-w-xl w-[calc(100vw-16px)] sm:w-[560px] max-h-[92vh] overflow-y-auto p-2 sm:p-4"
        dir="rtl"
        onKeyDown={onDialogKeyDown}
        data-pay-scope
      >
        <DialogHeader className="pb-1">
          <DialogTitle className="text-[13px] sm:text-base leading-tight truncate">
            تسجيل دفعة على {invoiceNumber || "الفاتورة"}
            {customerName ? ` — ${customerName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!isPos && custBalance && (
          <div className="mb-2">
            <div className="text-[10px] text-muted-foreground mb-1">رصيد العميل الحالي</div>
            <CustomerAccountSummary
              customer={{ balance: custBalance.debt, credit_balance: custBalance.credit }}
              size="sm"
            />
          </div>
        )}

        <div className="grid gap-2 grid-cols-1 md:grid-cols-2 md:auto-rows-min min-w-0">


          {/* العمود الأيمن: ملخّص الحسابات */}
          {(() => {
            const debt = custBalance?.debt || 0;
            const credit = custBalance?.credit || 0;
            const net = debt - credit;
            const invoiceRemaining = remaining;
            const previousDebt = !isPos ? Math.max(0, net - invoiceRemaining) : 0;
            const previousCredit = !isPos && net < -0.01 ? Math.abs(net) : 0;
            const disc = Math.max(0, Number(discount) || 0);
            const invoiceAfterDiscount = Math.max(0, invoiceRemaining - disc);
            const rawDue = invoiceAfterDiscount + previousDebt - previousCredit;
            const combinedDue = Math.max(0, rawDue);
            const preSettleCredit = rawDue < -0.01 ? Math.abs(rawDue) : 0;
            const paidCash = Number(amount) || 0;
            const cu = Math.min(Math.max(0, Number(creditUse) || 0), credit);
            const paid = paidCash + cu;
            const afterPayment = combinedDue - paid;
            const isSettled = combinedDue < 0.01 && paid < 0.01 ? preSettleCredit < 0.01 : Math.abs(afterPayment) < 0.01;
            const isOver = paid > 0 && afterPayment < -0.01;
            const showAfter = paid > 0 || preSettleCredit > 0;


            return (
              <div className="flex flex-col gap-2">
                <div className="rounded-md border bg-muted/30 p-2 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">إجمالي الفاتورة</span>
                    <span className="font-bold tabular-nums">{Number(total).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">المدفوع سابقاً</span>
                    <span className="font-bold tabular-nums">{Number(paidBefore).toLocaleString()}</span>
                  </div>
                  {disc > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">خصم إضافي</span>
                      <span className="font-bold tabular-nums">{disc.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">متبقي الفاتورة</span>
                    <span className={`font-bold tabular-nums ${invoiceAfterDiscount > 0.01 ? "text-destructive" : ""}`}>
                      {invoiceAfterDiscount.toLocaleString()}
                    </span>
                  </div>
                  {previousDebt > 0.01 && (
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">حساب قديم عليه</span>
                      <span className="font-bold tabular-nums text-destructive">+ {previousDebt.toLocaleString()}</span>
                    </div>
                  )}
                  {previousCredit > 0.01 && (
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">رصيد سابق له</span>
                      <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">− {previousCredit.toLocaleString()}</span>
                    </div>
                  )}
                  {(previousDebt > 0.01 || previousCredit > 0.01) && (
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">المطلوب سداده</span>
                      {preSettleCredit > 0.01 ? (
                        <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          له {preSettleCredit.toLocaleString()}
                        </span>
                      ) : (
                        <span className={`font-bold tabular-nums ${combinedDue > 0.01 ? "text-destructive" : "text-primary"}`}>
                          {combinedDue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {showAfter && (
                  <div
                    className={`rounded-md border p-2 text-center ${
                      isSettled
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : isOver || preSettleCredit > 0
                          ? "border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
                          : "border-destructive/40 bg-destructive/5 text-destructive"
                    }`}
                  >
                    {isSettled ? (
                      <div className="text-sm font-bold">مكتمل ✓</div>
                    ) : preSettleCredit > 0 && paid < 0.01 ? (
                      <>
                        <div className="text-sm font-bold">+ له {preSettleCredit.toLocaleString()}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">رصيد العميل الحالي — لا حاجة للدفع</div>
                      </>
                    ) : isOver ? (
                      <>
                        <div className="text-sm font-bold">+ له {(Math.abs(afterPayment) + preSettleCredit).toLocaleString()}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">حساب العميل بعد الدفع</div>
                      </>
                    ) : (
                      <>
                        <div className="text-sm font-bold">− عليه {afterPayment.toLocaleString()}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">حساب العميل بعد الدفع</div>
                      </>
                    )}
                  </div>
                )}

                {credit > 0.01 && !isPos && (
                  <div className="rounded-md border border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 text-[11px] flex items-center justify-between text-emerald-800 dark:text-emerald-200">
                    <span>الرصيد الدائن المتاح</span>
                    <span className="font-bold tabular-nums">{credit.toLocaleString()}</span>
                  </div>
                )}


                {/* تلميح لوحة المفاتيح */}
                <div className="text-[10px] text-muted-foreground rounded-md border border-dashed p-2 leading-relaxed">
                  ⌨︎ <b>Enter</b>: التالي · <b>Ctrl+Enter</b>: حفظ · <b>Esc</b>: إغلاق
                </div>

                {!isPos && recentInvoices.length > 0 && (
                  <div className="rounded-md border bg-muted/20 p-2">
                    <div className="text-[10px] font-bold text-muted-foreground mb-1.5">آخر 5 فواتير للعميل</div>
                    <div className="space-y-1">
                      {recentInvoices.map((inv) => {
                        const paid = Math.max(0, Number(inv.paid_amount) || 0);
                        const totalNet = Math.max(0, Number(inv.total) || 0);
                        const due = Math.max(0, totalNet - paid);
                        const isPaid = due < 0.01;
                        const isPartial = paid > 0.01 && due > 0.01;
                        return (
                          <div key={inv.id} className="flex items-center justify-between gap-2 text-[11px] border-b border-border/40 last:border-0 pb-1 last:pb-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                                  isPaid ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-destructive"
                                }`}
                              />
                              <span className="font-medium truncate">{inv.invoice_number || "—"}</span>
                              <span className="text-muted-foreground text-[10px] shrink-0">{inv.date}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 tabular-nums">
                              <span className="text-muted-foreground">{totalNet.toLocaleString()}</span>
                              <span className={`font-bold ${isPaid ? "text-emerald-600" : "text-destructive"}`}>
                                {isPaid ? "مسدّدة" : due.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* العمود الأيسر: نموذج الدفعة */}
          <div className="grid gap-2 content-start">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">المبلغ المدفوع</Label>
                <Input
                  ref={amountRef}
                  data-pay-field
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
                    label="خصم على الدفعة"
                    value={Number(discount) || 0}
                    grandBeforeDiscount={remaining}
                    onChange={(v) => {
                      const next = Math.max(0, Number(v) || 0);
                      const oldDisc = Math.max(0, Number(discount) || 0);
                      const credit = Math.max(0, Number(creditUse) || 0);
                      const oldSuggested = Math.max(0, remaining - oldDisc - credit);
                      const nextSuggested = Math.max(0, remaining - next - credit);
                      const currentAmount = Number(amount) || 0;
                      setDiscount(next > 0 ? String(next) : "");
                      if (Math.abs(currentAmount - oldSuggested) <= 0.01 || Math.abs(currentAmount - remaining) <= 0.01) {
                        setAmount(nextSuggested > 0 ? String(nextSuggested) : "");
                      }
                    }}
                    compact
                  />
                ) : (
                  <>
                    <Label className="text-xs">خصم على الدفعة</Label>
                    <Input value="—" readOnly disabled title="لا تملك صلاحية تطبيق خصم" />
                    <div className="text-[10px] text-muted-foreground mt-1">
                      صلاحية «تطبيق خصم» غير مفعّلة
                    </div>
                  </>
                )}
              </div>
            </div>

            {!isPos && (custBalance?.credit || 0) > 0.01 && (
              <div className="rounded-md border border-emerald-600/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs text-emerald-800 dark:text-emerald-200">
                    خصم من رصيد العميل الدائن
                  </Label>
                  <button
                    type="button"
                    className="text-[10px] text-primary underline"
                    onClick={() => {
                      const avail = custBalance?.credit || 0;
                      const rem = Math.max(0, remaining - (Number(discount) || 0));
                      const use = Math.min(avail, rem);
                      setCreditUse(String(use));
                      setAmount(String(Math.max(0, rem - use)));
                    }}
                  >
                    استخدم الكل
                  </button>
                </div>
                <Input
                  data-pay-field
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={custBalance?.credit || 0}
                  value={creditUse}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || Number(v) >= 0) {
                      const avail = custBalance?.credit || 0;
                      const capped = v === "" ? "" : String(Math.min(Number(v), avail));
                      setCreditUse(capped);
                    }
                  }}
                  placeholder="0.00"
                />
                <div className="text-[10px] text-muted-foreground mt-1">
                  المتاح: {(custBalance?.credit || 0).toLocaleString()} — يُخصم من رصيد العميل ويُضاف كدفعة على الفاتورة
                </div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 leading-relaxed bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-1">
                  ملاحظة محاسبية: أي دفعة تزيد عن قيمة الفاتورة تُسجَّل تلقائياً كـ <b>رصيد دائن للعميل</b> (customer_credit) ولا تُربط بمرجع الفاتورة القديمة. الفائض يظهر في كشف الحساب ويُستخدم من هنا على الفاتورة الجديدة.
                </div>
              </div>
            )}



            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">التاريخ</Label>
                <Input data-pay-field type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">طريقة الدفع</Label>
                  <button
                    type="button"
                    onClick={togglePinMethod}
                    className={`inline-flex items-center gap-1 text-[10px] rounded border px-1.5 py-0.5 ${
                      pinnedMethod === method
                        ? "border-amber-500/60 bg-amber-50/70 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                    title={pinnedMethod === method ? "فك تثبيت طريقة الدفع" : "تثبيت طريقة الدفع"}
                  >
                    {pinnedMethod === method ? <><Pin size={10} className="fill-current" />مثبَّتة</> : <><Pin size={10} />تثبيت</>}
                  </button>
                </div>
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                  <SelectTrigger data-pay-field>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">تحويل بنكي{pinnedMethod === "bank" ? " 📌" : ""}</SelectItem>
                    <SelectItem value="cash">نقدي{pinnedMethod === "cash" ? " 📌" : ""}</SelectItem>
                  </SelectContent>
                </Select>
                {method === "bank" && jaberAccount && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    يُحدَّد افتراضياً حساب «{jaberAccount.name}» ⭐
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1 gap-2">
                <Label className="text-xs">
                  الحساب المستلم{isCashPaymentMethod(method) ? " (اختياري للنقدي)" : ""}
                </Label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {accountId && (
                    <button
                      type="button"
                      onClick={togglePinAccount}
                      className={`inline-flex items-center gap-1 text-[10px] rounded border px-1.5 py-0.5 ${
                        pinnedAccountId === accountId
                          ? "border-amber-500/60 bg-amber-50/70 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                      title={pinnedAccountId === accountId ? "فك تثبيت الحساب" : "تثبيت الحساب"}
                    >
                      {pinnedAccountId === accountId ? (
                        <><PinOff size={10} /> فك التثبيت</>
                      ) : (
                        <><Pin size={10} /> تثبيت</>
                      )}
                    </button>
                  )}
                  {(accountsError || (!accountsLoading && accountOptions.length === 0 && !isCashPaymentMethod(method))) && (
                    <button
                      type="button"
                      data-testid="retry-load-accounts"
                      className="text-[10px] text-primary underline"
                      onClick={() => { refetchAccounts(); }}
                    >
                      إعادة المحاولة
                    </button>
                  )}
                </div>
              </div>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger data-pay-field>
                  <SelectValue
                    placeholder={
                      accountsLoading
                        ? "جارٍ التحميل…"
                        : accountOptions.length === 0
                          ? (isCashPaymentMethod(method) ? "نقدًا — بلا حساب" : "لا يوجد حساب — أضف حسابًا")
                          : "اختر الحساب المستلم"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(accountOptions as any[]).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}{a.bank_name ? ` — ${a.bank_name}` : ""}
                      {pinnedAccountId === a.id ? " 📌" : ""}
                      {jaberAccount && a.id === jaberAccount.id ? " ⭐" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isBankPaymentMethod(method) && (
              <div>
                <Label className="text-xs">رقم العملية (اختياري)</Label>
                <Input data-pay-field value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="مثلاً TRX-1234" />
              </div>
            )}

          </div>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="min-h-[40px] w-full sm:w-auto">إلغاء</Button>
          <Button onClick={requestSave} disabled={saving} data-testid="open-confirm-payment" className="min-h-[40px] w-full sm:w-auto">
            {saving ? "جارٍ التحديث…" : "حفظ الدفعة (Ctrl+Enter)"}
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
            const debt = custBalance?.debt || 0;
            const credit = custBalance?.credit || 0;
            const cu = Math.min(Math.max(0, Number(creditUse) || 0), credit);
            const creditAppliedOnInv = Math.min(cu, rem);
            const afterCredit = Math.max(0, rem - creditAppliedOnInv);
            const cashApplied = Math.min(n, afterCredit);
            const excess = Math.max(0, n - cashApplied);
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
                {creditAppliedOnInv > 0 && <Row k="من الرصيد الدائن" v={creditAppliedOnInv.toLocaleString()} />}
                <Row k="مبلغ الدفعة النقدية" v={n.toLocaleString()} />
                <Row k="طريقة الدفع" v={methodLabel(method)} />
                <Row k="المتبقي بعد الحفظ" v={Math.max(0, afterCredit - cashApplied).toLocaleString()} highlight />
                {excess > 0 && (
                  <div className="rounded-md border border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 text-xs text-emerald-800 dark:text-emerald-200">
                    فائض <b>{excess.toLocaleString()}</b> سيُودَع كرصيد دائن للعميل
                  </div>
                )}
                {creditAppliedOnInv > 0 && (
                  <div className="rounded-md border border-emerald-600/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 text-xs text-emerald-800 dark:text-emerald-200">
                    سيُخصم <b>{creditAppliedOnInv.toLocaleString()}</b> من رصيد العميل الدائن (المتاح: {credit.toLocaleString()})
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground pt-1">
                  الحساب المستلم: <b>{selectedAccount?.name || "—"}</b>{selectedAccount?.bank_name ? ` — ${selectedAccount.bank_name}` : ""}
                </div>
              </div>
            );
          })()}

          {(() => {
            const disc = Math.max(0, Number(discount) || 0);
            const credit = custBalance?.credit || 0;
            const cu = Math.min(Math.max(0, Number(creditUse) || 0), credit);
            const needsAck = disc > 0 || cu > 0;
            return (
              <>
                {needsAck && (
                  <label className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50/60 dark:bg-amber-950/30 p-2 text-[12px] text-amber-900 dark:text-amber-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackAdjustments}
                      onChange={(e) => setAckAdjustments(e.target.checked)}
                      className="mt-0.5 shrink-0"
                      data-testid="ack-adjustments"
                    />
                    <span>
                      أؤكّد التسويات:
                      {disc > 0 ? ` خصم إضافي ${disc.toLocaleString()} · ` : " "}
                      {cu > 0 ? `خصم من الرصيد الدائن ${cu.toLocaleString()}` : ""}
                    </span>
                  </label>
                )}
                <DialogFooter className="gap-2 flex-col sm:flex-row">
                  <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving} className="min-h-[40px] w-full sm:w-auto">رجوع</Button>
                  <Button onClick={handleSave} disabled={saving || (needsAck && !ackAdjustments)} data-testid="confirm-payment" className="min-h-[40px] w-full sm:w-auto">
                    {saving ? "جارٍ التحديث…" : "تأكيد الحفظ"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
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

export function methodLabel(m: string): string {
  switch (m) {
    case "cash": return "نقدي";
    case "bank":
    case "bank_transfer": return "تحويل بنكي";
    case "cheque": return "شيك";
    default: return m || "—";
  }
}
