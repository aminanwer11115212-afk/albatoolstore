import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Percent, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startsWithMatch } from "@/utils/searchMatch";

const inputCls =
  "px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

const ENTITY_LABEL: Record<string, string> = {
  invoice: "فاتورة",
  payment: "دفعة",
  purchase_order: "طلب شراء",
  quote: "عرض سعر",
};

const SOURCE_LABEL: Record<string, string> = {
  customer_payment_dialog: "شاشة دفعة العميل",
  supplier_payment_dialog: "شاشة دفعة المورد",
  invoice_edit: "تعديل فاتورة",
  quote_edit: "تعديل عرض",
  purchase_edit: "تعديل شراء",
  other: "أخرى",
};

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString();
}

function balanceCell(v: number | null | undefined) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  const n = Number(v);
  if (Math.abs(n) < 0.01) return <span className="text-muted-foreground">خالص</span>;
  return (
    <span className={n > 0 ? "text-destructive font-bold" : "text-emerald-600 font-bold"}>
      {n > 0 ? "عليه" : "له"} {Math.abs(n).toLocaleString()}
    </span>
  );
}

function entityLink(row: any): { to: string | null; label: string } {
  const label = row.entity_number || (row.entity_id ? row.entity_id.slice(0, 8) : "—");
  if (!row.entity_id) return { to: null, label };
  switch (row.entity_type) {
    case "invoice":
    case "payment":
      return { to: `/invoices/${row.entity_id}`, label };
    case "purchase_order":
      return { to: `/purchases/${row.entity_id}`, label };
    case "quote":
      return { to: `/quotes/${row.entity_id}`, label };
    default:
      return { to: null, label };
  }
}

export default function DiscountAuditPage() {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["discount-audit"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("discount_audit_log")
        .select("*, customer:customers(name), supplier:suppliers(name)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    return ((rows as any[]) || []).filter((r) => {
      const d = (r.created_at || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (search) {
        const hay = [
          r.entity_number,
          r.customer?.name,
          r.supplier?.name,
          r.note,
        ]
          .filter(Boolean)
          .join(" ");
        if (!startsWithMatch(hay, search) && !String(hay).includes(search)) return false;
      }
      return true;
    });
  }, [rows, search, from, to]);

  const totalDiscount = useMemo(
    () => filtered.reduce((s, r: any) => s + Number(r.discount_added || 0), 0),
    [filtered],
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Percent size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold">سجل تدقيق الخصومات</h1>
            <p className="text-xs text-muted-foreground">
              كل عملية خصم مع أثرها على رصيد العميل/المورد قبل وبعد.
            </p>
          </div>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">إجمالي الخصومات: </span>
          <b className="text-destructive tabular-nums">{totalDiscount.toLocaleString()}</b>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pr-7`}
            placeholder="بحث بالاسم أو الرقم…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-muted-foreground text-xs">إلى</span>
        <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr className="text-right">
              <th className="p-2">التاريخ</th>
              <th className="p-2">النوع</th>
              <th className="p-2">الرقم</th>
              <th className="p-2">الطرف</th>
              <th className="p-2">الخصم المضاف</th>
              <th className="p-2">إجمالي قبل</th>
              <th className="p-2">إجمالي بعد</th>
              <th className="p-2">رصيد قبل</th>
              <th className="p-2">رصيد بعد</th>
              <th className="p-2">المصدر</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">جارٍ التحميل…</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  لا توجد سجلات خصومات بعد
                </td>
              </tr>
            )}
            {filtered.map((r: any) => {
              const link = entityLink(r);
              const party = r.customer?.name || r.supplier?.name || "—";
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30 text-right">
                  <td className="p-2 tabular-nums text-xs">
                    {new Date(r.created_at).toLocaleString("ar-EG", { hour12: false })}
                  </td>
                  <td className="p-2">{ENTITY_LABEL[r.entity_type] || r.entity_type}</td>
                  <td className="p-2">
                    {link.to ? (
                      <Link className="text-primary underline" to={link.to}>{link.label}</Link>
                    ) : (
                      link.label
                    )}
                  </td>
                  <td className="p-2">{party}</td>
                  <td className="p-2 tabular-nums text-destructive font-bold">
                    {fmt(r.discount_added)}
                  </td>
                  <td className="p-2 tabular-nums">{fmt(r.total_before)}</td>
                  <td className="p-2 tabular-nums">{fmt(r.total_after)}</td>
                  <td className="p-2 tabular-nums">{balanceCell(r.balance_before)}</td>
                  <td className="p-2 tabular-nums">{balanceCell(r.balance_after)}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {SOURCE_LABEL[r.source] || r.source || "—"}
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
