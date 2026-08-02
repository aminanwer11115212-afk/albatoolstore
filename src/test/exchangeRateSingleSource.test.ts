// معدّل الصرف يُشتقّ من مصدر واحد في كل مسارات إضافة الصنف.
//
// العطل تكرّر لأن الحساب مكتوبٌ في أربعة مواضع: صفّ الجدول وشريط الإضافة
// السريعة، في شاشتَي الفاتورة وعرض السعر. أُصلح اثنان أوّلاً وبقي اثنان —
// **وهذا الاختبار هو ما كشفهما**، لا القراءة.
//
// فهو لا يفحص رقماً، بل يمنع وجود الحساب الخام أصلاً.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** الشاشات التي تختار منتجاً وتشتقّ سعره المحلي. */
const ENTRY_SCREENS = [
  "src/screens/InvoiceCreateScreen.tsx",
  "src/pages/QuoteCreatePage.tsx",
];

describe("معدّل الصرف عند اختيار المنتج", () => {
  it.each(ENTRY_SCREENS)("%s لا يحرس بـ`> 0` — فالواحد يمرّ منه", (file) => {
    // النمط المعطوب: rate > 0 ? rowRate : defaultRate
    // الصفّ الفارغ يُنشأ بـ1، و1 > 0، فيمرّ ويُنزل السعر الأجنبي مكان المحلي.
    const src = read(file);
    expect(src).not.toMatch(/\(\s*Number\(\s*r\.exchange_rate\s*\)\s*\|\|\s*0\s*\)\s*>\s*0\s*\?/);
  });

  /**
   * الفحص محصورٌ في دوالّ **اختيار المنتج**. والضرب المباشر في معدّل الصفّ
   * مشروعٌ خارجها — حين يكتب المستخدم سعراً أجنبياً بيده، فمعدّل الصفّ حينها
   * مثبَّتٌ صحيحاً من لحظة اختيار المنتج. توسيع الفحص ليشملها يُنذر كاذباً
   * ويُعلّم تجاهل الحارس.
   */
  it.each(ENTRY_SCREENS)("%s: دوالّ الاختيار لا تضرب في معدّل الصفّ مباشرةً", (file) => {
    const src = read(file);
    const bodies = [...src.matchAll(/function pickProduct\w*\([^)]*\)\s*\{/g)]
      .map((m) => src.slice(m.index!, src.indexOf("\n  }", m.index!)));
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) {
      expect(body).not.toMatch(/\bfp\s*\*\s*r\.exchange_rate\b/);
    }
  });

  it.each(ENTRY_SCREENS)("%s ينادي المصدر الواحد", (file) => {
    const src = read(file);
    expect(src).toContain("effectiveRowRate");
  });

  it("كل مسارات الاختيار تمرّ بالمصدر — لا موضع متروك", () => {
    // أربعة مواضع: صفّ الجدول وشريط الإضافة السريعة في كل شاشة.
    for (const file of ENTRY_SCREENS) {
      const uses = read(file).match(/effectiveRowRate\(/g) || [];
      expect({ file, uses: uses.length }).toEqual({ file, uses: 2 });
    }
  });
});
