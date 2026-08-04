/**
 * شاشة «كميات المنتجات» — العرض والبحث وتعديل الكمية والحدّ الأدنى.
 *
 * ## ما طلبه صاحب المستودع
 *   1. «نافذة جديدة مع المنتجات في السايدبار باسم كميات المنتجات تظهر لي
 *      كميات المنتجات مع بحث وفلترة حسب الرقم والاسم وهكذا».
 *   2. «أضف تعديل الكميات والحدّ الأدنى للمنتجات».
 *
 * ## ما يحرسه هذا الملف
 * الشاشة مركّبةٌ من قطعٍ مُختبَرة أصلاً (`leadsWithAny`، `EditableCell`)، فما
 * يبقى خطراً هو **الوصل**: مسارٌ غير مسجَّل، أو بحثٌ عاد إلى «يحتوي على»، أو
 * تعديلٌ بلا تراجعٍ عند الفشل — فيبقى على الشاشة رقمٌ ليس في القاعدة، وهو
 * أخطر ما في التحديث المتفائل.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leadsWithAny } from "@/utils/searchMatch";
import { parseQty } from "@/pages/ProductQuantitiesPage";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const PAGE = "src/pages/ProductQuantitiesPage.tsx";

describe("الشاشة موصولة بالتطبيق", () => {
  it("لها مسارٌ مسجَّل", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/products/quantities"');
    expect(app).toContain("ProductQuantitiesPage");
  });

  it("وتُحمَّل كسولاً كباقي الصفحات", () => {
    expect(read("src/App.tsx")).toContain('lazy(() => import("./pages/ProductQuantitiesPage"))');
  });

  it("ومدخلها في السايدبار تحت مدير المنتجات", () => {
    const sidebar = read("src/components/layout/AppSidebar.tsx");
    const group = sidebar.slice(sidebar.indexOf("مدير المنتجات"), sidebar.indexOf("أمر شراء"));
    expect(group).toContain('{ label: "كميات المنتجات", path: "/products/quantities" }');
  });
});

describe("البحث «يبدأ بـ» — نفس قاعدة شاشات الإدخال", () => {
  it("الصفحة تستعمل `leadsWithAny` لا «يحتوي على»", () => {
    const src = read(PAGE);
    expect(src).toContain("leadsWithAny([r.name, r.sku]");
    expect(src).not.toContain("includes(");
  });

  it("والقاعدة نفسها: «است» تُظهر ما يبدأ بها فقط", () => {
    const rows = [
      { name: "استانلس", sku: null },
      { name: "بوري است", sku: null },
      { name: "فلتر", sku: "AST-9" },
    ];
    const hit = rows.filter((r) => leadsWithAny([r.name, r.sku], "است")).map((r) => r.name);
    expect(hit).toEqual(["استانلس"]);
  });

  it("والرقم يُطابَق بالبداية كذلك", () => {
    const rows = [{ name: "أ", sku: "12" }, { name: "ب", sku: "120" }, { name: "ج", sku: "912" }];
    const hit = rows.filter((r) => leadsWithAny([r.name, r.sku], "12")).map((r) => r.sku);
    expect(hit).toEqual(["12", "120"]);
  });
});

describe("الأعمدة التي طلبها", () => {
  const src = read(PAGE);

  it.each(["الرقم", "اسم الصنف", "الكمية", "الوحدة", "الحدّ الأدنى", "الحالة"])(
    "عمود %s موجود",
    (col) => { expect(src).toContain(col); },
  );

  it("وفلترةٌ بحالة المخزون", () => {
    for (const label of ["نافد", "منخفض", "متوفّر"]) expect(src).toContain(label);
  });

  it("وترتيبٌ بالكمية صعوداً ونزولاً", () => {
    expect(src).toContain("qty_asc");
    expect(src).toContain("qty_desc");
  });
});

/* ─────────── التعديل ─────────── */

