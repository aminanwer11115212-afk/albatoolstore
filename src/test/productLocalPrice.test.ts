/**
 * السعر المحلي يتبع السعر الأجنبي في بطاقة المنتج.
 *
 * ## العطل كما بلّغ عنه المستخدم
 * غيّر السعر الأجنبي لمنتج في جدول المنتجات، فبقي عمود «السعر» على قيمته
 * القديمة — لأن تعديل الخلية كان يكتب `foreign_price` **وحده** ولا يمسّ
 * `sale_price`. فيقرأ المستخدم سعراً لا يطابق أجنبيَّه، ويُدرج المنتج في
 * الفواتير بسعرٍ آخر غير الذي يراه على البطاقة.
 *
 * ## القاعدة المطلوبة (بمثال المستخدم حرفياً)
 *     الأجنبي 2   × معدّل 1400  ⇒  المحلي 2,800
 * رقمٌ صحيح بلا كسور — سعر البطاقة يُعلَن للزبون ويُكتب على الرفّ، و«2,520.00»
 * لا تُقرأ ولا تُنطق. ويبقى الحقل قابلاً للتعديل يدوياً بعدها.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { productLocalPrice } from "@/utils/invoiceCreateHelpers";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("productLocalPrice — مثال المستخدم وأرقام لقطته", () => {
  it("المثال المطلوب: 2 × 1400 = 2,800", () => {
    expect(productLocalPrice(2, 1400)).toBe(2800);
  });

  it.each([
    [1.8, 1400, 2520],
    [33, 1400, 46_200],
    [38, 1400, 53_200],
    [42, 1400, 58_800],
  ])("%s × %s = %s — نفس أرقام اللقطة", (fp, rate, expected) => {
    expect(productLocalPrice(fp, rate)).toBe(expected);
  });

  it("رقمٌ صحيح دائماً — لا كسور تُعرض على البطاقة", () => {
    for (const [fp, rate] of [[1.8005, 1400], [2.7, 1333], [0.55, 1400]]) {
      expect(Number.isInteger(productLocalPrice(fp, rate))).toBe(true);
    }
  });

  it("التدوير لأقرب وحدة لا لأقرب ألف", () => {
    // 2,520 تبقى 2,520 — لا تُرفع إلى 3,000
    expect(productLocalPrice(1.8, 1400)).toBe(2520);
    expect(productLocalPrice(1.8007, 1400)).toBe(2521);
  });

  it("بلا سعرٍ أجنبي أو بلا معدّل ⇒ صفر، فلا يُداس سعرٌ يدوي", () => {
    expect(productLocalPrice(0, 1400)).toBe(0);
    expect(productLocalPrice(2, 0)).toBe(0);
    expect(productLocalPrice(null, 1400)).toBe(0);
    expect(productLocalPrice("", 1400)).toBe(0);
    expect(productLocalPrice(-3, 1400)).toBe(0);
  });

  it("يقبل النصّ كما يأتي من حقل الإدخال", () => {
    expect(productLocalPrice("2", "1400")).toBe(2800);
  });
});

/**
 * حراسة بنيوية: مداخل تحرير السعر الأجنبي الثلاثة تجرّ السعر المحلي معها.
 * العطل نشأ لأن أحدها كان يكتب الحقل وحده — والنمط يتكرّر بتعدّد المواضع.
 */
describe("كل مدخل يعدّل السعر الأجنبي يجرّ المحلي معه", () => {
  const PRODUCTS = "src/pages/ProductsPage.tsx";
  const QUICK_DIALOG = "src/components/product/QuickAddProductDialog.tsx";

  it("جدول المنتجات: تعديل الخلية يكتب الحقلين معاً لا حقلاً واحداً", () => {
    const src = read(PRODUCTS);
    expect(src).toMatch(/updateFields\(p\.id, \{ foreign_price: n, sale_price: local \}\)/);
  });

  it("والكتابة في نداءٍ واحد — لا نداءان قد ينجح أحدهما ويفشل الآخر", () => {
    const src = read(PRODUCTS);
    expect(src).toContain("const updateFields = async (id: string, fields: Record<string, any>)");
  });

  it.each([PRODUCTS, QUICK_DIALOG])("%s ينادي المصدر الواحد للحساب", (file) => {
    expect(read(file)).toContain("productLocalPrice");
  });

  it("حوار الإضافة السريعة يقرأ المعدّل — منتجٌ يُنشأ من شاشة الفاتورة كغيره", () => {
    const src = read(QUICK_DIALOG);
    expect(src).toContain("getProductExchangeRate");
  });

  it("المعدّل من مصدرٍ واحد لا استعلامٍ منسوخ في كل شاشة", () => {
    expect(read("src/utils/currency.ts")).toContain("export async function getProductExchangeRate");
    // شاشة المنتجات لم تعد تحمل نسختها الخاصّة من الاستعلام
    expect(read(PRODUCTS)).not.toMatch(/from\("exchange_rates"\)/);
  });
});

/**
 * السعر المحلي يبقى **قابلاً للتعديل يدوياً**: تحرير خلية «السعر» يكتب
 * `sale_price` وحده ولا يمسّ السعر الأجنبي — وإلا لما أمكن تجاوز الحساب.
 */
describe("التعديل اليدوي للسعر المحلي باقٍ", () => {
  it("خلية السعر تكتب `sale_price` وحدها", () => {
    const src = read("src/pages/ProductsPage.tsx");
    expect(src).toMatch(/updateField\(p\.id, "sale_price", n\)/);
    // ولا تكتب معها سعراً أجنبياً مشتقاً
    expect(src).not.toMatch(/sale_price": n, foreign_price/);
  });
});
