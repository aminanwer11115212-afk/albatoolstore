import { describe, it, expect } from "vitest";

/**
 * يوثّق منطق تغيير "الفئة/الماركة الأساسية" من خلية الجدول في ProductsPage.tsx
 * (مرتبط بالمعالجات onChange داخل الخليتين — راجع السطور ~1763 و~1816).
 *
 * القاعدة الذهبية:
 *   عند تغيير العنصر الأساسي من القائمة المنسدلة، يجب أن:
 *   1) تُستبدل القيمة الأساسية القديمة بالجديدة.
 *   2) يُحافَظ على بقية الفئات/الماركات الإضافية كما هي.
 *   3) لا تتكرر القيم (Set).
 *   4) إذا أُلغيت القيمة الأساسية (تمرير "") تُحذف القديمة فقط من القائمة دون لمس الباقي.
 *   5) إذا اختار المستخدم قيمة موجودة أصلاً في القائمة الإضافية، تصبح هي الأساسية
 *      وتُحذف نسختها المكررة (بفضل Set + unshift).
 */

// نسخة طبق الأصل من المنطق داخل onChange (الفئة/الماركة) في ProductsPage.tsx
function computeNextLinks(
  existingIds: string[],
  currentPrimaryId: string,
  newPrimaryId: string,
): string[] {
  const replaced = existingIds.map((id) => (id === currentPrimaryId ? newPrimaryId : id));
  const next = Array.from(new Set(replaced.filter(Boolean)));
  if (newPrimaryId && !next.includes(newPrimaryId)) next.unshift(newPrimaryId);
  if (!newPrimaryId) {
    const idx = next.indexOf(currentPrimaryId);
    if (idx >= 0) next.splice(idx, 1);
  }
  return next;
}

