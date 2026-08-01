import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { netBeforeInvoice } from "@/utils/customerNetBefore";
import { signedAmountText } from "@/utils/buildCustomerAccountView";

/**
 * صندوقا الحساب في معاينة الفاتورة: **الحساب القديم** و**الحساب الحالي**.
 *
 * «الحساب القديم» هو صافي حساب العميل **قبل إنشاء هذه الفاتورة** — يُحسب
 * تاريخياً عبر `netBeforeInvoice` بإعادة تشغيل الأحداث حتى لحظة إنشائها، لا
 * بطرح الفاتورة من الرصيد الحالي. الفرق ليس شكلياً: الطرح يُدخل في «القديم»
 * فواتيرَ أُنشئت **بعد** هذه الفاتورة، فيعرض على العميل رقماً لم يكن قائماً وقتها.
 *
 * «الحساب الحالي» هو `net_balance` المخزَّن — ما على العميل الآن بعد كل شيء.
 *
 * الإشارة موحّدة مع كشف الحساب ورسائل الواتساب عبر `signedAmountText`:
 * «+» أخضر لصالح العميل، «−» أحمر عليه، والصفر «خالص».
 *
 * **انتبه لاتجاه الإشارة عند العبور بين الدالّتين** — فهما متعاكستان قصداً:
 *   `netBalanceOf` و`netBeforeInvoice` تُرجعان بإشارة **الدفاتر**: موجب = عليه.
 *   `signedAmountText` تقرأ بإشارة **العرض**: موجب = لصالح العميل.
 * فالعبور بلا عكس يقلب الكشف على وجه العميل: من له 130,000 يراها ديناً أحمر.
 * `toDisplaySign` هي نقطة العبور الوحيدة هنا.
 */

/** من إشارة الدفاتر (موجب = عليه) إلى إشارة العرض (موجب = لصالحه). */
export const toDisplaySign = (ledgerNet: number) => -ledgerNet;

interface Props {
  invoiceId: string;
  customerId: string | null | undefined;
}

const TONE: Record<string, string> = {
  credit: "text-emerald-600 dark:text-emerald-400",
  debit: "text-destructive",
  settled: "text-muted-foreground",
};

function Box({ title, hint, value }: { title: string; hint: string; value: number | null }) {
  const shown = value == null ? null : signedAmountText(toDisplaySign(value));
  return (
    <div className="flex-1 min-w-[150px] rounded-lg border-2 border-border bg-card px-4 py-3 text-center">
      <div className="text-xs font-bold text-foreground">{title}</div>
      <div className={`text-xl font-black tabular-nums mt-1 ${shown ? TONE[shown.tone] : "text-muted-foreground"}`}>
        {shown ? shown.text : "—"}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{hint}</div>
    </div>
  );
}

export default function InvoiceBalanceBoxes({ invoiceId, customerId }: Props) {
  const [before, setBefore] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!customerId || !invoiceId) {
      setReady(true);
      return;
    }
    (async () => {
      const [{ data: invoices }, { data: txs }, { data: cust }] = await Promise.all([
        (supabase as any)
          .from("invoices")
          .select("id, total, paid_amount, status, date, created_at")
          .eq("customer_id", customerId),
        (supabase as any)
          .from("transactions")
          .select("id, category, amount, method, reference_id, date, created_at")
          .eq("customer_id", customerId)
          .in("category", ["customer_payment", "customer_credit"]),
        (supabase as any)
          .from("customers")
          .select("balance, credit_balance, net_balance")
          .eq("id", customerId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setBefore(
        netBeforeInvoice(invoiceId, {
          invoices: invoices || [],
          transactions: txs || [],
        }),
      );
      setCurrent(cust ? netBalanceOf(cust) : null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, customerId]);

  if (!customerId || !ready) return null;

  return (
    <div
      dir="rtl"
      data-testid="invoice-balance-boxes"
      className="bg-card border border-border rounded-lg p-4"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold">حساب العميل</h3>
        <Link
          to={`/customers/${customerId}/statement`}
          className="inline-flex items-center gap-1 text-xs text-primary underline"
        >
          <ExternalLink size={12} /> كشف الحساب
        </Link>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Box
          title="الحساب القديم"
          hint="صافي الحساب قبل إنشاء هذه الفاتورة"
          value={before}
        />
        <Box
          title="الحساب الحالي"
          hint="صافي الحساب الآن بعد كل الفواتير والحركات"
          value={current}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        «+» أخضر رصيد للعميل · «−» أحمر مستحق عليه
      </p>
    </div>
  );
}
