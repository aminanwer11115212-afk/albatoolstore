import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Printer, Trash2, RefreshCw, Search, ArrowRight, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useInvoices, useCompanySettings } from "@/hooks/useData";
import { startsWithMatch } from "@/utils/searchMatch";
import { MobileDocCard, mobileDocListCSS } from "@/components/mobile/MobileDocList";

type CashInv = {
  id: string;
  invoice_number: string;
  date: string;
  total: number;
  paid_amount: number;
  walk_in_customer_name: string | null;
  status: string;
  created_at: string;
};

const PAGE_SIZE = 50;

export default function CashInvoicesPage() {
  const navigate = useNavigate();
  const { remove } = useInvoices();
  const { data: companyArr } = useCompanySettings();
  const currency = companyArr?.[0]?.currency || "SDG";
  const [rows, setRows] = useState<CashInv[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState<string>("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  const buildBaseQuery = useCallback(() => {
    let q = supabase
      .from("invoices")
      .select("id, invoice_number, date, total, paid_amount, walk_in_customer_name, status, created_at", { count: "exact" })
      .eq("source", "pos")
      .order("created_at", { ascending: false });
    if (fromDate) q = q.gte("date", fromDate);
    if (toDate) q = q.lte("date", toDate);
    return q;
  }, [fromDate, toDate]);

  const fetchPage = useCallback(
    async (pageIndex: number, replace: boolean) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (replace) setLoading(true); else setLoadingMore(true);
      try {
        const from = pageIndex * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error, count } = await buildBaseQuery().range(from, to);
        if (error) throw error;
        const batch = (data as any[]) || [];
        if (typeof count === "number") setTotalCount(count);
        setRows((prev) => {
          const merged = replace ? batch : [...prev, ...batch];
          // إزالة أي تكرار محتمل بحسب id
          const seen = new Set<string>();
          return merged.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
        });
        setHasMore(batch.length === PAGE_SIZE);
        setPage(pageIndex);
      } catch (e: any) {
        toast.error(`تعذّر تحميل فواتير الكاش: ${e?.message || "خطأ غير معروف"}`);
        setHasMore(false);
      } finally {
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildBaseQuery],
  );

  // إعادة التحميل من البداية عند تغيير الفلاتر
  useEffect(() => {
    setRows([]);
    setPage(0);
    setHasMore(true);
    void fetchPage(0, true);
    const refresh = () => fetchPage(0, true);
    window.addEventListener("invoices:changed", refresh);
    return () => window.removeEventListener("invoices:changed", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  // مراقب التقاطع للـ Infinite Scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loading && !loadingMore && !fetchingRef.current) {
          void fetchPage(page + 1, false);
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, hasMore, loading, loadingMore, fetchPage]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.trim();
    return rows.filter(
      (r) =>
        startsWithMatch(r.invoice_number || "", s) ||
        startsWithMatch(r.walk_in_customer_name || "", s),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const sum = filtered.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    return { count: filtered.length, sum };
  }, [filtered]);

  const handleDelete = async (id: string) => {
    if (!confirm("حذف هذه الفاتورة الكاش؟ سيتم إرجاع الكميات إلى المخزون.")) return;
    try {
      const { deleteInvoiceWithStockRestore } = await import("@/utils/deleteInvoice");
      await deleteInvoiceWithStockRestore(id);
      toast.success("تم الحذف");
      setRows((p) => p.filter((r) => r.id !== id));
      setTotalCount((c) => Math.max(0, c - 1));
      try { window.dispatchEvent(new Event("invoices:changed")); } catch {}
    } catch (e: any) {
      toast.error(`فشل الحذف: ${e?.message || "خطأ"}`);
    }
  };

  const handlePrint = (id: string) => navigate(`/preview/invoice/${id}`);

  const handleWhatsApp = async (r: CashInv) => {
    const { shareDocumentViaWhatsApp } = await import("@/utils/shareDocumentWhatsApp");
    await shareDocumentViaWhatsApp({
      docType: "invoice",
      docId: r.id,
      phone: null, // POS عادةً بدون رقم — يفتح واتساب لاختيار جهة الاتصال يدوياً
      customerName: r.walk_in_customer_name || "عميل نقدي",
      docNumber: r.invoice_number,
      total: r.total,
      currency,
      docLabel: "فاتورة كاش",
    });
  };

  const reload = () => fetchPage(0, true);



  return (
    <div dir="rtl" className="p-3 space-y-3 font-cairo">
      <style>{mobileDocListCSS}</style>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/invoices/cash")}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm font-bold"
          >
            <Plus size={16} /> فاتورة كاش جديدة
          </button>
          <button
            onClick={() => navigate("/invoices")}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border bg-background text-foreground hover:bg-muted text-sm"
            title="إدارة الفواتير العادية"
          >
            <ArrowRight size={14} /> الفواتير العامة
          </button>
          <button
            onClick={() => navigate("/invoices/cash/migrate-numbers")}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border bg-background text-foreground hover:bg-muted text-sm"
            title="ترحيل أرقام الفواتير القديمة من INV- إلى POS-"
          >
            ترحيل الترقيم
          </button>
        </div>
        <h1 className="text-lg font-bold m-0">إدارة فواتير الكاش (POS)</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-2 border border-border rounded-md bg-card">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الفاتورة أو اسم العميل النقدي…"
            className="w-full pr-7 pl-2 py-2 text-sm rounded-md border border-border bg-background text-foreground"
            style={{ fontSize: 16 }}
          />
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          من
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-1 rounded-md border border-border bg-background text-foreground text-sm"
            style={{ fontSize: 16 }}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          إلى
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-1 rounded-md border border-border bg-background text-foreground text-sm"
            style={{ fontSize: 16 }}
          />
        </label>
        <button
          onClick={() => { setFromDate(""); setToDate(""); setSearch(""); }}
          className="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted"
        >
          مسح
        </button>
        <button
          onClick={reload}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border hover:bg-muted"
        >
          <RefreshCw size={12} /> تحديث
        </button>
      </div>

      {/* Totals card */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div className="p-3 rounded-md border border-border bg-card">
          <div className="text-xs text-muted-foreground">المعروض / الإجمالي بالفلتر</div>
          <div className="text-xl font-bold">
            {rows.length.toLocaleString("ar-EG")} / {totalCount.toLocaleString("ar-EG")}
          </div>
        </div>
        <div className="p-3 rounded-md border border-border bg-card">
          <div className="text-xs text-muted-foreground">إجمالي المبيعات</div>
          <div className="text-xl font-bold">
            {totals.sum.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} {currency}
          </div>
        </div>
        <div className="p-3 rounded-md border border-border bg-card hidden md:block">
          <div className="text-xs text-muted-foreground">المتوسط لكل فاتورة</div>
          <div className="text-xl font-bold">
            {(totals.count ? totals.sum / totals.count : 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} {currency}
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-md overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="p-2 text-right">رقم الفاتورة</th>
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-right">العميل النقدي</th>
              <th className="p-2 text-right">الإجمالي</th>
              <th className="p-2 text-center" style={{ width: 140 }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">جاري التحميل…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد فواتير كاش بعد</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                  <td className="p-2 font-bold">{r.invoice_number}</td>
                  <td className="p-2">{r.date}</td>
                  <td className="p-2">{r.walk_in_customer_name || "عميل نقدي"}</td>
                  <td className="p-2 font-bold">
                    {Number(r.total || 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} {currency}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handlePrint(r.id)}
                        className="p-1.5 rounded-md hover:bg-muted text-foreground"
                        title="طباعة / معاينة"
                      >
                        <Printer size={14} />
                      </button>
                      <button
                        onClick={() => handleWhatsApp(r)}
                        className="p-1.5 rounded-md hover:bg-muted text-green-600"
                        title="إرسال رابط المعاينة عبر واتساب"
                      >
                        <MessageCircle size={14} />
                      </button>
                      <button
                        onClick={() => navigate(`/invoices/cash/edit/${r.id}`)}
                        className="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted"
                      >
                        فتح
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 rounded-md hover:bg-destructive hover:text-destructive-foreground text-destructive"
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">جاري التحميل…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">لا توجد فواتير كاش بعد</div>
        ) : (
          filtered.map((r, i) => (
            <MobileDocCard
              key={r.id}
              index={i + 1}
              number={r.invoice_number}
              party={r.walk_in_customer_name || "عميل نقدي"}
              date={r.date}
              amount={`${Number(r.total || 0).toLocaleString("ar-EG")} ${currency}`}
              onOpen={() => navigate(`/invoices/cash/edit/${r.id}`)}
              actions={
                <>
                  <button
                    onClick={() => handlePrint(r.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted"
                  >
                    <Printer size={12} /> طباعة
                  </button>
                  <button
                    onClick={() => handleWhatsApp(r)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-green-600 text-green-700 hover:bg-green-600 hover:text-white"
                  >
                    <MessageCircle size={12} /> واتساب
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 size={12} /> حذف
                  </button>
                </>
              }
            />
          ))
        )}
      </div>

      {/* Infinite scroll sentinel + load-more fallback */}
      {!loading && rows.length > 0 && (
        <div ref={sentinelRef} className="py-4 flex items-center justify-center">
          {loadingMore ? (
            <span className="text-xs text-muted-foreground">جارٍ تحميل المزيد…</span>
          ) : hasMore ? (
            <button
              onClick={() => fetchPage(page + 1, false)}
              className="px-3 py-1.5 text-xs rounded-md border border-border bg-background hover:bg-muted"
            >
              تحميل المزيد
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">— انتهت السجلات ({totalCount.toLocaleString("ar-EG")}) —</span>
          )}
        </div>
      )}
    </div>
  );
}
