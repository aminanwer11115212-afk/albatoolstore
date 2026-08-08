/**
 * معدّلُ الصفّ عند استدعاء فاتورةٍ محفوظة.
 *
 * ## العطل الذي بلّغ عنه صاحب المستودع
 * «عند تحميل فاتورة من قائمة آخر ٥٠ فاتورة يظهر معدّل تحويل بكسور غير
 * الموجود أصلاً وهو 1400».
 *
 * و`invoice_items` لا تحمل عمودَ معدّل — المحفوظُ الوحيد هو
 * `invoices.exchange_rate`. فكان الاستدعاء يشتقّ المعدّلَ بالقسمة العكسية،
 * وهي لا تُرجع ما دخل لأن السعر المحلي يُحفظ مدوَّراً إلى قرشين.
 */
import { describe, it, expect } from "vitest";
import {
  rowRateOnLoad, deriveRowRate, computeUnitPrice, roundMoney, deriveRateFromRows,
} from "@/utils/invoiceCreateHelpers";

describe("القسمةُ العكسية تفقد ما لا يقبله التدوير", () => {
  /*
   * ليس كلُّ معدّلٍ يفقد بالقسمة: 1400 = 14 × 100، فضربُه في سعرٍ أجنبي
   * بأربع منازل يعطي منزلتين — يقسم نظيفاً ويعود كما كان.
   *
   * والفقدُ يقع حين لا يقبل الناتجُ التدوير إلى قرشين، وهو ما تراه في
   * المعدّلات الكسرية — وهي شائعةٌ في هذا المستودع.
   */
  const RATE = 67.8337;
  const fp = 763.63;
  const up = computeUnitPrice(fp, RATE); // 51,800.00 بعد التدوير

  it("الاشتقاقُ يُخرج معدّلاً غير الذي أُدخل", () => {
    const derived = deriveRowRate(up, fp);
    expect(derived).not.toBe(RATE);
  });

  it("والمعدّلُ المحفوظ يُرجعه نظيفاً", () => {
    expect(rowRateOnLoad(up, fp, RATE)).toBe(RATE);
  });

  it("ولا يتغيّر السعر المحلي بذلك", () => {
    // الشرطُ نفسه هو أن المعدّل يُعيد إنتاج السعر — فلا إعادةَ حسابٍ تحرّكه.
    expect(computeUnitPrice(fp, rowRateOnLoad(up, fp, RATE))).toBe(up);
  });
});

describe("المحفوظ يُقبل متى فسّر السعر حرفياً — لا بهامشٍ مخمَّن", () => {
  it.each([
    [1400, 763.63],
    [1400, 37],
    [67.8337, 763.63],
    [1, 1000],
    [0.5, 2400],
  ])("معدّل %s على سعرٍ أجنبي %s", (rate, fp) => {
    const up = computeUnitPrice(fp, rate);
    expect(rowRateOnLoad(up, fp, rate)).toBe(rate);
  });

  it("وصفٌّ أُدخل بمعدّلٍ يخالف معدّل المستند يبقى على معدّله", () => {
    // سعرٌ كُتب باليد لا يفسّره معدّل الفاتورة: الاشتقاقُ هو الوحيد الممكن.
    const fp = 100;
    const up = 250_000;              // لا يساوي 100 × 1400
    expect(rowRateOnLoad(up, fp, 1400)).toBe(deriveRowRate(up, fp));
    expect(rowRateOnLoad(up, fp, 1400)).toBe(2500);
  });

  it("وفرقُ قرشٍ واحد يكفي لرفض المحفوظ — الشرط حرفيّ", () => {
    const fp = 100;
    const exact = computeUnitPrice(fp, 1400);
    expect(rowRateOnLoad(exact + 0.01, fp, 1400)).not.toBe(1400);
  });
});

