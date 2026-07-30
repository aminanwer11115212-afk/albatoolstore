/**
 * البند 1 — تطابق تسعير الصنف بين "فاتورة جديدة" و"إضافة صنف لفاتورة قديمة".
 *
 * العطل الأصلي: صفحة الفاتورة كانت تقرأ سعر الصرف العام في وضع الإنشاء فقط
 * (`if (editId) return`)، وفي وضع التعديل تشتقّه من بنود الفاتورة وحدها. فإذا لم
 * يحمل أي بند سعراً أجنبياً بقي المعدّل 1، فأُدرج الصنف الجديد بسعره الأجنبي
 * الخام كسعر محلي. ومعه: تغيير سعر الصرف كان يصفّر البنود المسعّرة محلياً،
 * والبنود القديمة تصل بسعر أجنبي فارغ رغم وجوده في بطاقة المنتج.
 */
import { describe, it, expect } from "vitest";
import {
  resolveDefaultRate,
  deriveRateFromRows,
  priceFromProduct,
  backfillForeignPrice,
  applyRateToRow,
  newRow,
  calcTotal,
} from "@/utils/invoiceCreateHelpers";

const GLOBAL_RATE = 90;

describe("resolveDefaultRate — معدّل البنود الجديدة", () => {
  it("فاتورة جديدة: يستخدم السعر العام", () => {
    expect(resolveDefaultRate(0, GLOBAL_RATE)).toBe(GLOBAL_RATE);
  });

  it("فاتورة قديمة ببنود تحمل سعراً أجنبياً: يستخدم معدّل الفاتورة نفسها", () => {
    expect(resolveDefaultRate(85, GLOBAL_RATE)).toBe(85);
  });

  it("فاتورة قديمة بلا أي سعر أجنبي: يرجع للسعر العام لا إلى 1 (العطل المُبلَّغ)", () => {
    expect(resolveDefaultRate(0, GLOBAL_RATE)).toBe(GLOBAL_RATE);
    expect(resolveDefaultRate(null, GLOBAL_RATE)).toBe(GLOBAL_RATE);
  });

  it("لا سعر عام ولا مشتق: 1", () => {
    expect(resolveDefaultRate(0, 0)).toBe(1);
  });
});

describe("deriveRateFromRows", () => {
  it("يأخذ أول بند يحمل سعراً أجنبياً ومعدّلاً موجبين", () => {
    const rows = [
      { foreign_price: 0, exchange_rate: 1 },
      { foreign_price: 10, exchange_rate: 85 },
      { foreign_price: 5, exchange_rate: 90 },
    ];
    expect(deriveRateFromRows(rows)).toBe(85);
  });

  it("يرجع 0 حين لا يحمل أي بند سعراً أجنبياً", () => {
    expect(deriveRateFromRows([{ foreign_price: 0, exchange_rate: 1 }])).toBe(0);
  });
});

describe("priceFromProduct — تطابق المسارين", () => {
  const product = { foreign_price: 10, sale_price: 950 };

  it("مسار الفاتورة الجديدة", () => {
    expect(priceFromProduct(product, GLOBAL_RATE)).toEqual({ foreign_price: 10, unit_price: 900 });
  });

  it("مسار الفاتورة القديمة ينتج نفس القيم بعد الإصلاح", () => {
    const derived = deriveRateFromRows([{ foreign_price: 0, exchange_rate: 1 }]);
    const rate = resolveDefaultRate(derived, GLOBAL_RATE);
    expect(priceFromProduct(product, rate)).toEqual(priceFromProduct(product, GLOBAL_RATE));
  });

  it("قبل الإصلاح كان المعدّل 1 فيظهر السعر المحلي 10 بدل 900", () => {
    expect(priceFromProduct(product, 1).unit_price).toBe(10);
  });

  it("منتج بلا سعر أجنبي يقع على سعر البيع", () => {
    expect(priceFromProduct({ foreign_price: null, sale_price: 20 }, 2).foreign_price).toBe(20);
  });

  it("منتج بلا أي سعر لا يكسر الحساب", () => {
    expect(priceFromProduct({ foreign_price: null, sale_price: null }, GLOBAL_RATE)).toEqual({
      foreign_price: 0,
      unit_price: 0,
    });
  });
});

