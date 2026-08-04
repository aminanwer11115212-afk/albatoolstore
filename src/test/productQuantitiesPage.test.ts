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

  it("الخانتان قابلتان للتحرير", () => {
    expect(src).toMatch(/onSave=\{\(v\) => saveField\(r, "stock_quantity", v\)\}/);
    expect(src).toMatch(/onSave=\{\(v\) => saveField\(r, "min_stock", v\)\}/);
  });

  it("ولا ثالثةَ لهما — السعر والتصنيف مكانهما شاشة المنتجات", () => {
    const editable = src.match(/saveField\(r, "(\w+)"/g) || [];
    const fields = new Set(editable.map((m) => m.split('"')[1]));
    expect([...fields].sort()).toEqual(["min_stock", "stock_quantity"]);
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
