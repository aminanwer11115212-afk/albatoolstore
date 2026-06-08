import { describe, it, expect } from "vitest";
import { normalizeAr, startsWithMatch, startsWithAny, filterByStartsWith } from "@/utils/searchMatch";

describe("normalizeAr", () => {
  it("يزيل التشكيل ويوحّد الألف والياء والتاء المربوطة", () => {
    expect(normalizeAr("أَوْريو")).toBe("اوريو");
    expect(normalizeAr("علىَ")).toBe("علي");
    expect(normalizeAr("شركةٌ")).toBe("شركه");
  });
  it("يحوّل لأحرف صغيرة ويقلّص الفراغات", () => {
    expect(normalizeAr("  HeLLo   World ")).toBe("hello world");
  });
});

describe("startsWithMatch", () => {
  it("بحث فارغ يطابق دائماً", () => {
    expect(startsWithMatch("أيّ شيء", "")).toBe(true);
    expect(startsWithMatch("", "")).toBe(true);
  });
  it("يطابق بداية النص", () => {
    expect(startsWithMatch("بسكويت اوريو", "بس")).toBe(true);
  });
  it("يطابق بداية أي كلمة داخل النص", () => {
    expect(startsWithMatch("بسكويت اوريو", "اور")).toBe(true);
  });
  it("لا يطابق في وسط الكلمة", () => {
    expect(startsWithMatch("بسكويت", "سكو")).toBe(false);
  });
  it("غير حساس لحالة الأحرف والتشكيل", () => {
    expect(startsWithMatch("Oreo", "or")).toBe(true);
    expect(startsWithMatch("أَوْريو", "او")).toBe(true);
  });
});

describe("startsWithAny", () => {
  it("يطابق إذا أي حقل مناسب", () => {
    expect(startsWithAny(["بسكويت", "SKU-001"], "sku")).toBe(true);
    expect(startsWithAny(["بسكويت", null, undefined], "بس")).toBe(true);
    expect(startsWithAny(["بسكويت"], "شو")).toBe(false);
  });
});

describe("filterByStartsWith", () => {
  it("يفلتر القائمة بحسب الحقول", () => {
    const items = [
      { name: "بسكويت", sku: "A1" },
      { name: "شوكولاتة", sku: "B2" },
    ];
    const r = filterByStartsWith(items, (i) => [i.name, i.sku], "ب");
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("بسكويت");
  });
});