describe("تعديل الكمية والحدّ الأدنى", () => {
  const src = read(PAGE);

  it("الخانتان `<input>` تُثبَّتان عند المغادرة وعند Enter", () => {
    expect(src).toMatch(/onBlur=\{\(\) => commitCell\(r, "stock_quantity"\)\}/);
    expect(src).toMatch(/onBlur=\{\(\) => commitCell\(r, "min_stock"\)\}/);
    expect(src).toContain('if (e.key === "Enter")');
  });

  it("ولا ثالثةَ لهما — السعر والتصنيف مكانهما شاشة المنتجات", () => {
    const edited = src.match(/commitCell\(r, "(\w+)"\)/g) || [];
    const fields = new Set(edited.map((m) => m.split('"')[1]));
    expect([...fields].sort()).toEqual(["min_stock", "stock_quantity"]);
  });

  /**
   * التعديل «عن طريق التنقّل» — كجدول بنود الفاتورة: أسهمٌ بين الخانات،
   * والوصول يحدّد الرقم فتستبدله الضغطة الأولى.
   */
  it("والتنقّل بالأسهم موصولٌ بمُعالِج جدول البنود نفسه", () => {
    expect(src).toContain("makeRowNavHandler");
    expect(src).toMatch(/tableId: "product-quantities"/);
    expect(src).toMatch(/handleNav\(i, "quantity", e\)/);
    expect(src).toMatch(/handleNav\(i, "min_stock", e\)/);
  });

  it("والخانتان معلَّمتان بسمات التنقّل", () => {
    expect(src).toContain('data-nav-table="product-quantities"');
    expect(src).toContain('data-nav-col="quantity"');
    expect(src).toContain('data-nav-col="min_stock"');
  });

  it("والحفظ عند المغادرة لا على كل حرف — وإلا مئةُ نداءٍ لرقمٍ واحد", () => {
    // `onChange` يكتب في المسوّدة فقط، والقاعدة تُنادى من `commitCell`
    expect(src).toMatch(/onChange=\{\(e\) => onCellChange\(r, "stock_quantity", e\.target\.value\)\}/);
    const commit = src.slice(src.indexOf("const commitCell"), src.indexOf("const rows = useMemo"));
    expect(commit).toContain("saveField");
  });

  it("والتحديث متفائلٌ **مع تراجع** عند الفشل", () => {
    const fn = src.slice(src.indexOf("const saveField"), src.indexOf("const rows = useMemo"));
    expect(fn).toContain("patchLocal(row.id, field, n)");   // يظهر فوراً
    expect(fn).toContain("catch");
    expect(fn).toContain("patchLocal(row.id, field, Number(before ?? 0))"); // ويعود إن فشل
    expect(fn).toContain("فشل التحديث");
  });

  it("ولا كتابةَ بلا تغيير — لا نداءَ للقاعدة على قيمةٍ كما هي", () => {
    const fn = src.slice(src.indexOf("const saveField"), src.indexOf("const rows = useMemo"));
    expect(fn).toMatch(/if \(n === Number\(row\[field\] \?\? 0\)\) return;/);
  });

  it("وذاكرة شاشة المنتجات تُبطَل — وإلا قرأ من فتحها الرقمَ القديم", () => {
    const fn = src.slice(src.indexOf("const saveField"), src.indexOf("const rows = useMemo"));
    expect(fn).toContain('invalidateQueries({ queryKey: ["products"] })');
    expect(fn).toContain('new Event("products:changed")');
  });

  it("والمدخل غير الصالح يُرفض قبل أن يصل القاعدة", () => {
    const fn = src.slice(src.indexOf("const saveField"), src.indexOf("const rows = useMemo"));
    expect(fn).toContain("if (n === null)");
  });
});

/**
 * `parseQty` تُصدَّر من الصفحة لتُفحص هنا — قواعدها هي التي تحمي القاعدة من
 * رقمٍ فاسد، فلا تُترك بلا فحصٍ مباشر.
 */
describe("قراءة الرقم المُدخَل", () => {

  it("الفارغ صفر — لتصفير صنفٍ نفد", () => {
    expect(parseQty("")).toBe(0);
    expect(parseQty("   ")).toBe(0);
  });

  it("والأرقام العربية تُقرأ", () => {
    expect(parseQty("١٢٥")).toBe(125);
  });

  it("والفاصلة العشرية بشكليها", () => {
    expect(parseQty("1.5")).toBe(1.5);
    expect(parseQty("1،5")).toBe(1.5);
  });

  it("والنصّ يُرفض فلا يُكتب صفرٌ مكان الكمية", () => {
    expect(parseQty("abc")).toBeNull();
    expect(parseQty("12kg")).toBeNull();
  });

  it("والسالب مقبول — تسويةُ جردٍ قد تكشف عجزاً", () => {
    expect(parseQty("-3")).toBe(-3);
  });
});

/**
 * ورقة الجرد المطبوعة — ما طلبه صاحب المستودع حرفياً:
 * «الترويسة، وصورة المنتج، واسم المنتج، والكمية، والحدّ الأدنى… ويظهر التاريخ».
 */
describe("طباعة كشف الكميات", () => {
  const src = read(PAGE);

  it("ترويسةُ التقرير بعنوانٍ يقول ما هو", () => {
    expect(src).toContain("ReportPrintHeader");
    expect(src).toContain('title="كشف كميات المخزن"');
    expect(src).toContain("لمراجعة الكميات في المخزن");
  });

  it("والتاريخ يظهر عليها", () => {
    expect(src).toContain("function todayText");
    expect(src).toMatch(/periodText=\{`التاريخ: \$\{todayText\(\)\}/);
  });

  it("وصورة المنتج عمودٌ في الجدول", () => {
    expect(src).toContain("image_url");
    expect(src).toContain(">الصورة<");
    // وبديلٌ حين لا صورة — لا خانةٌ فارغة تُربك العدّاد
    expect(src).toContain("ImageOff");
  });

  it("والأعمدة الأربعة المطلوبة تُطبع", () => {
    for (const col of [">الصورة<", ">اسم الصنف<", "الكمية", "الحدّ الأدنى"]) {
      expect(src).toContain(col);
    }
  });

  it("وما عداها يُحذف من الورقة — الفلاتر والوحدة والحالة", () => {
    expect(src).toContain("qty-print-hide");
    const filters = src.slice(src.indexOf('data-section="filters"') - 300, src.indexOf('data-section="filters"'));
    expect(filters).toContain("qty-print-hide");
  });

  it("والترويسة تتكرّر على كل صفحة، والصفّ لا ينقسم", () => {
    expect(src).toContain("thead { display: table-header-group; }");
    expect(src).toContain("page-break-inside: avoid");
  });

  it("وصورةُ الطباعة بمقاسٍ ثابت — لا صورةٌ تبتلع الصفحة", () => {
    expect(src).toMatch(/\.qty-sheet img \{[^}]*width: 34px/);
  });
});

/**
 * الكمية والحدّ الأدنى عمودان يُكتبان مباشرةً — نفس قاعدة جدول البنود:
 * لا وضعَ تعديلٍ يُدخل، ولا مسطرةَ تحجز الضغطة.
 */
describe("الخانتان ضمن أعمدة الكتابة المباشرة", () => {
  it("`min_stock` أُضيف إلى المصدر الواحد", () => {
    const cols = read("src/utils/itemTableColumns.ts");
    expect(cols).toContain('"min_stock"');
    expect(cols).toContain('"quantity"');
  });
});
