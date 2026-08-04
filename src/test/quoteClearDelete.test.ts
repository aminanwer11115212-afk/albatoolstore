/**
 * زرّ «مسح عرض السعر» — يعمل كاملاً، ولا يعلن نجاحاً لم يقع.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «زر مسح عرض السعر في تعديل وإضافة عرض سعر… يعلّق بالسستم».
 *
 * ## سببان اجتمعا
 * **1) نجاحٌ كاذب.** PostgREST يردّ `error: null` وصفراً من الصفوف حين تمنع
 * سياسةُ RLS الحذف. فكان الزرّ يعلن «تم الحذف بالكامل» ويخرج من الشاشة، ثم
 * يجد المستخدم العرضَ كما هو عند العودة. ولا شيء أشبه بالتعليق من نظامٍ
 * يقول «تمّ» ولا يفعل. والقاعدة مكتوبة في CLAUDE.md: `.select("id")` وصفرُ
 * صفوفٍ خطأ — وكان هذا الموضع خارجها.
 *
 * **2) ستّ رحلاتٍ متتابعة** إلى القاعدة لحذف الأبناء، والحوار مجمَّد بينها.
 * وهي مستقلّةٌ عن بعضها فلا معنى لتسلسلها.
 *
 * وبنودُ التغليف كانت تُحذف بالرابط الواحد (`quote_packaging_id`)، فصفوفٌ
 * قديمة تحمل `quote_id` وحده تبقى يتيمة بعد الحذف.
 *
 * ## ولماذا لم يقع هذا في الفاتورة
 * شاشة الفاتورة تُفوّض الحذف إلى `deleteInvoiceWithStockRestore` — مسارٌ واحد
 * مُحكَم. أمّا العرض فكان يحذف بيده في مكان الزرّ. وهذا الفرق هو الدرس.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const QUOTE = "src/pages/QuoteCreatePage.tsx";

/** جسم مُعالِج زرّ المسح وحده. */
function clearHandler(): string {
  const src = read(QUOTE);
  const start = src.indexOf("مسح عرض السعر الحالي");
  const end = src.indexOf("جارٍ الحذف...", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("الحذف يُتحقّق من وقوعه", () => {
  const fn = clearHandler();

  it("يطلب الصفوف المحذوفة لا الخطأ وحده", () => {
    expect(fn).toMatch(/\.delete\(\)\.eq\("id", editId\)\.select\("id"\)/);
  });

  it("وصفرُ صفوفٍ خطأ يُقال للمستخدم — لا «تمّ» كاذبة", () => {
    expect(fn).toMatch(/if \(!deleted \|\| deleted\.length === 0\)/);
    expect(fn).toContain("تعذّر حذف عرض السعر");
  });

  it("ورسالة النجاح بعد التحقّق لا قبله", () => {
    const okAt = fn.indexOf("تم حذف عرض السعر");
    const checkAt = fn.indexOf("deleted.length === 0");
    expect(checkAt).toBeGreaterThan(-1);
    expect(okAt).toBeGreaterThan(checkAt);
  });
});

describe("الأبناء يُحذفون معاً لا واحداً بعد واحد", () => {
  const fn = clearHandler();

  it("حذفٌ متوازٍ — الحوار لا يتجمّد ستّ رحلات", () => {
    expect(fn).toContain("await Promise.all([");
  });

  it("ويشمل البنود والتغليف والترحيل", () => {
    const par = fn.slice(fn.indexOf("await Promise.all(["), fn.indexOf("]);", fn.indexOf("await Promise.all([")));
    for (const t of ["quote_items", "quotes_packaging_items", "quote_transports"]) {
      expect(par).toContain(t);
    }
  });

  it("وبنود التغليف تُحذف بالرابطين — لا صفوفَ يتيمة", () => {
    // بالترويسة (quote_packaging_id) وبالعرض نفسه (quote_id)
    expect(fn).toMatch(/quotes_packaging_items"\)\.delete\(\)\.in\("quote_packaging_id"/);
    expect(fn).toMatch(/quotes_packaging_items"\)\.delete\(\)\.eq\("quote_id", editId\)/);
  });

  it("وترويسة التغليف تُحذف بعد بنودها لا قبلها", () => {
    const itemsAt = fn.indexOf('quotes_packaging_items").delete().eq("quote_id"');
    const headerAt = fn.indexOf('from("quotes_packaging").delete()');
    expect(itemsAt).toBeGreaterThan(-1);
    expect(headerAt).toBeGreaterThan(itemsAt);
  });
});

describe("الزرّ لا يبقى معطَّلاً بعد الفشل", () => {
  const fn = clearHandler();

  it("`clearing` يُصفَّر في `finally` مهما كان المخرج", () => {
    expect(fn).toMatch(/finally \{\s*setClearing\(false\);/);
  });

  it("ولا يُصفَّر يدوياً قبل الخروج فيُنسى في مسارٍ آخر", () => {
    // كان `setClearing(false)` مكتوباً قبل كل `return` — تكرارٌ يُنسى أحدُه
    const earlyResets = fn.match(/setClearing\(false\); return;/g) || [];
    expect(earlyResets).toEqual([]);
  });
});

/**
 * الدرس المستفاد: الفاتورة تُفوّض حذفها إلى مسارٍ واحد مُحكَم، ولم يقع فيها
 * هذا العطل. وهذا الاختبار يذكّر بالفرق كي يُوحَّد المساران يوماً.
 */
describe("حذف الفاتورة مسارٌ واحد مُحكَم — للمقارنة", () => {
  it("شاشة الفاتورة تُفوّض لا تحذف بيدها", () => {
    expect(read("src/screens/InvoiceCreateScreen.tsx")).toContain("deleteInvoiceWithStockRestore");
  });
});
