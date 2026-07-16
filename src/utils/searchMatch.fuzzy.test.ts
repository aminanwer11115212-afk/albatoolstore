import { describe, it, expect } from "vitest";
import { containsAny, fuzzyMatch, damerauLevenshtein } from "./searchMatch";

/**
 * اختبارات وحدة للبحث الذكي: تحمّل أخطاء إملائية بسيطة (استبدال/إضافة/حذف
 * حرف) وتبادل ترتيب حرفين متجاورين، وأيضاً تطبيع الحروف العربية.
 * نستخدم Vitest لأن هذه دوال بحتة لا تتطلب متصفح.
 */
describe("fuzzy customer search", () => {
  it("damerauLevenshtein counts a transposition as one edit", () => {
    expect(damerauLevenshtein("محمد", "محدم")).toBeLessThanOrEqual(1);
  });

  it("matches with single-letter substitution", () => {
    expect(fuzzyMatch("محمد أحمد", "محند")).toBe(true);
  });

  it("matches with adjacent-letter swap", () => {
    // "أحمد" ↔ "أمحد" — تبادل ح/م
    expect(fuzzyMatch("أحمد علي", "أمحد")).toBe(true);
  });

  it("containsAny falls back to fuzzy for typo in customer name", () => {
    const c = { name: "خالد الحربي", phone: "0501234567", company: null };
    // خطأ إملائي بسيط في "خالد"
    expect(containsAny([c.name, c.phone, c.company], "خلاد")).toBe(true);
  });

  it("containsAny still returns false for unrelated queries", () => {
    const c = { name: "خالد الحربي", phone: "0501234567", company: null };
    expect(containsAny([c.name, c.phone, c.company], "زينب")).toBe(false);
  });
});
