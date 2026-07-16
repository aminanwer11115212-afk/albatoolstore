import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { netBalanceOf } from "@/utils/balanceDisplay";

interface Props {
  customerId: string | null | undefined;
  invoiceNumber?: string | null;
  /** Refresh trigger when payments change */
  refreshKey?: number;
}

interface CreditRow {
  id: string;
  amount: number;
  date: string;
  description: string | null;
}

/**
 * شريط توضيحي يظهر:
 *  - قيود الفائض (customer_credit) الناتجة من هذه الفاتورة (بمطابقة رقم الفاتورة في description).
 *  - الرصيد الدائن الحالي للعميل (كم متبقٍ للاستخدام على أي فاتورة قادمة).
 *  - رابط لكشف حساب العميل لعرض السجل الكامل.
 * لا يعرض شيئاً إذا لم يكن للعميل رصيد دائن ولا فائض من هذه الفاتورة.
 */
export default function InvoiceCustomerCreditBanner({ customerId, invoiceNumber, refreshKey = 0 }: Props) {
  const [fromThis, setFromThis] = useState<CreditRow[]>([]);
  const [currentCredit, setCurrentCredit] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    if (!customerId) return;
    (async () => {
      const [{ data: rows }, { data: cust }] = await Promise.all([
        (supabase as any)
          .from("transactions")
          .select("id, amount, date, description")
          .eq("customer_id", customerId)
          .eq("category", "customer_credit")
          .gt("amount", 0)
          .order("date", { ascending: false }),
        (supabase as any)
          .from("customers")
          .select("credit_balance")
          .eq("id", customerId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const all = (rows as CreditRow[]) || [];
      const filtered = invoiceNumber
        ? all.filter((r) => (r.description || "").includes(invoiceNumber))
        : [];
      setFromThis(filtered);
      setCurrentCredit(Number(cust?.credit_balance || 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, invoiceNumber, refreshKey]);

  if (!customerId) return null;
  const surplusSum = fromThis.reduce((s, r) => s + Number(r.amount || 0), 0);
  if (surplusSum <= 0 && currentCredit <= 0) return null;

  return (
    <div
      dir="rtl"
      className="mt-4 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200"
    >
      <div className="flex items-center gap-2 font-bold">
        <Wallet size={14} />
        <span>رصيد دائن للعميل</span>
        <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-300">
          (لا يُربط بمرجع الفاتورة القديمة)
        </span>
      </div>
      <div className="mt-1 space-y-0.5 leading-relaxed">
        {surplusSum > 0 && (
          <div>
            الفائض المحجوز من هذه الفاتورة:{" "}
            <b className="tabular-nums">{surplusSum.toLocaleString()}</b>
            {fromThis.length > 1 && (
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                {" "}
                ({fromThis.length} قيود)
              </span>
            )}
          </div>
        )}
        <div>
          الرصيد الدائن الحالي للعميل:{" "}
          <b className="tabular-nums">{currentCredit.toLocaleString()}</b>
          {currentCredit > 0 && (
            <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
              {" "}
              — يُستخدم تلقائياً على أي فاتورة جديدة من حقل «استخدام رصيد دائن»
            </span>
          )}
        </div>
        <Link
          to={`/reports/customer-statement?customer=${customerId}`}
          className="inline-flex items-center gap-1 text-primary underline mt-1"
        >
          <ExternalLink size={12} /> عرض كشف الحساب الكامل
        </Link>
      </div>
    </div>
  );
}
