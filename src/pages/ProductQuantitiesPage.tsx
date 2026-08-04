/**
 * كميات المنتجات — كشفُ جردٍ يُقرأ ويُصحَّح ويُطبع.
 *
 * ## ما طلبه صاحب المستودع
 *   • «تظهر لي كميات المنتجات مع بحث وفلترة حسب الرقم والاسم».
 *   • «أضف تعديل الكميات والحدّ الأدنى… عن طريق التنقّل».
 *   • «ازبط الطباعة لكشف الكميات: الترويسة، وصورة المنتج، واسم المنتج،
 *     والكمية، والحدّ الأدنى — لمراجعة الكميات في المخزن، ويظهر التاريخ».
 *
 * ## لماذا شاشةٌ مستقلّة عن «إدارة جميع المنتجات»
 * تلك شاشةُ تحريرٍ شاملة: أعمدةٌ كثيرة وأسعارٌ وتصنيفات. وهذه شاشةُ **الجرد**:
 * صورةٌ واسمٌ وكميةٌ وحدٌّ أدنى — تُفتح للعدّ في المخزن، وتُطبع فتُمشى بها بين
 * الرفوف.
 *
 * ## التعديل بالتنقّل — كجدول بنود الفاتورة
 * الخانتان `<input>` عاديتان بأسهم تنقّلٍ بينهما: سهمٌ لأعلى وأسفل بين الصفوف،
 * ويمين ويسار بين العمودين، والوصول يحدّد الرقم فتستبدله الضغطة الأولى.
 * وهي القاعدة نفسها المطبَّقة في شاشات الإدخال (`itemTableColumns`) — فمن
 * يعرف جدول البنود يعرف هذا الجدول بلا تعلّمٍ جديد.
 *
 * والحفظ عند مغادرة الخانة أو Enter: **لا نداءَ للقاعدة على كل حرف**، وإلا
 * صار العدّ بطيئاً ومئةُ نداءٍ لرقمٍ واحد.
 *
 * ## التعديل هنا: الكمية والحدّ الأدنى وحدهما
 * من يعدّ المخزن لا يريد أن يُخطئ في سعرٍ بضغطةٍ في العمود المجاور. والسعر
 * مكانه شاشة المنتجات.
 *
 * والكمية عمودٌ تكتبه حركاتُ الفواتير والمشتريات أيضاً، فتعديلها هنا **تسوية
 * جردٍ يدوية** لا حركة مخزون: تُصحّح الرقم إلى ما في الرفّ فعلاً.
 *
 * ## البحث «يبدأ بـ» لا «يحتوي على»
 * نفس قاعدة شاشات الإدخال: كتابة «است» تُظهر ما يبدأ بها فقط.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, PackageSearch, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { fetchAllProducts } from "@/lib/fetchAllProducts";
import { leadsWithAny, normalizeAr } from "@/utils/searchMatch";
import { makeRowNavHandler } from "@/utils/itemTableNav";
import { useProducts } from "@/hooks/useData";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import ReportPrintHeader from "@/components/ReportPrintHeader";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  image_url: string | null;
  stock_quantity: number | null;
  min_stock: number | null;
};

type StockFilter = "all" | "out" | "low" | "in";
type EditableField = "stock_quantity" | "min_stock";

/** حالة المخزون بقاعدةٍ واحدة تُستعمل في الفلتر وفي الشارة. */
function stockState(r: Row): Exclude<StockFilter, "all"> {
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

/**
 * رقمٌ من حقل إدخال: يقبل الفاصلة العشرية العربية، والفارغ صفر.
 * `null` = مدخلٌ غير صالح فلا يُكتب شيء.
 */
export function parseQty(v: string): number | null {
  const t = String(v ?? "")
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace("،", ".")
    .replace(",", ".");
  if (t === "") return 0;
  if (!/^-?\d*(\.\d*)?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** تاريخ اليوم كما يُقرأ على ورقة الجرد. */
function todayText(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const NAV_COLS = ["quantity", "min_stock"];

export default function ProductQuantitiesPage() {
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sort, setSort] = useState<"name" | "qty_asc" | "qty_desc">("name");
  /** ما يكتبه المستخدم قبل الحفظ — يُمسح عند التثبيت أو التراجع. */
  const [draft, setDraft] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const { update } = useProducts();

  const { data, isLoading } = useQuery({
    queryKey: ["product-quantities"],
    queryFn: async () =>
      fetchAllProducts<Row>("id, name, sku, unit, image_url, stock_quantity, min_stock"),
  });

  /**
   * تعديل الكمية أو الحدّ الأدنى — تفاؤلٌ مع تراجع.
   *
   * الرقم يظهر فوراً على الشاشة قبل ردّ القاعدة، فالجرد يمشي بلا انتظار. وإن
   * فشلت الكتابة عاد الرقم القديم مع رسالةٍ صريحة — لا يبقى على الشاشة رقمٌ
   * ليس في القاعدة، وهو أخطر ما في التحديث المتفائل.
   *
   * وتُبطَل ذاكرة شاشة المنتجات: من عدّل هنا ثم فتحها كان يقرأ الرقم القديم.
   */
  const patchLocal = (id: string, field: EditableField, value: number) =>
    queryClient.setQueryData<Row[]>(["product-quantities"], (old) =>
      (old || []).map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const saveField = async (row: Row, field: EditableField, raw: string) => {
    const n = parseQty(raw);
    if (n === null) { toast.error("أرقام فقط"); return; }
    if (n === Number(row[field] ?? 0)) return;      // لا كتابةَ بلا تغيير
    const before = row[field];
    patchLocal(row.id, field, n);
    try {
      await update.mutateAsync({ id: row.id, [field]: n });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products-with-details"] });
      window.dispatchEvent(new Event("products:changed"));
    } catch (e: any) {
      patchLocal(row.id, field, Number(before ?? 0));
      toast.error(e?.message || "فشل التحديث — تم التراجع");
    }
  };

  /* ─── الخلايا: مسوّدةٌ تُثبَّت عند المغادرة ─── */
  const key = (id: string, f: EditableField) => `${id}:${f}`;
  const cellValue = (r: Row, f: EditableField) => draft[key(r.id, f)] ?? String(r[f] ?? "");
  const onCellChange = (r: Row, f: EditableField, v: string) =>
    setDraft((d) => ({ ...d, [key(r.id, f)]: v }));
  const commitCell = (r: Row, f: EditableField) => {
    const k = key(r.id, f);
    if (!(k in draft)) return;                      // لم يُلمَس
    const raw = draft[k];
    setDraft((d) => { const next = { ...d }; delete next[k]; return next; });
    void saveField(r, f, raw);
  };

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

  const handleNav = makeRowNavHandler({
    tableId: "product-quantities",
    cols: NAV_COLS,
    getRowCount: () => rows.length,
  });

  // الإجماليات على المعروض لا على الكل — فتتبع ما تراه العين
  const totals = useMemo(() => {
    const out = rows.filter((r) => stockState(r) === "out").length;
    const low = rows.filter((r) => stockState(r) === "low").length;
    const qty = rows.reduce((s, r) => s + Number(r.stock_quantity || 0), 0);
    return { out, low, qty };
  }, [rows]);

  const inputCls =
    "bg-muted rounded-lg px-3 py-2 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary";
  const cellInputCls =
    "w-full bg-transparent text-center tabular-nums font-bold outline-none border border-transparent rounded px-1 py-1 focus:border-primary focus:bg-primary/5";

  return (
    <div className="space-y-6">
      {/*
        ورقة الجرد المطبوعة: صورةٌ واسمٌ وكميةٌ وحدٌّ أدنى لا غير.
        الفلاتر والأزرار وأعمدة الشاشة الأخرى تُحذف — ورقةٌ تُمشى بها بين
        الرفوف لا لقطةُ شاشة. والترويسة تتكرّر على كل صفحة، والصفّ لا ينقسم.
      */}
      <style>{`
        @media print {
          .qty-sheet table { width: 100%; border-collapse: collapse; }
          .qty-sheet thead { display: table-header-group; }
          .qty-sheet tr { page-break-inside: avoid; break-inside: avoid; }
          .qty-sheet th, .qty-sheet td {
            border: 1px solid #999; padding: 4px 6px; font-size: 11px; color: #111;
          }
          .qty-sheet thead th { background: #ede9fb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .qty-sheet img { width: 34px; height: 34px; object-fit: contain; }
          .qty-print-hide { display: none !important; }
          .qty-sheet input { border: 0 !important; background: transparent !important; font-weight: 700; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageSearch size={22} /> كميات المنتجات
        </h1>
        <span className="text-xs text-muted-foreground">
          تنقّل بالأسهم بين الخانات — واكتب الرقم مباشرةً
        </span>
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
        shareTitle="كشف كميات المخزن"
        shareSummary={`عدد الأصناف: ${rows.length} • التاريخ: ${todayText()}`}
        pdfFilename={`كميات-المنتجات-${new Date().toISOString().split("T")[0]}`}
      />

      <div className="printable-statement">
        <ReportPrintHeader
          title="كشف كميات المخزن"
          subtitle="لمراجعة الكميات في المخزن"
          periodText={`التاريخ: ${todayText()} • الأصناف: ${rows.length}${search ? ` • بحث: ${search}` : ""}`}
        />

        <div className="legacy-card card-block qty-sheet">
          <div
            className="p-4 border-b border-border flex flex-wrap gap-3 items-center justify-between qty-print-hide"
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
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground w-10">#</th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground w-14">الصورة</th>
                  <th className="text-right px-3 py-3 font-semibold text-muted-foreground">اسم الصنف</th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground w-24" title="انقر أو تنقّل بالأسهم للتعديل">
                    الكمية <span className="text-[10px] font-normal opacity-70">✎</span>
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground w-24" title="انقر أو تنقّل بالأسهم للتعديل">
                    الحدّ الأدنى <span className="text-[10px] font-normal opacity-70">✎</span>
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground qty-print-hide">الوحدة</th>
                  <th className="text-center px-3 py-3 font-semibold text-muted-foreground qty-print-hide">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد أصناف مطابقة</td>
                  </tr>
                ) : (
                  rows.map((r, i) => {
                    const st = stockState(r);
                    return (
                      <tr key={r.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="px-3 py-1 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1 text-center">
                          {r.image_url ? (
                            <img
                              src={r.image_url}
                              alt={r.name}
                              loading="lazy"
                              className="w-9 h-9 object-contain rounded border border-border bg-white inline-block"
                            />
                          ) : (
                            <span className="inline-flex w-9 h-9 items-center justify-center rounded border border-dashed border-border text-muted-foreground/50">
                              <ImageOff size={14} />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1 text-foreground font-medium">{r.name}</td>
                        <td className="px-1 py-1">
                          <input
                            className={cellInputCls}
                            inputMode="decimal"
                            data-nav-table="product-quantities"
                            data-nav-row={i}
                            data-nav-col="quantity"
                            aria-label={`كمية ${r.name}`}
                            value={cellValue(r, "stock_quantity")}
                            onChange={(e) => onCellChange(r, "stock_quantity", e.target.value)}
                            onBlur={() => commitCell(r, "stock_quantity")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitCell(r, "stock_quantity"); }
                              handleNav(i, "quantity", e);
                            }}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            className={cellInputCls}
                            inputMode="decimal"
                            data-nav-table="product-quantities"
                            data-nav-row={i}
                            data-nav-col="min_stock"
                            aria-label={`الحدّ الأدنى ${r.name}`}
                            value={cellValue(r, "min_stock")}
                            onChange={(e) => onCellChange(r, "min_stock", e.target.value)}
                            onBlur={() => commitCell(r, "min_stock")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitCell(r, "min_stock"); }
                              handleNav(i, "min_stock", e);
                            }}
                          />
                        </td>
                        <td className="px-3 py-1 text-center text-muted-foreground qty-print-hide">{r.unit || "—"}</td>
                        <td className="px-3 py-1 text-center qty-print-hide">
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
