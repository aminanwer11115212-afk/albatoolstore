import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ExternalLink, Wallet, ArrowDownCircle, PlusCircle } from "lucide-react";

/**
 * سجلّ شحن رصيد العميل — يُجمّع الحركات حسب `allocation->>group_id`.
 * كل شحن يظهر كبطاقة تحتوي على التاريخ، الإجمالي، ما وُزِّع على الفواتير، وأيّ فائض.
 */
export default function CustomerChargeHistory({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-charge-history", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, date, method, description, category, allocation, reference_id, created_at, account_id, accounts(name, bank_name)")
        .eq("customer_id", customerId)
        .in("category", ["customer_payment", "customer_credit"])
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, any>();
    let orphanIdx = 0;
    for (const row of data || []) {
      const alloc: any = row.allocation || {};
      const gid = alloc.group_id || `orphan-${row.id || orphanIdx++}`;
      if (!map.has(gid)) {
        map.set(gid, {
          groupId: gid,
          date: row.date,
          created_at: row.created_at,
          method: row.method,
          accountName: (row as any).accounts?.name,
          bankName: (row as any).accounts?.bank_name,
          description: row.description,
          items: [] as any[],
          surplus: 0,
          allocated: 0,
          total: 0,
        });
      }
      const g = map.get(gid)!;
      if (alloc.kind === "surplus" || row.category === "customer_credit") {
        g.surplus += Number(row.amount || 0);
      } else {
        g.items.push({
          invoice_id: alloc.invoice_id || row.reference_id,
          invoice_number: alloc.invoice_number,
          invoice_date: alloc.invoice_date,
          invoice_total: Number(alloc.invoice_total || 0),
          applied: Number(alloc.applied ?? row.amount ?? 0),
          remaining_after: Number(alloc.remaining_after ?? 0),
          new_status: alloc.new_status,
        });
        g.allocated += Number(alloc.applied ?? row.amount ?? 0);
      }
      g.total = g.allocated + g.surplus;
    }
    return Array.from(map.values()).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [data]);

  if (isLoading) return <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>;
  if (!groups.length) return <div className="p-8 text-center text-muted-foreground text-sm">لا يوجد سجل شحن رصيد لهذا العميل بعد.</div>;

  const methodLabel = (m: string | null) =>
    m === "bank_transfer" ? "تحويل بنكي" : m === "card" ? "بطاقة" : m === "cash" ? "نقدي" : m || "—";

  const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="p-3 space-y-3">
      {groups.map((g) => (
        <div key={g.groupId} className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 text-primary font-bold">
              <Wallet size={16} /> شحن رصيد
            </div>
            <div className="text-xs text-muted-foreground">{g.date}</div>
            <div className="text-xs text-muted-foreground">•</div>
            <div className="text-xs text-muted-foreground">{methodLabel(g.method)}</div>
            {g.accountName && <><div className="text-xs text-muted-foreground">•</div><div className="text-xs text-muted-foreground">{g.bankName ? `${g.bankName} - ${g.accountName}` : g.accountName}</div></>}
            <div className="mr-auto flex items-center gap-3 text-sm">
              <div className="tabular-nums">
                الإجمالي: <span className="font-bold text-foreground">{fmt(g.total)}</span>
              </div>
              {g.allocated > 0.01 && (
                <div className="tabular-nums text-emerald-600">
                  سُدِّد: <span className="font-bold">{fmt(g.allocated)}</span>
                </div>
              )}
              {g.surplus > 0.01 && (
                <div className="tabular-nums text-primary">
                  فائض: <span className="font-bold">{fmt(g.surplus)}</span>
                </div>
              )}
            </div>
          </div>

          {g.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 text-xs text-muted-foreground">
                    <th className="text-right px-3 py-2 font-semibold">رقم الفاتورة</th>
                    <th className="text-right px-3 py-2 font-semibold">تاريخ الفاتورة</th>
                    <th className="text-right px-3 py-2 font-semibold">إجمالي الفاتورة</th>
                    <th className="text-right px-3 py-2 font-semibold">المطبَّق من الشحن</th>
                    <th className="text-right px-3 py-2 font-semibold">المتبقي بعد التوزيع</th>
                    <th className="text-right px-3 py-2 font-semibold">الحالة الجديدة</th>
                    <th className="text-right px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it: any, i: number) => (
                    <tr key={`${g.groupId}-${it.invoice_id}-${i}`} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {it.invoice_id ? (
                          <Link to={`/invoices/view/${it.invoice_id}`} className="text-primary hover:underline">{it.invoice_number || "—"}</Link>
                        ) : (it.invoice_number || "—")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{it.invoice_date || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(it.invoice_total)}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-600 font-semibold">+ {fmt(it.applied)}</td>
                      <td className={`px-3 py-2 tabular-nums font-semibold ${it.remaining_after > 0.01 ? "text-destructive" : "text-emerald-700"}`}>
                        {fmt(it.remaining_after)}
                      </td>
                      <td className="px-3 py-2">
                        {it.new_status === "paid" ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">مسددة</span>
                        ) : it.new_status === "partial" ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">جزئية</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{it.new_status || "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {it.invoice_id && (
                          <Link to={`/invoices/view/${it.invoice_id}`} className="text-muted-foreground hover:text-primary inline-flex">
                            <ExternalLink size={14} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : g.surplus > 0.01 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <PlusCircle size={14} className="text-primary" />
              لا فواتير غير مسددة — الشحن كامل ({fmt(g.surplus)}) أُضيف كرصيد دائن للعميل.
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">لا توجد تفاصيل توزيع محفوظة لهذه العملية.</div>
          )}

          {g.description && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/10 flex items-center gap-1">
              <ArrowDownCircle size={12} /> {g.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
