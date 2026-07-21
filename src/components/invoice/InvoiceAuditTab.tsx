import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { classifyCreditRow } from "@/utils/creditSource";
import { FileText, DollarSign, Wallet, Trash2, Edit3, Loader2 } from "lucide-react";

interface Props {
  invoiceId: string;
  customerId?: string | null;
}

type TimelineItem = {
  id: string;
  date: string;
  action: string;
  label: string;
  detail: string;
  amount?: number | null;
  refId?: string;
  opNo?: string | null;
  icon: "create" | "payment" | "credit" | "delete" | "edit";
  colorClass: string;
};

/**
 * استخراج "رقم العملية" من وصف القيد.
 * يدعم الصيغة الحالية "رقم العملية: X" والصيغة القديمة "مرجع: X" لضمان توافق البيانات السابقة.
 */
export function extractOperationNo(description?: string | null): string | null {
  if (!description) return null;
  const m = String(description).match(/(?:رقم العملية|مرجع|إشعار)\s*[:：]\s*(\S+)/);
  return m ? m[1] : null;
}

const ICONS = {
  create: FileText,
  payment: DollarSign,
  credit: Wallet,
  delete: Trash2,
  edit: Edit3,
};

/**
 * تبويب "سجل التدقيق" للفاتورة — يجمع بشكل زمني موحّد:
 *  - قيود transactions (دفعات، رصيد دائن مستهلَك أو ناتج)
 *  - سجل invoice_revisions (تحديث، خصم، دفع، حذف بنود)
 *  - discount_audit_log (تعديلات الخصم مع القيم قبل/بعد)
 */
export default function InvoiceAuditTab({ invoiceId, customerId }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [txRes, revRes, discRes] = await Promise.all([
        (supabase as any)
          .from("transactions")
          .select("id, amount, date, description, category, reference_id, allocation")
          .or(
            `reference_id.eq.${invoiceId}${
              customerId
                ? `,and(customer_id.eq.${customerId},category.eq.customer_credit)`
                : ""
            }`,
          )
          .order("date", { ascending: false }),
        (supabase as any)
          .from("invoice_revisions")
          .select("id, created_at, action, note, changes, changed_by")
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("discount_audit_log")
          .select("id, created_at, discount_before, discount_added, discount_after, total_before, total_after, note")
          .eq("entity_type", "invoice")
          .eq("entity_id", invoiceId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;

      const list: TimelineItem[] = [];

      for (const t of (txRes.data || []) as any[]) {
        const info = classifyCreditRow(t);
        if (t.category === "customer_payment") {
          list.push({
            id: `tx-${t.id}`,
            date: t.date,
            action: "payment",
            label: Number(t.amount) < 0 ? "استرداد دفعة" : "دفعة",
            detail: t.description || "-",
            amount: Number(t.amount),
            refId: t.id,
            icon: "payment",
            colorClass: "text-emerald-700 bg-emerald-50 border-emerald-200",
          });
        } else if (t.category === "customer_credit") {
          const isConsumption = info.source === "credit_used" || Number(t.amount) < 0;
          list.push({
            id: `tx-${t.id}`,
            date: t.date,
            action: isConsumption ? "credit_used" : "credit_added",
            label: isConsumption ? "استهلاك رصيد دائن" : info.label,
            detail: t.description || info.label,
            amount: Number(t.amount),
            refId: t.id,
            icon: "credit",
            colorClass: isConsumption
              ? "text-amber-800 bg-amber-50 border-amber-200"
              : "text-blue-800 bg-blue-50 border-blue-200",
          });
        }
      }

      for (const r of (revRes.data || []) as any[]) {
        const isDelete = /حذف/.test(r.action || "") || /حذف/.test(r.note || "");
        list.push({
          id: `rev-${r.id}`,
          date: String(r.created_at || "").slice(0, 10),
          action: r.action,
          label:
            r.action === "payment" ? "دفعة (تعديل)" :
            r.action === "auto_workflow" ? "تحديث حالة" :
            r.action === "delete" || isDelete ? "حذف" :
            r.action === "created" ? "إنشاء" :
            r.action || "تعديل",
          detail: r.note || "-",
          amount: null,
          refId: r.id,
          icon: isDelete ? "delete" : r.action === "created" ? "create" : "edit",
          colorClass: isDelete
            ? "text-red-700 bg-red-50 border-red-200"
            : "text-slate-700 bg-slate-50 border-slate-200",
        });
      }

      for (const d of (discRes.data || []) as any[]) {
        list.push({
          id: `disc-${d.id}`,
          date: String(d.created_at || "").slice(0, 10),
          action: "discount",
          label: "تعديل خصم",
          detail: `الخصم: ${Number(d.discount_before || 0).toLocaleString()} → ${Number(d.discount_after || 0).toLocaleString()} (+${Number(d.discount_added || 0).toLocaleString()})${d.note ? ` — ${d.note}` : ""}`,
          amount: Number(d.discount_added || 0),
          refId: d.id,
          icon: "edit",
          colorClass: "text-purple-800 bg-purple-50 border-purple-200",
        });
      }

      list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setItems(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, customerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground" dir="rtl">
        <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري تحميل سجل التدقيق…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="text-center py-12 text-muted-foreground" dir="rtl">
        لا توجد قيود مسجّلة لهذه الفاتورة بعد.
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-2" data-testid="invoice-audit-tab">
      <div className="text-xs text-muted-foreground">
        {items.length} قيد — مرتبة من الأحدث للأقدم
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-right font-semibold text-xs w-24">التاريخ</th>
              <th className="px-3 py-2 text-right font-semibold text-xs w-32">النوع</th>
              <th className="px-3 py-2 text-right font-semibold text-xs">التفاصيل</th>
              <th className="px-3 py-2 text-left font-semibold text-xs w-28">المبلغ</th>
              <th className="px-3 py-2 text-left font-semibold text-xs w-24">رقم العملية</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const Icon = ICONS[it.icon];
              return (
                <tr key={it.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-2 tabular-nums text-xs">{it.date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${it.colorClass}`}
                    >
                      <Icon size={10} />
                      {it.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-foreground/80">{it.detail}</td>
                  <td className="px-3 py-2 text-left tabular-nums font-semibold text-xs">
                    {it.amount !== null && it.amount !== undefined
                      ? Number(it.amount).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <code className="text-[10px] text-muted-foreground font-mono">
                      {it.refId ? String(it.refId).slice(0, 8) : "—"}
                    </code>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