describe("الحالات الحدّية لا تُسقط الاستدعاء", () => {
  it("بلا معدّلٍ محفوظ ⇒ الاشتقاق كما كان (الفواتير القديمة)", () => {
    const fp = 763.63;
    const up = computeUnitPrice(fp, 1400);
    expect(rowRateOnLoad(up, fp, 0)).toBe(deriveRowRate(up, fp));
    expect(rowRateOnLoad(up, fp, null)).toBe(deriveRowRate(up, fp));
    expect(rowRateOnLoad(up, fp, undefined)).toBe(deriveRowRate(up, fp));
  });

  it("بلا سعرٍ أجنبي ⇒ واحد، ولا قسمةَ على صفر", () => {
    expect(rowRateOnLoad(5000, 0, 1400)).toBe(1);
    expect(rowRateOnLoad(0, 0, 1400)).toBe(1);
  });

  it("سعرٌ محلّي بكسورٍ زائدة يُدوَّر قبل المقارنة", () => {
    const fp = 12.5;
    const up = computeUnitPrice(fp, 1400);   // 17,500
    expect(rowRateOnLoad(up + 0.004, fp, 1400)).toBe(1400); // دون نصف قرش
  });

  it("والمعدّلُ السالب أو غير الرقمي لا يُقبل مرساةً", () => {
    const fp = 100;
    const up = computeUnitPrice(fp, 1400);
    expect(rowRateOnLoad(up, fp, -1400)).toBe(deriveRowRate(up, fp));
    expect(rowRateOnLoad(up, fp, "abc")).toBe(deriveRowRate(up, fp));
  });
});

describe("الاستدعاء لا يحرّك إجماليات الفاتورة", () => {
  /**
   * القاعدةُ التي تحرسها `albatool-integration-tests`: كل تعديلٍ يغيّر عرضاً
   * يُثبت أن المجاميع لم تتحرّك. والمعدّلُ خانةُ عرضٍ هنا — السعرُ المحلي هو
   * ما يدخل الحساب، وهو يُقرأ من القاعدة كما هو.
   */
  it("مجموعُ البنود واحدٌ بالاشتقاق وبالمحفوظ", () => {
    const items = [
      { fp: 763.63, qty: 1 },
      { fp: 37, qty: 5 },
      { fp: 12.5, qty: 3 },
    ].map(({ fp, qty }) => ({ fp, qty, up: computeUnitPrice(fp, 1400) }));

    const totalOf = (rateOf: (it: typeof items[number]) => number) =>
      roundMoney(items.reduce((s, it) => {
        // السعرُ المحلي المخزَّن هو الأساس؛ المعدّلُ لا يُعيد حسابه عند العرض
        expect(rateOf(it)).toBeGreaterThan(0);
        return s + it.up * it.qty;
      }, 0));

    expect(totalOf((it) => rowRateOnLoad(it.up, it.fp, 1400)))
      .toBe(totalOf((it) => deriveRowRate(it.up, it.fp)));
  });
});

/**
 * معدّلُ المستند حين لا يكون محفوظاً (فواتيرُ سبقت العمود).
 *
 * كان يُؤخذ **أوّلُ** صفٍّ له سعرٌ أجنبي. فصفٌّ واحدٌ كُتب سعرُه باليد —
 * وهو أوّلُ الصفوف — يجعل معدّلَ الفاتورة كلِّها نسبتَه هو: رقمٌ بكسورٍ بدل
 * 1400.
 */
describe("معدّل المستند يُشتقّ من الأشيع لا من الأوّل", () => {
  const row = (fp: number, rate: number) => ({ foreign_price: fp, exchange_rate: rate });

  it("صفٌّ شاذٌّ في المقدّمة لا يفرض نفسه على الفاتورة", () => {
    const rows = [
      row(100, 2137.4218),   // سعرٌ كُتب باليد — أوّل الصفوف
      row(763.63, 1400),
      row(37, 1400),
      row(12.5, 1400),
    ];
    expect(deriveRateFromRows(rows)).toBe(1400);
  });

  it("وعند التساوي يُرجَّح أسبقُ ظهوراً — فالنتيجة ثابتة", () => {
    expect(deriveRateFromRows([row(10, 1400), row(20, 1500)])).toBe(1400);
    expect(deriveRateFromRows([row(10, 1500), row(20, 1400)])).toBe(1500);
  });

  it("والصفوفُ بلا سعرٍ أجنبي لا تُحتسب", () => {
    expect(deriveRateFromRows([row(0, 9999), row(50, 1400), row(0, 8888)])).toBe(1400);
  });

  it("ولا صفَّ صالحاً ⇒ صفر، فيقرّر المعدّلُ العام", () => {
    expect(deriveRateFromRows([])).toBe(0);
    expect(deriveRateFromRows([row(0, 0), row(0, 1400)])).toBe(0);
  });
});
