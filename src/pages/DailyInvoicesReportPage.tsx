import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInvoicesWithCustomers } from "@/hooks/useData";
import { Search, ChevronLeft, ChevronRight, Eye, FileText } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";
import { StatusChip } from "@/components/ui/status-chip";

export default function DailyInvoicesReportPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;
  const { data: invoices, isLoading } = useInvoicesWithCustomers();

  const filtered = (invoices || []).filter((inv: any) => {
    // استبعاد مبيعات الكاش (POS) من تقرير الفواتير العام — تقاريرها مستقلة في صفحة "إدارة فواتير الكاش"
    if ((inv.source || "regular") === "pos") return false;
    const matchDate = inv.date === date;
    const matchSearch = !search || startsWithAny([inv.invoice_number, (inv.customers as any)?.name], search);
    return matchDate && matchSearch;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalAmount = filtered.reduce((s: number, inv: any) => s + Number(inv.total || 0), 0);

  const statusMap: Record<string, { label: string; color: string }> = {
    paid: { label: "مدفوعة", color: "bg-green-100 text-green-700" },
    pending: { label: "معلقة", color: "bg-yellow-100 text-yellow-700" },
    overdue: { label: "متأخرة", color: "bg-red-100 text-red-700" },
    cancelled: { label: "ملغاة", color: "bg-gray-100 text-gray-700" },
  };

  const sections = [
    { key: "header", label: "الترويسة" },
    { key: "filters", label: "الفلاتر" },
    { key: "table", label: "جدول الفواتير" },
  ];

  return (
    <div className="space-y-6">
      <PrintVisibilityToolbar
        storageKey="daily-invoices-report"
        containerSelector=".printable-statement"
        sections={sections}
        shareTitle={`تقرير الفواتير اليومي - ${date}`}
        shareSummary={`عدد الفواتير: ${filtered.length} | الإجمالي: ${totalAmount.toLocaleString()}`}
        pdfFilename={`تقرير-الفواتير-${date}`}
      />
      <div className="printable-statement space-y-4">
        <ReportPrintHeader title="تقرير الفواتير اليومي" periodText={`بتاريخ ${date}`} />

        <div className="flex items-center gap-3 print:hidden">
          <FileText size={24} className="text-primary" />
          <h1 className="text-2xl font-bold text-foreground">تقرير الفواتير اليومي</h1>
        </div>

      {/* Date Filter */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm" data-section="filters" data-section-label="الفلاتر">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">التاريخ:</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }}
              className="bg-muted rounded-lg px-4 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground block mb-1">بحث:</label>
            <div className="flex items-center bg-muted rounded-lg px-3 py-2 border border-border">
              <Search size={16} className="text-muted-foreground ml-2" />
              <input type="text" placeholder="بحث برقم الفاتورة أو اسم العميل..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>
          <div className="bg-primary/10 rounded-lg px-4 py-3 text-center">
            <div className="text-xs text-muted-foreground">إجمالي اليوم</div>
            <div className="text-lg font-bold text-primary">{totalAmount.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{filtered.length} فاتورة</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="legacy-card card-block" data-section="table" data-section-label="جدول الفواتير">
        <div className="overflow-x-auto">
          <table className="w-full text-sm mobile-stack-table">
            <thead><tr className="bg-muted">
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">رقم الفاتورة</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">اسم العميل</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">مبلغ الفاتورة</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">حالة الفاتورة</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">وقت الإنشاء</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الإجراءات</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : paginated.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد فواتير في هذا التاريخ</td></tr>
              : paginated.map((inv: any, i: number) => {
                return (
                  <tr key={inv.id} className="border-b border-border hover:bg-muted/50">
                    <td data-label="#" className="px-4 py-3 text-muted-foreground">{(page - 1) * perPage + i + 1}</td>
                    <td data-label="رقم الفاتورة" className="px-4 py-3 font-medium text-foreground">{inv.invoice_number}</td>
                    <td data-label="اسم العميل" className="px-4 py-3 text-foreground">{(inv.customers as any)?.name || "كاش"}</td>
                    <td data-label="مبلغ الفاتورة" className="px-4 py-3 font-bold text-foreground">{Number(inv.total || 0).toLocaleString()}</td>
                    <td data-label="حالة الفاتورة" className="px-4 py-3"><StatusChip kind="payment" value={inv.status} /></td>
                    <td data-label="وقت الإنشاء" className="px-4 py-3 text-foreground text-xs">{new Date(inv.created_at).toLocaleTimeString("ar-SA")}</td>
                    <td data-label="الإجراءات" className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                        className="px-2 py-1 bg-primary/10 text-primary rounded text-xs hover:bg-primary/20 transition-colors min-h-[32px] min-w-[32px] inline-flex items-center justify-center"
                        title="عرض الفاتورة"
                        aria-label="عرض الفاتورة"
                      >
                        <Eye size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>عرض {Math.min((page-1)*perPage+1, filtered.length)} إلى {Math.min(page*perPage, filtered.length)} من {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronRight size={16} /></button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 rounded text-xs ${page === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-muted disabled:opacity-50"><ChevronLeft size={16} /></button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
