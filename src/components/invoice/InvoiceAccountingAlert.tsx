import { useEffect, useState } from "react";
import { AlertTriangle, Info, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { classifyCreditRow } from "@/utils/creditSource";

interface Props {
  invoiceId: string;
  invoiceNumber?: string | null;
  customerId?: string | null;
  total: number;
  paidAmount: number;
  discount: number;
  isPos?: boolean;
  refreshKey?: number;
}

interface UnlinkedCredit {
  id: string;
  amount: number;
  date: string;
  description: string | null;
  allocation: any;
}

/**
 * تنبيه محاسبي داخل صفحة الفاتورة:
 *  - يظهر إذا كان (المدفوع + الخصم) لا يوازي إجمالي الفاتورة (فرق غير مبرر).
 *  - يظهر إذا كان للعميل customer_credit إيجابي غير مربوط برقم الفاتورة الحالية.
 */
export default function InvoiceAccountingAlert({
  invoiceId,
  invoiceNumber,
  customerId,
  total,
  paidAmount,
  discount,
  isPos,
  refreshKey = 0,
}: Props) {
  const [unlinked, setUnlinked] = useState<UnlinkedCredit[]>([]);
  const [unlinkedTotal, setUnlinkedTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!customerId || isPos) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("transactions")
        .select("id, amount, date, description, reference_id, allocation")
        .eq("customer_id", customerId)
        .eq("category", "customer_credit")
        .gt("amount", 0)
        .order("date", { ascending: false });
      if (cancelled) return;
      const rows: UnlinkedCredit[] = (data || []).filter(
        (r: any) => !r.reference_id || r.reference_id !== invoiceId,
      );
      // نستبعد صراحةً الفائض المتولّد من هذه الفاتورة (بمطابقة رقم الفاتورة في الوصف)
      const withoutCurrent = invoiceNumber
        ? rows.filter((r) => !(r.description || "").includes(invoiceNumber))
        : rows;
      setUnlinked(withoutCurrent);
      setUnlinkedTotal(
        withoutCurrent.reduce((s, r) => s + Number(r.amount || 0), 0),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, invoiceId, invoiceNumber, isPos, refreshKey]);

  if (isPos) return null;

  // فرق حسابي: المدفوع + الخصم يجب أن يوازي total إذا كانت مسدَّدة.
  const paidPlusDiscount = Number(paidAmount || 0) + Number(discount || 0);
  const diff = Math.round((Number(total || 0) - paidPlusDiscount) * 100) / 100;
  const hasImbalance =
    Math.abs(diff) > 0.01 &&
    Number(paidAmount || 0) > 0.01 &&
    Number(paidAmount || 0) < Number(total || 0) - 0.01 &&
    Number(discount || 0) > 0.01;

  const hasUnlinked = unlinkedTotal > 0.01;

  if (!hasImbalance && !hasUnlinked) return null;

  return (
    <div
      dir="rtl"
      className="mt-4 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
      data-testid="invoice-accounting-alert"
    >
      <div className="flex items-center gap-2 font-bold">
        <AlertTriangle size={14} />
        <span>تنبيه محاسبي</span>
      </div>

      {hasImbalance && (
        <div className="mt-1.5 flex items-start gap-1.5 leading-relaxed">
          <Info size={12} className="mt-0.5 shrink-0" />
          <div>
            الفارق بين (المدفوع + الخصم) وإجمالي الفاتورة يساوي{" "}
            <b className="tabular-nums">{Math.abs(diff).toLocaleString()}</b> —
            راجع الدفعات والخصم في سجل التدقيق أدناه للتأكد من صحة المطابقة.
          </div>
        </div>
      )}

      {hasUnlinked && (
        <div className="mt-1.5 leading-relaxed">
          <div className="flex items-start gap-1.5">
            <Info size={12} className="mt-0.5 shrink-0" />
            <div>
              يوجد للعميل رصيد دائن قدره{" "}
              <b className="tabular-nums">{unlinkedTotal.toLocaleString()}</b>{" "}
              غير مربوط بهذه الفاتورة (
              {unlinked.length} قيد). سيُستهلك تلقائياً في الفاتورة القادمة حسب
              إعداد الأولوية (FIFO/LIFO) في إعدادات الشركة.
            </div>
          </div>
          <ul className="mt-1.5 space-y-0.5 pr-4 list-disc marker:text-amber-500">
            {unlinked.slice(0, 5).map((r) => {
              const info = classifyCreditRow(r);
              return (
                <li key={r.id} className="text-[11px]">
                  <span className="tabular-nums font-semibold">
                    {Number(r.amount).toLocaleString()}
                  </span>{" "}
                  · {r.date} · {info.label}
                  {info.linkedInvoice ? ` (فاتورة ${info.linkedInvoice})` : ""}
                </li>
              );
            })}
            {unlinked.length > 5 && (
              <li className="text-[11px] text-amber-700 dark:text-amber-300">
                … و{unlinked.length - 5} قيد آخر
              </li>
            )}
          </ul>
          {customerId && (
            <Link
              to={`/customers/${customerId}/statement`}
              className="inline-flex items-center gap-1 text-primary underline mt-1"
            >
              <ExternalLink size={12} /> عرض كشف الحساب الكامل
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
