/**
 * كميات المنتجات — شاشةٌ تُريك ما في المخزن وكم بقي منه.
 *
 * طلبها صاحب المستودع: «نافذة جديدة مع المنتجات باسم كميات المنتجات تظهر لي
 * كميات المنتجات مع بحث وفلترة حسب الرقم والاسم وهكذا».
 *
 * ## لماذا شاشةٌ مستقلّة عن «إدارة جميع المنتجات»
 * تلك شاشةُ تحريرٍ: أعمدةٌ كثيرة وأسعارٌ وخلايا تُكتب. وهذه شاشةُ **قراءة**
 * سريعة: الرقم والاسم والكمية والوحدة والحدّ الأدنى — تُفتح للجرد أو للردّ
 * على «عندك كم من كذا؟» بلا خوفٍ من تعديلٍ بالخطأ.
 *
 * ## البحث «يبدأ بـ» لا «يحتوي على»
 * نفس قاعدة شاشات إدخال البنود (`leadsWithAny`): كتابة «است» تُظهر ما يبدأ
 * بـ«است» فقط. والرقم يُطابَق بالبداية كذلك، فكتابة «12» تُظهر 12 و120 و1234
 * — وهو ما يُنتظر من حقل رقم.
 *
 * ## الترتيب والفلترة
 * فلترةٌ بحالة المخزون (نافد/منخفض/متوفّر) لأن السؤال العملي غالباً «ما الذي
 * نفد؟» لا «ما قائمة كل شيء؟». والصفحة تعرض الكل بلا ترقيم لأن الجرد يُقرأ
 * بالتمرير لا بالتنقّل بين صفحات.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, PackageSearch } from "lucide-react";
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { leadsWithAny, normalizeAr } from "@/utils/searchMatch";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock_quantity: number | null;
  min_stock: number | null;
};

type StockFilter = "all" | "out" | "low" | "in";

/** حالة المخزون بقاعدةٍ واحدة تُستعمل في الفلتر وفي الشارة. */
function stockState(r: Row): StockFilter {
  const qty = Number(r.stock_quantity || 0);
  if (qty <= 0) return "out";
  if (qty <= Number(r.min_stock || 0)) return "low";
  return "in";
}

const STATE_LABEL: Record<Exclude<StockFilter, "all">, string> = {
  out: "نافد",
  low: "منخفض",
  in: "متوفّر",
};

const STATE_CLASS: Record<Exclude<StockFilter, "all">, string> = {
  out: "bg-destructive/10 text-destructive border-destructive/30",
  low: "bg-warning/10 text-warning border-warning/30",
  in: "bg-success/10 text-success border-success/30",
};

export default function ProductQuantitiesPage() {
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<"name" | "qty_asc" | "qty_desc">("name");

  const { data, isLoading } = useQuery({
    queryKey: ["product-quantities"],
    queryFn: async () =>
      fetchAllProducts<Row>("id, name, sku, unit, stock_quantity, min_stock"),
  });

  const rows = useMemo(() => {
    const all = (data || []) as Row[];
    const q = search.trim();
    const filtered = all.filter((r) => {
      // الرقم والاسم كلاهما «يبدأ بـ» — نفس قاعدة البحث في شاشات الإدخال
      if (q && !leadsWithAny([r.name, r.sku], q)) return false;
      if (stockFilter !== "all" && stockState(r) !== stockFilter) return false;
      return true;
    });
    const byName = (a: Row, b: Row) => normalizeAr(a.name).localeCompare(normalizeAr(b.name), "ar");
    if (sort === "name") return [...filtered].sort(byName);
    const dir = sort === "qty_asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) => dir * (Number(a.stock_quantity || 0) - Number(b.stock_quantity || 0)) || byName(a, b),
    );
  }, [data, search, stockFilter, sort]);

  // الإجماليات على المعروض لا على الكل — فتتبع ما تراه العين
  const totals = useMemo(() => {
    const out = rows.filter((r) => stockState(r) === "out").length;
    const low = rows.filter((r) => stockState(r) === "low").length;
    const qty = rows.reduce((s, r) => s + Number(r.stock_quantity || 0), 0);
    return { out, low, qty };
  }, [rows]);

  const inputCls =
    "bg-muted rounded-lg px-3 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageSearch size={22} /> كميات المنتجات
        </h1>
      </div>

      <PrintVisibilityToolbar
        storageKey="product-quantities"
        containerSelector=".printable-statement"
        sections={[
          { key: "header", label: "الترويسة" },
          { key: "filters", label: "الفلاتر" },
          { key: "summary", label: "الملخّص" },
          { key: "table", label: "جدول الكميات" },
        ]}
        shareTitle="كميات المنتجات"
        shareSummary={`عدد الأصناف: ${rows.length}`}
        pdfFilename={`كميات-المنتجات-${new Date().toISOString().split("T")[0]}`}
      />

      <div className="printable-statement">
        <ReportPrintHeader
          title="كميات المنتجات"
          periodText={`بحث: ${search || "—"} • الأصناف: ${rows.length}`}
        />

        <div className="legacy-card card-block">
          <div
            className="p-4 border-b border-border flex flex-wrap gap-3 items-center justify-between"
            data-section="filters"
            data-section-label="الفلاتر"
          >
            <div className="flex items-center bg-muted rounded-lg px-3 py-2 flex-1 min-w-[220px]">
              <Search size={16} className="text-muted-foreground ml-2" />
              <input
                type="text"
                placeholder="ابحث بالاسم أو الرقم — يبدأ بـ"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none text-sm flex-1 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className={inputCls}
            >
              <option value="all">كل الحالات</option>
              <option value="out">نافد</option>
              <option value="low">منخفض</option>
              <option value="in">متوفّر</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as any)} className={inputCls}>
              <option value="name">ترتيب: الاسم</option>
              <option value="qty_asc">الكمية: الأقل أولاً</option>
              <option value="qty_desc">الكمية: الأكثر أولاً</option>
            </select>
          </div>

          <div
            className="p-4 border-b border-border flex flex-wrap gap-4 text-sm"
            data-section="summary"
            data-section-label="الملخّص"
          >
            <span className="text-muted-foreground">
              الأصناف: <b className="text-foreground tabular-nums">{rows.length}</b>
            </span>
            <span className="text-muted-foreground">
              مجموع الكميات: <b className="text-foreground tabular-nums">{totals.qty.toLocaleString()}</b>
            </span>
            <span className="text-muted-foreground">
              نافد: <b className="text-destructive tabular-nums">{totals.out}</b>
            </span>
            <span className="text-muted-foreground">
              منخفض: <b className="text-warning tabular-nums">{totals.low}</b>
            </span>
          </div>

          <div className="overflow-x-auto" data-section="table" data-section-label="جدول الكميات">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted">
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الرقم</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">اسم الصنف</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">الكمية</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">الوحدة</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">الحدّ الأدنى</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      جاري التحميل...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      لا توجد أصناف مطابقة
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const st = stockState(r);
                    return (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-4 py-2 text-foreground tabular-nums">{r.sku || "—"}</td>
                        <td className="px-4 py-2 text-foreground font-medium">{r.name}</td>
                        <td className="px-4 py-2 text-center font-bold tabular-nums">
                          {Number(r.stock_quantity || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-center text-muted-foreground">{r.unit || "—"}</td>
                        <td className="px-4 py-2 text-center text-muted-foreground tabular-nums">
                          {r.min_stock == null ? "—" : Number(r.min_stock).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${STATE_CLASS[st]}`}>
                            {STATE_LABEL[st]}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
