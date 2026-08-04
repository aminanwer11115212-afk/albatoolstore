/**
 * بحث المنتجات في شاشات إدخال البنود: «يبدأ بـ» لا «يحتوي على».
 *
 * ## ما طلبه صاحب المستودع
 * «في شاشات الإدخال — فواتير وفواتير كاش وعروض أسعار وعروض جانبية ومشتريات
 * ومرتجعات — أريد البحث عن منتج يفلتر بأوّل حروف تُكتب لا هذه الموجودة التي
 * تقول يحتوي على. فمثلاً كتبت «است» تظهر كل المنتجات التي تبدأ بـ«است» فقط».
 *
 * ## ما كان
 * `startsWithAny` تطابق **بداية أيّ كلمة** داخل الاسم، فكتابة «است» تُظهر
 * «بوري است» كما تُظهر «استانلس» — قائمةٌ نصفُها لا يبدأ بما كُتب.
 *
 * ## ثمنُ القاعدة الجديدة، مذكوراً صراحةً
 * من لا يحفظ أوّل كلمةٍ في اسمٍ طويل لن يجده بكلمةٍ من وسطه. وهذا اختيارُ
 * صاحب المستودع وهو يعرف أسماء بضاعته — ويحرسه الاختبار الأخير هنا كي لا
 * يُعاد الأمر سهواً ظنّاً أنه عطل.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leadsWithMatch, leadsWithAny, startsWithMatch } from "@/utils/searchMatch";
import { productMatches } from "@/utils/productMatches";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const p = (id: string, name: string, sku?: string) => ({ id, name, sku: sku ?? null });

const CATALOG = [
  p("1", "استانلس ستيل 20"),
  p("2", "استر زيت"),
  p("3", "بوري است 30"),
  p("4", "مفتاح استالة"),
  p("5", "بطارية 125"),
  p("6", "فلتر هواء", "AST-99"),
];

describe("مثال المستخدم حرفياً: «است»", () => {
  const found = productMatches(CATALOG, "است").map((x) => x.name);

  it("يُظهر ما يبدأ بـ«است»", () => {
    expect(found).toContain("استانلس ستيل 20");
    expect(found).toContain("استر زيت");
  });

  it("ولا يُظهر ما فيه «است» في وسطه", () => {
    expect(found).not.toContain("بوري است 30");
    expect(found).not.toContain("مفتاح استالة");
  });

  it("ولا ما لا علاقة له", () => {
    expect(found).not.toContain("بطارية 125");
  });
});

describe("الرمز يُطابَق بالبداية كذلك", () => {
  it("«AST» تجد المنتج برمزه", () => {
    expect(productMatches(CATALOG, "AST").map((x) => x.name)).toEqual(["فلتر هواء"]);
  });

  it("ولا يجده حرفٌ من وسط الرمز", () => {
    expect(productMatches(CATALOG, "99")).toEqual([]);
  });
});

describe("ما لم يتغيّر", () => {
  it("البحث الفارغ لا اقتراحات — كما كان", () => {
    expect(productMatches(CATALOG, "")).toEqual([]);
    expect(productMatches(CATALOG, "   ")).toEqual([]);
  });

  it("التطبيع العربي باقٍ: «أست» تجد «است»", () => {
    expect(productMatches(CATALOG, "أست").map((x) => x.name)).toContain("استانلس ستيل 20");
  });

  it("الحدّ الأقصى عشرة", () => {
    const many = Array.from({ length: 30 }, (_, i) => p(String(i), `است ${i}`));
    expect(productMatches(many, "است")).toHaveLength(10);
  });

  it("فلتر المخزن يُطبَّق حين يُمرَّر", () => {
    const list = [
      { id: "a", name: "است 1", sku: null, warehouse_id: "w1" },
      { id: "b", name: "است 2", sku: null, warehouse_id: "w2" },
    ];
    expect(productMatches(list, "است", "w1").map((x) => x.id)).toEqual(["a"]);
  });

  it("ولا تكرار لنفس المعرّف", () => {
    const dup = [p("x", "است"), p("x", "است")];
    expect(productMatches(dup, "است")).toHaveLength(1);
  });
});

describe("`leadsWithMatch` — الفرق عن `startsWithMatch`", () => {
  it("«يبدأ بـ» على النص كاملاً", () => {
    expect(leadsWithMatch("استانلس ستيل", "است")).toBe(true);
    expect(leadsWithMatch("بوري است", "است")).toBe(false);
  });

  it("بينما القديمة تقبل بداية أي كلمة", () => {
    expect(startsWithMatch("بوري است", "است")).toBe(true);
  });

  it("والفارغ يطابق دائماً — لا يفلتر قبل الكتابة", () => {
    expect(leadsWithMatch("أي شيء", "")).toBe(true);
    expect(leadsWithAny(["أ", "ب"], "")).toBe(true);
  });

  it("والحقل الفارغ لا يطابق شيئاً مكتوباً", () => {
    expect(leadsWithMatch("", "است")).toBe(false);
    expect(leadsWithMatch(null, "است")).toBe(false);
  });
});

/**
 * حراسة بنيوية: الشاشات الستّ كلّها على القاعدة نفسها.
 *
 * الفواتير وفواتير الكاش تمرّان بـ`InvoiceCreateScreen`، وعروض الأسعار
 * والجانبية بـ`QuoteCreatePage` — وكلتاهما تنادي `productMatches` المشتركة.
 * أمّا المشتريات والمرتجعات فلكلٍّ منهما نسخته، فتُفحص مباشرةً.
 */
describe("الشاشات الستّ على قاعدةٍ واحدة", () => {
  it.each([
    ["src/screens/InvoiceCreateScreen.tsx", "فواتير + كاش"],
    ["src/pages/QuoteCreatePage.tsx", "عروض أسعار + جانبية"],
  ])("%s تنادي المصدر المشترك (%s)", (file) => {
    expect(read(file)).toContain("sharedProductMatches(products, query");
  });

  it.each([
    "src/pages/PurchaseCreatePage.tsx",
    "src/pages/StockReturnCreatePage.tsx",
  ])("%s تستعمل «يبدأ بـ» لا «بداية أي كلمة»", (file) => {
    const src = read(file);
    const fn = src.slice(src.indexOf("function productMatches"), src.indexOf("function focusRowSearch"));
    expect(fn).toMatch(/leadsWith(Any|Match)\(/);
    expect(fn).not.toMatch(/startsWith(Any|Match)\(/);
  });

  it("والمصدر المشترك نفسه على القاعدة", () => {
    const src = read("src/utils/productMatches.ts");
    expect(src).toContain("leadsWithAny");
    expect(src).not.toContain("startsWithAny");
  });

  it("والقاعدة موثّقة كي لا تُعاد سهواً ظنّاً أنها عطل", () => {
    expect(read("src/utils/productMatches.ts")).toContain("يبدأ بـ");
  });
});
