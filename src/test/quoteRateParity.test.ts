/**
 * البند 1 — إضافة صنف إلى **عرض سعر قديم** أو فاتورة قديمة.
 *
 * العطل كما وصفه المستخدم: "يظهر رقم بكسور أحياناً، ومعدّل التحويل يتغيّر
 * لوحده". وله مصدران اثنان، وكلاهما كان في شاشة عرض السعر وحدها بعد أن
 * أُصلحت شاشة الفاتورة:
 *
 * 1. **المعدّل يعود إلى 1**: عرض السعر لم يكن يشتقّ معدّله من بنوده مطلقاً
 *    (لا `resolveDefaultRate` ولا `deriveRateFromRows`). فإذا خلا جدول
 *    `exchange_rates` بقي `defaultRate = 1`، فيُدرج الصنف الجديد بسعره
 *    الأجنبي الخام (763.63) مكان المحلي (51,800) — وهو "الرقم بالكسور".
 *
 * 2. **المعدّل يتغيّر لوحده**: السعر العام كان يُطبَّق بلا شرط حتى في وضع
 *    التعديل، فيدوس معدّل العرض المحفوظ بمعدّل اليوم بعد أن تُحمَّل بنوده.
 *
 * ومعهما كسورٌ من الضرب الخام (`fp * rate`) ومن اشتقاق المعدّل بثلاث منازل.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  computeUnitPrice,
  deriveRowRate,
  resolveDefaultRate,
  deriveRateFromRows,
  effectiveRowRate,
  priceFromProduct,
  applyRateToRow,
} from "@/utils/invoiceCreateHelpers";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const ENTRY_SCREENS = [
  "src/screens/InvoiceCreateScreen.tsx",
  "src/pages/QuoteCreatePage.tsx",
];

describe("computeUnitPrice — لا كسور من الضرب الخام", () => {
  it("الضرب الخام ينتج كسوراً، والمصدر الواحد لا ينتجها", () => {
    // نفس الأرقام التي بلّغ عنها المستخدم
    const raw = 763.63 * 67.833899;
    expect(String(raw)).toMatch(/\.\d{3,}/);       // 51800.00007... كسورٌ تُعرض
    expect(computeUnitPrice(763.63, 67.833899)).toBe(51800);
  });

  it("يبتلع خطأ الفاصلة العائمة", () => {
    expect(computeUnitPrice(0.1, 3)).toBe(0.3);    // 0.30000000000000004 خاماً
    expect(computeUnitPrice(1234.56, 1)).toBe(1234.56);
  });

  it("مدخلات فارغة لا تكسر الحساب", () => {
    expect(computeUnitPrice(null, 90)).toBe(0);
    expect(computeUnitPrice(10, null)).toBe(0);
  });
});

describe("deriveRowRate — دقّة الاشتقاق تمنع انحراف السعر", () => {
  it("ثلاث منازل كانت تُرجع 51,800.23 بدل 51,800", () => {
    const threeDecimals = Math.round((51_800 / 763.63) * 1000) / 1000;
    expect(computeUnitPrice(763.63, threeDecimals)).not.toBe(51_800);
  });

  it("الاشتقاق الحالي يعيد السعر المحلي كما هو تماماً", () => {
    const rate = deriveRowRate(51_800, 763.63);
    expect(computeUnitPrice(763.63, rate)).toBe(51_800);
  });

  it("رحلة ذهاب وإياب على أرقامٍ متنوّعة", () => {
    for (const [up, fp] of [[900, 10], [51_800, 763.63], [1_234.5, 17.3], [99, 7]]) {
      expect(computeUnitPrice(fp, deriveRowRate(up, fp))).toBe(up);
    }
  });

  it("بند مسعّر محلياً (بلا سعر أجنبي) معدّله 1 لا صفر ولا لانهاية", () => {
    expect(deriveRowRate(1500, 0)).toBe(1);
    expect(deriveRowRate(0, 10)).toBe(1);
  });
});

describe("عرض سعر قديم: الصنف الجديد يتبع معدّل العرض", () => {
  const product = { foreign_price: 763.63, sale_price: 0 };

  it("العرض بمعدّله الخاص — والسعر العام مختلف — فالأولوية للعرض", () => {
    const loaded = [{ foreign_price: 763.63, exchange_rate: 67.833899 }];
    const derived = deriveRateFromRows(loaded);
    const rate = resolveDefaultRate(derived, /* global اليوم */ 90);
    expect(rate).toBe(67.833899);
    expect(priceFromProduct(product, rate).unit_price).toBe(51_800);
  });

  it("جدول `exchange_rates` فارغ: المعدّل يأتي من بنود العرض لا من 1", () => {
    const loaded = [{ foreign_price: 763.63, exchange_rate: 67.833899 }];
    const rate = resolveDefaultRate(deriveRateFromRows(loaded), 0);
    expect(rate).not.toBe(1);
    // العطل المُبلَّغ: 763.63 تنزل مكان 51,800
    expect(priceFromProduct(product, 1).unit_price).toBe(763.63);
    expect(priceFromProduct(product, rate).unit_price).toBe(51_800);
  });

  it("صفّ الجدول الفارغ معدّله 1 تهيئةً — لا اختياراً", () => {
    expect(effectiveRowRate(1, 67.833899)).toBe(67.833899);
  });
});

describe("تغيير المعدّل في عرضٍ مختلط لا يصفّر البنود المحلية", () => {
  it("البند المسعّر محلياً يبقى كما هو", () => {
    const local = { foreign_price: 0, unit_price: 1500, exchange_rate: 1 };
    expect(applyRateToRow(local, 90)).toBe(local);
  });

  it("البند الأجنبي وحده يُعاد تسعيره — بلا كسور", () => {
    const foreign = { foreign_price: 763.63, unit_price: 51_800, exchange_rate: 67.833899 };
    expect(applyRateToRow(foreign, 90).unit_price).toBe(68_726.7);
  });
});

/**
 * الحراسة البنيوية: العطل تكرّر لأن الحساب مكتوبٌ في مواضع متفرّقة، فأُصلحت
 * شاشة الفاتورة وبقيت شاشة عرض السعر. هذه الفحوص تمنع عودة الأنماط الخام.
 */
describe("لا حساب خام متروك في شاشات الإدخال", () => {
  it.each(ENTRY_SCREENS)("%s: لا ضربَ مباشراً في المعدّل لاشتقاق السعر المحلي", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/unit_price:\s*\w+\.?\w*\s*\*\s*\w+\.exchange_rate/);
    expect(src).not.toMatch(/unit_price:\s*r\.foreign_price\s*\*\s*\w+/);
  });

  it.each(ENTRY_SCREENS)("%s: لا اشتقاقَ للمعدّل بثلاث منازل", (file) => {
    expect(read(file)).not.toMatch(/\*\s*1000\s*\)\s*\/\s*1000/);
  });

  it.each(ENTRY_SCREENS)("%s: يشتقّ معدّل المستند من بنوده قبل السعر العام", (file) => {
    const src = read(file);
    expect(src).toContain("deriveRateFromRows");
    expect(src).toContain("resolveDefaultRate");
  });

  it.each(ENTRY_SCREENS)("%s: تغيير المعدّل يمرّ بـ`applyRateToRow` فلا يصفّر بنداً محلياً", (file) => {
    expect(read(file)).toContain("applyRateToRow");
  });

  it.each(ENTRY_SCREENS)("%s: المعدّل المكتوب بيد المستخدم لا يُداس", (file) => {
    expect(read(file)).toContain("rateTouchedRef.current = true");
  });
});
