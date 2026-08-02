// سعر الصرف الفعلي عند اختيار منتج في صفٍّ قائم.
//
// الصفّ الفارغ يُنشأ بـ`exchange_rate: 1` **قيمةً أوّلية لا اختياراً**. والحارس
// القديم كان `rate > 0 ? rowRate : defaultRate` — والواحد أكبر من صفر فيمرّ.
//
// فمن يستدعي فاتورة قديمة ويضيف صنفاً يحصل على:
//     unit_price = 763.63 × 1 = 763.63     بدل   763.63 × 67.8 = 51,800
// أي أن السعر الأجنبي ينزل مكان المحلي. ولا يبدو خطأً صارخاً — بل رقماً بكسورٍ
// صغير — فيمرّ على من لا يحفظ السعر.
import { describe, it, expect } from "vitest";
import { effectiveRowRate, priceFromProduct } from "@/utils/invoiceCreateHelpers";

describe("effectiveRowRate", () => {
  it("الواحد على صفٍّ ومعدّل المستند حقيقي ⇒ معدّل المستند", () => {
    expect(effectiveRowRate(1, 67.8)).toBe(67.8);
  });

  it("صفر أو غياب ⇒ معدّل المستند", () => {
    expect(effectiveRowRate(0, 67.8)).toBe(67.8);
    expect(effectiveRowRate(null, 67.8)).toBe(67.8);
    expect(effectiveRowRate(undefined, 67.8)).toBe(67.8);
  });

  it("معدّل حقيقي على الصفّ يُحترم ولا يُداس", () => {
    expect(effectiveRowRate(70, 67.8)).toBe(70);
    expect(effectiveRowRate(0.5, 67.8)).toBe(0.5);
  });

  it("مستندٌ معدّله 1 فعلاً يبقى على 1", () => {
    expect(effectiveRowRate(1, 1)).toBe(1);
  });

  it("بلا معدّل مستند يبقى معدّل الصفّ — ولا يهبط إلى صفر أبداً", () => {
    expect(effectiveRowRate(70, 0)).toBe(70);
    expect(effectiveRowRate(0, 0)).toBe(1);
  });
});

describe("الحالة التي بلّغ عنها المستخدم", () => {
  const product = { foreign_price: 763.63, sale_price: 0 };

  it("الصفّ المستدعى بمعدّل 1 كان يُنزل 763.63 — وصار 51,800", () => {
    const stale = priceFromProduct(product, 1);
    expect(stale.unit_price).toBe(763.63);           // العطل قبل الإصلاح

    // معدّل السوق الذي يعطي 51,800 من 763.63
    const rate = effectiveRowRate(1, 67.8337);
    const fixed = priceFromProduct(product, rate);
    expect(fixed.unit_price).toBeCloseTo(51_800, 0);
  });

  it("السعر الأجنبي يبقى كما هو — المصحَّح هو المحلي وحده", () => {
    const { foreign_price } = priceFromProduct(product, effectiveRowRate(1, 67.8337));
    expect(foreign_price).toBe(763.63);
  });
});