describe("backfillForeignPrice — بنود قديمة بلا سعر أجنبي", () => {
  it("يملأ السعر الأجنبي من بطاقة المنتج ويحافظ على السعر المحلي حرفياً", () => {
    const row = { foreign_price: 0, unit_price: 900 };
    const patch = backfillForeignPrice(row, { foreign_price: 10 });
    expect(patch).toEqual({ foreign_price: 10, exchange_rate: 90 });
    // الأهم: السعر المحلي لم يتغيّر ⇒ لا إجمالي ولا رصيد يتأثر
    expect(patch!.foreign_price * patch!.exchange_rate).toBe(row.unit_price);
  });

  it("لا يلمس بنداً يحمل سعراً أجنبياً بالفعل", () => {
    expect(backfillForeignPrice({ foreign_price: 12, unit_price: 900 }, { foreign_price: 10 })).toBeNull();
  });

  it("لا يلمس بنداً سعره المحلي صفر أو بطاقته بلا سعر أجنبي", () => {
    expect(backfillForeignPrice({ foreign_price: 0, unit_price: 0 }, { foreign_price: 10 })).toBeNull();
    expect(backfillForeignPrice({ foreign_price: 0, unit_price: 900 }, { foreign_price: null })).toBeNull();
    expect(backfillForeignPrice({ foreign_price: 0, unit_price: 900 }, undefined)).toBeNull();
  });
});

describe("applyRateToRow — تغيير سعر الصرف على فاتورة مختلطة", () => {
  it("يعيد تسعير البنود ذات السعر الأجنبي فقط", () => {
    const foreignRow = { foreign_price: 10, unit_price: 850, exchange_rate: 85 };
    expect(applyRateToRow(foreignRow, 90)).toEqual({ foreign_price: 10, unit_price: 900, exchange_rate: 90 });
  });

  it("لا يصفّر بنداً مسعّراً محلياً (العطل المُبلَّغ: السعر المحلي يظهر خطأ)", () => {
    const localRow = { foreign_price: 0, unit_price: 1500, exchange_rate: 1 };
    const after = applyRateToRow(localRow, 90);
    expect(after).toBe(localRow);
    expect(after.unit_price).toBe(1500);
  });

  it("إجمالي فاتورة قديمة متعددة الأسعار لا يتغيّر إلا في البنود الأجنبية", () => {
    const rows = [
      { ...newRow(85), product_id: "a", foreign_price: 10, unit_price: 850, quantity: 2 },
      { ...newRow(1), product_id: "b", foreign_price: 0, unit_price: 1500, quantity: 1 },
      { ...newRow(85), product_id: "c", foreign_price: 4, unit_price: 340, quantity: 3 },
    ];
    const rerated = rows.map((r) => {
      const u = applyRateToRow(r, 90);
      return { ...u, total: calcTotal(u) };
    });
    expect(rerated.map((r) => r.unit_price)).toEqual([900, 1500, 360]);
    expect(rerated.map((r) => r.total)).toEqual([1800, 1500, 1080]);
    // البند المحلي بقي كاملاً في الإجمالي بدل أن يصبح صفراً
    expect(rerated.reduce((s, r) => s + r.total, 0)).toBe(4380);
  });
});

describe("سيناريو كامل: إضافة صنف لفاتورة قديمة", () => {
  const product = { id: "p1", foreign_price: 10, sale_price: 950 };

  it("فاتورة قديمة كل بنودها محلية — الصنف الجديد يأخذ السعر الأجنبي والمحلي الصحيحين", () => {
    const loaded = [{ foreign_price: 0, exchange_rate: 1, unit_price: 1500 }];
    const rate = resolveDefaultRate(deriveRateFromRows(loaded), GLOBAL_RATE);
    const added = priceFromProduct(product, rate);
    expect(added.foreign_price).toBe(10);
    expect(added.unit_price).toBe(900);
  });

  it("فاتورة قديمة بمعدّلها الخاص — الصنف الجديد يتبع معدّل الفاتورة لا العام", () => {
    const loaded = [{ foreign_price: 10, exchange_rate: 85, unit_price: 850 }];
    const rate = resolveDefaultRate(deriveRateFromRows(loaded), GLOBAL_RATE);
    expect(rate).toBe(85);
    expect(priceFromProduct(product, rate).unit_price).toBe(850);
  });

  it("بعد الملء التلقائي تصبح الفاتورة القديمة ذات معدّل مشتق يتبعه الصنف الجديد", () => {
    const loaded = [{ foreign_price: 0, exchange_rate: 1, unit_price: 850, dbId: "x", product_id: "p1" }];
    const patch = backfillForeignPrice(loaded[0], product)!;
    const filled = [{ ...loaded[0], ...patch }];
    expect(deriveRateFromRows(filled)).toBe(85);
    expect(priceFromProduct(product, resolveDefaultRate(deriveRateFromRows(filled), GLOBAL_RATE)).unit_price).toBe(850);
  });
});
