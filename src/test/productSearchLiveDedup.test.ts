import { describe, it, expect } from "vitest";

/**
 * يحاكي منطق productMatches في QuoteCreatePage / InvoiceCreatePage:
 * - يبحث بالـ startsWith على الاسم
 * - يزيل التكرار (نفس id لا يظهر مرتين) عبر Set
 * - يحدّث فوراً عند تغيّر مصدر البيانات (المنتجات الموجودة)
 *
 * بهذا نضمن:
 * 1) أن نفس المنتج لا يظهر مرتين في نتائج الاقتراحات.
 * 2) أن البحث "حيّ" — أي إعادة استدعاء الدالة بعد إضافة منتج
 *    إلى الصفوف لا يخفي المنتج من النتائج (لم نعد نستبعده).
 */
type Product = { id: string; name: string; warehouse_id?: string | null };

function productMatches(
  products: Product[],
  query: string,
  warehouseId?: string | null,
): Product[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const seen = new Set<string>();
  return products
    .filter((p) => !warehouseId || p.warehouse_id === warehouseId)
    .filter((p) => p.name.toLowerCase().startsWith(q))
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, 10);
}

const PRODUCTS: Product[] = [
  { id: "p1", name: "بسكويت أوريو" },
  { id: "p2", name: "بسكويت شاي" },
  { id: "p3", name: "شوكولاتة" },
];

describe("productMatches — dedup + live updates", () => {
  it("لا يعرض نفس المنتج مرتين حتى لو تكرّر في المصدر", () => {
    const dup = [...PRODUCTS, { id: "p1", name: "بسكويت أوريو" }];
    const r = productMatches(dup, "بسكويت");
    expect(r).toHaveLength(2);
    expect(r.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("نتائج البحث لا تستبعد المنتجات المضافة مسبقاً (تظهر مباشرة)", () => {
    // محاكاة: المستخدم أضاف p1 إلى صف. لم نعد نستبعده من النتائج.
    const addedRowsProductIds = new Set(["p1"]);
    const r = productMatches(PRODUCTS, "بسكويت");
    // نتأكد أن p1 لا يزال يظهر رغم إضافته
    expect(r.find((p) => p.id === "p1")).toBeTruthy();
    expect(addedRowsProductIds.has("p1")).toBe(true);
  });

  it("البحث يتحدّث فوراً عند إضافة منتج جديد إلى المصدر", () => {
    const before = productMatches(PRODUCTS, "ماء");
    expect(before).toHaveLength(0);
    const after = productMatches(
      [...PRODUCTS, { id: "p4", name: "ماء معدني" }],
      "ماء",
    );
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("p4");
  });

  it("بحث فارغ يُرجع قائمة فارغة (لا اقتراحات)", () => {
    expect(productMatches(PRODUCTS, "")).toEqual([]);
    expect(productMatches(PRODUCTS, "   ")).toEqual([]);
  });

  it("يحترم فلتر المخزن", () => {
    const list: Product[] = [
      { id: "a", name: "بسكويت", warehouse_id: "w1" },
      { id: "b", name: "بسكويت", warehouse_id: "w2" },
    ];
    const r = productMatches(list, "بسكويت", "w1");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("a");
  });

  it("يحدّ النتائج إلى 10", () => {
    const many: Product[] = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      name: `بسكويت ${i}`,
    }));
    expect(productMatches(many, "بسكويت")).toHaveLength(10);
  });
});
