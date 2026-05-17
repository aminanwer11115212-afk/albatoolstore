import { describe, it, expect } from "vitest";

/**
 * يوثّق سلوك عرض عمودي "الفئة" و"الماركة" في جدول /products
 * (المنطق الفعلي مضمَّن داخل ProductsPage.tsx — انظر السطور ~1462-1523).
 *
 * القواعد:
 * 1) الفئة: تُعرض ككلمة واحدة فقط (قائمة منسدلة واحدة بقيمة الفئة الأساسية).
 *    لا يوجد سطر إضافي حتى لو كان للمنتج عدة فئات.
 * 2) الماركة: تُعرض القائمة المنسدلة دائماً للماركة الأساسية.
 *    إذا كان للمنتج أكثر من ماركة → يظهر سطر نصي بجانبها يحوي كل الأسماء مفصولة بـ "،".
 *    إذا كانت ماركة واحدة أو لا شيء → لا يظهر السطر النصي.
 */

type Item = { id: string; name: string };
type Product = {
  id: string;
  name?: string;
  category_id?: string | null;
  company_id?: string | null;
  categories?: Item[];
  brands?: Item[];
  product_categories?: Item | null;
  product_companies?: Item | null;
};

// نسخ مطابقة لمنطق الخلية في ProductsPage.tsx
function deriveCategoryCell(p: Product) {
  const cats: Item[] = (p.categories && p.categories.length > 0)
    ? p.categories
    : (p.product_categories ? [p.product_categories] : []);
  const allNames = cats.map((c) => c.name).filter(Boolean).join("، ");
  const primaryId = p.categories?.[0]?.id || p.category_id || "";
  return { allNames, primaryId, count: cats.length };
}

function deriveBrandCell(p: Product) {
  const brs: Item[] = (p.brands && p.brands.length > 0)
    ? p.brands
    : (p.product_companies ? [p.product_companies] : []);
  const allBrandNames = brs.map((b) => b.name).filter(Boolean).join("، ");
  const showBrandsLine = brs.length > 1;
  const primaryId = p.brands?.[0]?.id || p.company_id || "";
  return { allBrandNames, showBrandsLine, primaryId, count: brs.length };
}

describe("ProductsPage — خلية الفئة", () => {
  it("منتج بلا فئة: لا اسم ولا قيمة أساسية", () => {
    const r = deriveCategoryCell({ id: "p1", name: "x" });
    expect(r.count).toBe(0);
    expect(r.allNames).toBe("");
    expect(r.primaryId).toBe("");
  });

  it("منتج بفئة واحدة: تظهر باسمها وتكون هي الأساسية", () => {
    const r = deriveCategoryCell({
      id: "p2",
      name: "x",
      categories: [{ id: "c1", name: "اكس 100" }],
    });
    expect(r.count).toBe(1);
    expect(r.allNames).toBe("اكس 100");
    expect(r.primaryId).toBe("c1");
  });

  it("منتج بعدة فئات: الأولى هي الأساسية ولا يتم تكرار العرض في خلية واحدة", () => {
    const r = deriveCategoryCell({
      id: "p3",
      name: "x",
      categories: [
        { id: "c1", name: "اكس 100" },
        { id: "c2", name: "سى جى" },
      ],
    });
    expect(r.count).toBe(2);
    expect(r.primaryId).toBe("c1");
    // allNames موجود لكنه لا يُعرض في الـ UI للفئة (الخلية تستخدم InlineSearchSelect واحد فقط).
    expect(r.allNames).toBe("اكس 100، سى جى");
  });
});

describe("ProductsPage — خلية الماركة", () => {
  it("منتج بلا ماركة: لا سطر نصي ولا قيمة أساسية", () => {
    const r = deriveBrandCell({ id: "p1", name: "x" });
    expect(r.count).toBe(0);
    expect(r.showBrandsLine).toBe(false);
    expect(r.allBrandNames).toBe("");
    expect(r.primaryId).toBe("");
  });

  it("منتج بماركة واحدة: لا يظهر السطر النصي الإضافي", () => {
    const r = deriveBrandCell({
      id: "p2",
      name: "x",
      brands: [{ id: "b1", name: "Susukai" }],
    });
    expect(r.count).toBe(1);
    expect(r.showBrandsLine).toBe(false);
    expect(r.primaryId).toBe("b1");
  });

  it("منتج بعدة ماركات: يظهر السطر بكل الأسماء مفصولة بـ ،", () => {
    const r = deriveBrandCell({
      id: "p3",
      name: "x",
      brands: [
        { id: "b1", name: "YAYE" },
        { id: "b2", name: "Susukai" },
        { id: "b3", name: "باجو" },
      ],
    });
    expect(r.count).toBe(3);
    expect(r.showBrandsLine).toBe(true);
    expect(r.allBrandNames).toBe("YAYE، Susukai، باجو");
    expect(r.primaryId).toBe("b1");
  });

  it("fallback: استخدام product_companies عند غياب brands", () => {
    const r = deriveBrandCell({
      id: "p4",
      name: "x",
      company_id: "b9",
      product_companies: { id: "b9", name: "CMG" },
    });
    expect(r.count).toBe(1);
    expect(r.showBrandsLine).toBe(false);
    expect(r.primaryId).toBe("b9");
    expect(r.allBrandNames).toBe("CMG");
  });
});
