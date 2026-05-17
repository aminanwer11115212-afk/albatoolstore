import { describe, it, expect } from "vitest";

/**
 * منطق فلترة بحث المنتجات في شاشات الإنشاء — يضمن:
 * - عدم استبعاد منتجات صفر المخزون من النتائج
 * - تطابق على الاسم والـ SKU واسم الشركة
 * - عدم الحساسية لحالة الأحرف
 */
type P = { id: string; name: string; sku?: string | null; company?: string | null; stock_quantity?: number };

function filterProducts(list: P[], query: string): P[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return list;
  return list.filter((p) =>
    [p.name, p.sku || "", p.company || ""].join(" ").toLowerCase().includes(q),
  );
}

const SAMPLE: P[] = [
  { id: "1", name: "بسكويت أوريو", sku: "SKU-001", company: "ناشيونال", stock_quantity: 10 },
  { id: "2", name: "شوكولاتة", sku: "SKU-002", company: "كادبوري", stock_quantity: 0 },
  { id: "3", name: "عصير برتقال", sku: "JUI-007", company: "المراعي", stock_quantity: 5 },
  { id: "4", name: "ماء معدني", sku: null, company: "اسم", stock_quantity: 100 },
];

describe("Product search filtering", () => {
  it("بحث فارغ يُرجع كل المنتجات", () => {
    expect(filterProducts(SAMPLE, "")).toHaveLength(4);
  });

  it("لا يستبعد منتجات صفر المخزون", () => {
    const r = filterProducts(SAMPLE, "شوكولاتة");
    expect(r).toHaveLength(1);
    expect(r[0].stock_quantity).toBe(0);
  });

  it("يطابق على SKU", () => {
    expect(filterProducts(SAMPLE, "JUI-007")).toHaveLength(1);
  });

  it("يطابق على اسم الشركة", () => {
    expect(filterProducts(SAMPLE, "كادبوري")).toHaveLength(1);
  });

  it("بحث بدون تطابق يُرجع قائمة فارغة", () => {
    expect(filterProducts(SAMPLE, "غير موجود")).toEqual([]);
  });

  it("غير حسّاس لحالة الأحرف", () => {
    expect(filterProducts(SAMPLE, "SKU-001")).toHaveLength(1);
    expect(filterProducts(SAMPLE, "sku-001")).toHaveLength(1);
  });

  it("يتعامل مع SKU = null بدون انهيار", () => {
    expect(filterProducts(SAMPLE, "ماء")).toHaveLength(1);
  });
});