describe("ProductsPage — تغيير الفئة/الماركة الأساسية لا يحذف الإضافية", () => {
  it("يستبدل الأساسية فقط ويحافظ على فئتين إضافيتين", () => {
    const result = computeNextLinks(["c1", "c2", "c3"], "c1", "cNEW");
    expect(result).toEqual(["cNEW", "c2", "c3"]);
    expect(result).toHaveLength(3);
  });

  it("منتج بفئة واحدة فقط: استبدال كامل", () => {
    const result = computeNextLinks(["c1"], "c1", "cNEW");
    expect(result).toEqual(["cNEW"]);
  });

  it("منتج بلا فئة سابقة + اختيار فئة جديدة: تُضاف للأعلى", () => {
    const result = computeNextLinks([], "", "cNEW");
    expect(result).toEqual(["cNEW"]);
  });

  it("اختيار فئة موجودة أصلاً في الإضافية تجعلها الأساسية بدون تكرار", () => {
    // c1 أساسية، والمستخدم اختار c2 (الموجودة فعلاً) → c2 تصبح الأساسية
    const result = computeNextLinks(["c1", "c2", "c3"], "c1", "c2");
    // c1 استُبدلت بـ c2 → [c2, c2, c3] → Set → [c2, c3]
    expect(result).toEqual(["c2", "c3"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("إلغاء الفئة الأساسية (تمرير '') يحذف القديمة فقط ويُبقي الباقي", () => {
    const result = computeNextLinks(["c1", "c2", "c3"], "c1", "");
    expect(result).toEqual(["c2", "c3"]);
  });

  it("إلغاء الأساسية مع وجود فئة واحدة فقط: قائمة فارغة", () => {
    const result = computeNextLinks(["c1"], "c1", "");
    expect(result).toEqual([]);
  });

  it("سيناريو حقيقي: 5 فئات + تغيير الأساسية يبقي الـ 4 الإضافية", () => {
    const result = computeNextLinks(["A", "B", "C", "D", "E"], "A", "Z");
    expect(result).toEqual(["Z", "B", "C", "D", "E"]);
    expect(result).toHaveLength(5);
    expect(result.slice(1)).toEqual(["B", "C", "D", "E"]); // الإضافية محفوظة بترتيبها
  });

  it("نفس المنطق ينطبق على الماركات (mirror)", () => {
    const result = computeNextLinks(["b1", "b2"], "b1", "bNEW");
    expect(result).toEqual(["bNEW", "b2"]);
  });

  it("لا يُدخل قيمة فارغة أو null في القائمة", () => {
    const result = computeNextLinks(["c1", "", "c2"], "c1", "cNEW");
    // filter(Boolean) يزيل ""
    expect(result).toEqual(["cNEW", "c2"]);
  });
});

/**
 * اختبار عرض الخليتين بعد التغيير المتفائل (Optimistic):
 *   patchProductCaches يستبدل categories/brands ويُحدّث الأساسية + product_categories/product_companies.
 *   نتأكد أن الخلية تعرض النتيجة الصحيحة فوراً قبل رد الخادم.
 */
type Item = { id: string; name: string };
type Product = {
  id: string;
  category_id?: string | null;
  company_id?: string | null;
  categories?: Item[];
  brands?: Item[];
  product_categories?: Item | null;
  product_companies?: Item | null;
};

function applyOptimisticCategoryChange(
  p: Product,
  newPrimaryId: string,
  catOptions: Item[],
): Product {
  const existing = (p.categories || []).map((c) => c.id);
  const next = computeNextLinks(existing, p.category_id || p.categories?.[0]?.id || "", newPrimaryId);
  const catMap = new Map<string, Item>(catOptions.map((c) => [c.id, c]));
  const newCats = next.map((id) => catMap.get(id) || { id, name: "" });
  return {
    ...p,
    category_id: newPrimaryId || null,
    categories: newCats,
    product_categories: newCats[0] || null,
  };
}

describe("ProductsPage — الـ Optimistic لعرض الخلية بعد تغيير الأساسية", () => {
  const catOptions: Item[] = [
    { id: "c1", name: "اكس 100" },
    { id: "c2", name: "سى جى" },
    { id: "c3", name: "باجو" },
    { id: "cNEW", name: "YAYE" },
  ];

  it("تغيير الأساسية: تظهر فوراً مع الأسماء كاملة وبقية الفئات محفوظة", () => {
    const p: Product = {
      id: "p1",
      category_id: "c1",
      categories: [
        { id: "c1", name: "اكس 100" },
        { id: "c2", name: "سى جى" },
        { id: "c3", name: "باجو" },
      ],
    };
    const next = applyOptimisticCategoryChange(p, "cNEW", catOptions);
    expect(next.category_id).toBe("cNEW");
    expect(next.categories?.map((c) => c.id)).toEqual(["cNEW", "c2", "c3"]);
    expect(next.categories?.map((c) => c.name)).toEqual(["YAYE", "سى جى", "باجو"]);
    expect(next.product_categories?.id).toBe("cNEW");
  });

  it("إلغاء الأساسية: تبقى الفئتان الأخريان", () => {
    const p: Product = {
      id: "p1",
      category_id: "c1",
      categories: [
        { id: "c1", name: "اكس 100" },
        { id: "c2", name: "سى جى" },
        { id: "c3", name: "باجو" },
      ],
    };
    const next = applyOptimisticCategoryChange(p, "", catOptions);
    expect(next.category_id).toBeNull();
    expect(next.categories?.map((c) => c.id)).toEqual(["c2", "c3"]);
    expect(next.product_categories?.id).toBe("c2");
  });

  it("منتج بفئة واحدة → تغييرها يستبدلها بالكامل", () => {
    const p: Product = {
      id: "p1",
      category_id: "c1",
      categories: [{ id: "c1", name: "اكس 100" }],
    };
    const next = applyOptimisticCategoryChange(p, "cNEW", catOptions);
    expect(next.categories).toEqual([{ id: "cNEW", name: "YAYE" }]);
    expect(next.category_id).toBe("cNEW");
  });

  it("منتج بلا فئة → اختيار جديدة تظهر فوراً", () => {
    const p: Product = { id: "p1", categories: [] };
    const next = applyOptimisticCategoryChange(p, "cNEW", catOptions);
    expect(next.categories).toEqual([{ id: "cNEW", name: "YAYE" }]);
    expect(next.product_categories).toEqual({ id: "cNEW", name: "YAYE" });
  });

  it("اختيار فئة موجودة في الإضافية تصبح الأساسية بدون تكرار", () => {
    const p: Product = {
      id: "p1",
      category_id: "c1",
      categories: [
        { id: "c1", name: "اكس 100" },
        { id: "c2", name: "سى جى" },
      ],
    };
    const next = applyOptimisticCategoryChange(p, "c2", catOptions);
    expect(next.categories?.map((c) => c.id)).toEqual(["c2"]);
    expect(next.category_id).toBe("c2");
  });
});
