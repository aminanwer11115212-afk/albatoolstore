import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

interface FilteredTransactionsPageProps {
  type: "income" | "expense";
}

export default function FilteredTransactionsPage({ type }: FilteredTransactionsPageProps) {
  const title = type === "income" ? "الإيرادات" : "المصروفات";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const perPage = 50;
  const MAX_ROWS = 1000;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["filtered-transactions", type, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("*, accounts:account_id(name), customers(name), suppliers(name)")
        .eq("type", type)
        .order("date", { ascending: false })
        .limit(MAX_ROWS);
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const filtered = (transactions || []).filter((t: any) => {
    if (search) {
      if (!startsWithAny([t.description, t.category, t.accounts?.name], search)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const total = filtered.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
  const truncated = (transactions?.length || 0) >= MAX_ROWS;

  const periodText = dateFrom || dateTo
    ? `${dateFrom ? `من ${dateFrom}` : ""}${dateTo ? ` إلى ${dateTo}` : ""}`.trim()
    : `كل الفترات`;

  const sections = [
    { key: "header", label: "الترويسة" },
    { key: "filters", label: "الفلاتر" },
    { key: "summary", label: "الإجمالي" },
    { key: "table", label: "تفاصيل العمليات" },
  ];

  return (
    <div className="space-y-6">
      <PrintVisibilityToolbar
        storageKey={`filtered-transactions-${type}`}
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle={`تقرير ${title}`}
        shareSummary={`${title}: ${total.toLocaleString()} | عدد العمليات: ${filtered.length}`}
        pdfFilename={`تقرير-${title}-${new Date().toISOString().split("T")[0]}`}
      />

      <div className="printable-statement space-y-6">
        <ReportPrintHeader title={`تقرير ${title}`} periodText={periodText} />

        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <DollarSign size={24} className={type === "income" ? "text-success" : "text-destructive"} /> {title}
          </h1>
          <div className={`text-lg font-bold ${type === "income" ? "text-success" : "text-destructive"}`}>
            الإجمالي: {total.toLocaleString()}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-sm" data-section="filters" data-section-label="الفلاتر">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">من تاريخ</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="bg-muted rounded-lg px-4 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">إلى تاريخ</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="bg-muted rounded-lg px-4 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-foreground block mb-1">بحث</label>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="وصف / فئة / حساب"
                className="bg-muted rounded-lg px-4 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary w-full" />
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            الفترة: {periodText} • البحث: {search || "—"} • عدد النتائج: {filtered.length}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex items-center justify-between" data-section="summary" data-section-label="الإجمالي">
          <span className="text-sm text-muted-foreground">إجمالي {title}</span>
          <span className={`text-xl font-bold ${type === "income" ? "text-success" : "text-destructive"}`}>{total.toLocaleString()}</span>
        </div>

        <div className="legacy-card card-block" data-section="table" data-section-label="تفاصيل العمليات">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted">
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">المبلغ</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الحساب</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الفئة</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">الوصف</th>
                <th className="text-right px-5 py-3 font-semibold text-muted-foreground">طريقة الدفع</th>
              </tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
                : !filtered.length ? <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد {title}</td></tr>
                : paginated.map((t: any) => (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 text-foreground">{t.date}</td>
                    <td className={`px-5 py-3 font-medium ${type === "income" ? "text-success" : "text-destructive"}`}>{Number(t.amount).toLocaleString()}</td>
                    <td className="px-5 py-3 text-foreground">{t.accounts?.name || "-"}</td>
                    <td className="px-5 py-3 text-foreground">{t.category || "-"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{t.description || "-"}</td>
                    <td className="px-5 py-3 text-foreground">{t.method || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {truncated && (
            <div className="px-4 py-2 text-xs text-warning bg-warning/10 border-t border-border">
              ⚠️ تم تحميل أول {MAX_ROWS} سجل فقط. ضيّق الفترة الزمنية للوصول لباقي السجلات.
            </div>
          )}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between text-sm flex-wrap gap-2">
              <span className="text-muted-foreground">
                صفحة {page} من {totalPages} • إجمالي {filtered.length} سجل
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded bg-muted hover:bg-muted/70 disabled:opacity-50 min-h-[36px]"
                >السابق</button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded bg-muted hover:bg-muted/70 disabled:opacity-50 min-h-[36px]"
                >التالي</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
