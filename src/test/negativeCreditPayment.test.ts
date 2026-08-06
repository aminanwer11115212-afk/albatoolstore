/**
 * شحنٌ بالسالب ثمّ دفعٌ على الفاتورة — «حساب العميل بعد الدفع» كان يزيد 5,000.
 *
 * ## العطل بأرقام صاحب المستودع
 * عميلٌ عليه فاتورة 11,200 وحسابٌ قديم 5,000 (من شحنٍ بالسالب)، فالمطلوب
 * سداده 16,200. دفع 16,000 ⇒ الباقي **200**. وأظهرت النافذة **5,200**.
 *
 * ## والسبب سقفُ القصّ
 *     const cu = Math.min(Math.max(0, creditUse), credit);
 *
 * فإذا كان `credit = -5000` صارت `Math.min(0, -5000) = -5000` — فيُطرح
 * الخصمُ من الدفعة:
 *
 *     paid = 16,000 + (-5,000) = 11,000
 *     16,200 - 11,000 = 5,200      ← الرقم الخاطئ بعينه
 *
 * ## والمفهوم
 * «الرصيد الدائن» عددٌ ذو إشارة: موجبُه رصيدٌ للعميل وسالبُه خصمٌ عليه. أمّا
 * **المتاح للإنفاق** فلا معنى لسالبه — من عليه خصمٌ لا يملك رصيداً يدفع منه.
 */
import { describe, it, expect } from "vitest";
import { availableCredit, creditUsed } from "@/utils/creditAvailability";

/* ─────────── ١) المتاح لا يكون سالباً ─────────── */

describe("availableCredit", () => {
  it("الرصيدُ الموجب متاحٌ كما هو", () => {
    expect(availableCredit(5000)).toBe(5000);
  });

  it("والسالبُ خصمٌ لا رصيد — فالمتاحُ صفر", () => {
    expect(availableCredit(-5000)).toBe(0);
  });

  it("والصفرُ صفر", () => {
    expect(availableCredit(0)).toBe(0);
  });

  it("وقيمةٌ غائبةٌ أو فاسدة لا تُسقِط الحساب", () => {
    for (const v of [null, undefined, NaN, "abc" as any]) {
      expect(availableCredit(v as any)).toBe(0);
    }
  });
});

/* ─────────── ٢) المستخدَم بين الصفر والمتاح ─────────── */

describe("creditUsed", () => {
  it("لا يتجاوز المتاح", () => {
    expect(creditUsed(9000, 5000)).toBe(5000);
  });

  it("ولا ينزل تحت الصفر", () => {
    expect(creditUsed(-100, 5000)).toBe(0);
  });

  /** هذا هو العطل: سقفٌ سالبٌ كان يُعيد سالباً. */
  it("ورصيدٌ سالب ⇒ لا استخدام أصلاً", () => {
    expect(creditUsed(0, -5000)).toBe(0);
    expect(creditUsed(3000, -5000)).toBe(0);
  });

  it("والمطلوبُ دون المتاح يُؤخذ كما هو", () => {
    expect(creditUsed(1200, 5000)).toBe(1200);
  });

  it("ونصٌّ من حقل الإدخال يُقرأ", () => {
    expect(creditUsed("1500", 5000)).toBe(1500);
    expect(creditUsed("", 5000)).toBe(0);
    expect(creditUsed("abc", 5000)).toBe(0);
  });
});

/* ─────────── ٣) حالةُ صاحب المستودع كاملةً ─────────── */

/**
 * حسابُ النافذة كما هو في `CustomerPaymentDialog`، بالمتغيّرات نفسها —
 * ليقطع الاختبارُ المسار من الرصيد إلى الرقم المعروض.
 */
function afterPaymentOf(opts: {
  debt: number;
  credit: number;
  invoiceRemaining: number;
  discount?: number;
  cash: number;
  creditUseInput?: number | string;
}) {
  const { debt, credit, invoiceRemaining, cash } = opts;
  const net = debt - credit;
  const previousDebt = Math.max(0, net - invoiceRemaining);
  const previousCredit = net < -0.01 ? Math.abs(net) : 0;
  const disc = Math.max(0, Number(opts.discount) || 0);
  const invoiceAfterDiscount = Math.max(0, invoiceRemaining - disc);
  const rawDue = invoiceAfterDiscount + previousDebt - previousCredit;
  const combinedDue = Math.max(0, rawDue);
  const cu = creditUsed(opts.creditUseInput ?? 0, credit);
  const paid = cash + cu;
  return { combinedDue, previousDebt, paid, afterPayment: combinedDue - paid };
}

describe("حالةُ الشحن السالب ثمّ الدفع", () => {
  // شحنٌ بالسالب 5,000 ⇒ credit_balance = -5,000
  const CASE = { debt: 11200, credit: -5000, invoiceRemaining: 11200, cash: 16000 };

  it("المطلوبُ سداده 16,200 — كما تعرضه النافذة", () => {
    expect(afterPaymentOf(CASE).combinedDue).toBeCloseTo(16200, 2);
  });

  it("والحسابُ القديم 5,000 عليه", () => {
    expect(afterPaymentOf(CASE).previousDebt).toBeCloseTo(5000, 2);
  });

  it("والمدفوعُ 16,000 لا 11,000 — لا يُطرح الخصمُ من الدفعة", () => {
    expect(afterPaymentOf(CASE).paid).toBeCloseTo(16000, 2);
  });

  it("فالباقي 200 لا 5,200", () => {
    expect(afterPaymentOf(CASE).afterPayment).toBeCloseTo(200, 2);
  });

  /**
   * جُرّب بإعادة العطل — السقفُ السالب — فعاد الرقمُ الذي صوّره صاحب
   * المستودع، فالفحصُ يقيس العلّة بعينها لا شيئاً بجوارها.
   */
  it("وبالسقف السالب يعود 5,200 — العطلُ نفسه", () => {
    const cuBroken = Math.min(Math.max(0, 0), CASE.credit); // -5000
    const paidBroken = CASE.cash + cuBroken;
    expect(paidBroken).toBeCloseTo(11000, 2);
    expect(16200 - paidBroken).toBeCloseTo(5200, 2);
  });
});

/* ─────────── ٤) والرصيد الموجب ما زال يعمل ─────────── */

describe("الرصيدُ الموجب لم يتغيّر سلوكه", () => {
  it("رصيدٌ 5,000 يُستخدم فيُنقص المطلوب", () => {
    const r = afterPaymentOf({
      debt: 11200, credit: 5000, invoiceRemaining: 11200, cash: 0, creditUseInput: 5000,
    });
    expect(r.paid).toBeCloseTo(5000, 2);
  });

  it("ولا يُستخدم تلقائياً ما لم يُطلب — عقدُ «الشحن يُخزَّن ولا يُوزَّع»", () => {
    const r = afterPaymentOf({ debt: 11200, credit: 5000, invoiceRemaining: 11200, cash: 0 });
    expect(r.paid).toBe(0);
  });

  it("وطلبُ أكثر من المتاح يُقصّ عند المتاح", () => {
    const r = afterPaymentOf({
      debt: 11200, credit: 5000, invoiceRemaining: 11200, cash: 0, creditUseInput: 99999,
    });
    expect(r.paid).toBeCloseTo(5000, 2);
  });
});
