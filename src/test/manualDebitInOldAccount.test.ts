/**
 * «الحساب القديم» يقرأ 500,000 بدل 700,000 — الخصمُ اليدويّ كان يسقط.
 *
 * ## العطل كما وصفه صاحب المستودع بالأرقام
 * «المبلغ المستحق الفعلي 700,000: منها 200,000 حسابٌ قديم و500,000 فاتورةٌ
 * سبقت. ثمّ أضفتُ فاتورةً جديدة بـ500,000، فقرأ النظام الحساب القديم
 * 500,000 فقط، فأظهر جملة الحساب 1,000,000 بدل 1,200,000».
 *
 * ## والسبب سطرٌ واحد
 * قيدُ `customer_credit` **السالب** نوعان لا نوعٌ واحد:
 *
 *   • **استهلاكُ رصيد** — النصف الأول من زوجٍ يقابله `customer_payment`
 *     بطريقة `credit_balance`. أثرهما معاً صفر، فيُتخطّى بحقّ.
 *   • **خصمٌ يدويّ على العميل** (`allocation.kind = "manual_debit"`) — يقف
 *     وحده ويرفع الدَّين.
 *
 * وكان الحساب يتخطّى **كلّ** سالب. فسقط الخصم من كل رصيدٍ تاريخي: من
 * «الحساب القديم» في الفاتورة، ومن الرصيد الافتتاحي في كشف الفترة.
 *
 * ## والأثر الصحيح يأتي من الصيغة نفسها
 * `customer_credit` أثره `-amount`. فالسالب `-200000` أثره `+200000` — أي
 * يرفع ما على العميل. لم نحتج قاعدةً جديدة، بل رفعَ استثناءٍ كان يبتلعه.
 */
import { describe, it, expect } from "vitest";
import { customerNetBefore, netBeforeInvoice } from "@/utils/customerNetBefore";
import { isManualDebitRow, buildManualDebitPayload, MANUAL_DEBIT_KIND } from "@/utils/customerDebitEntry";

const INV_OLD = {
  id: "inv-old",
  total: 500000,
  paid_amount: 0,
  status: "unpaid",
  date: "2026-08-01",
  created_at: "2026-08-01T09:00:00.000Z",
};
const INV_NEW = {
  id: "inv-new",
  total: 500000,
  paid_amount: 0,
  status: "unpaid",
  date: "2026-08-05",
  created_at: "2026-08-05T09:00:00.000Z",
};

/** خصمٌ يدويّ بـ200,000 على العميل — سالبٌ بوسم `manual_debit`. */
const DEBIT = {
  id: "tx-debit",
  category: "customer_credit",
  amount: -200000,
  date: "2026-08-02",
  created_at: "2026-08-02T10:00:00.000Z",
  allocation: { kind: MANUAL_DEBIT_KIND },
};

/* ─────────── ١) حالة صاحب المستودع بأرقامها ─────────── */

describe("حالةُ الـ700,000", () => {
  const input = { invoices: [INV_OLD, INV_NEW], transactions: [DEBIT] };

  it("الحساب القديم قبل الفاتورة الجديدة = 700,000", () => {
    expect(netBeforeInvoice("inv-new", input as any)).toBeCloseTo(700000, 2);
  });

  it("وجملة الحساب = 1,200,000 لا 1,000,000", () => {
    const prev = netBeforeInvoice("inv-new", input as any)!;
    expect(prev + Number(INV_NEW.total)).toBeCloseTo(1200000, 2);
  });

  it("وبلا الخصم يعود 500,000 — فالفرق هو الخصم بعينه", () => {
    const without = { invoices: [INV_OLD, INV_NEW], transactions: [] };
    expect(netBeforeInvoice("inv-new", without as any)).toBeCloseTo(500000, 2);
  });
});

/* ─────────── ٢) والاستهلاك الحقيقي ما زال يُتخطّى ─────────── */

/**
 * الإصلاح لا يجوز أن يُعيد حساب الاستهلاك: قيدُه وقيدُ دفعته أثرهما معاً صفر،
 * فحسابُ أحدهما يُنقص الرصيد مرّتين.
 */
describe("زوجُ السداد من الرصيد ما زال أثره صفراً", () => {
  const CONSUME = {
    id: "tx-consume",
    category: "customer_credit",
    amount: -100000,
    date: "2026-08-02",
    created_at: "2026-08-02T10:00:00.000Z",
    reference_id: "inv-old",
  };
  const PAY_FROM_CREDIT = {
    id: "tx-pay",
    category: "customer_payment",
    amount: 100000,
    method: "credit_balance",
    date: "2026-08-02",
    created_at: "2026-08-02T10:00:01.000Z",
    reference_id: "inv-old",
  };

  it("الزوج لا يغيّر الحساب القديم", () => {
    const withPair = {
      invoices: [INV_OLD, INV_NEW],
      transactions: [CONSUME, PAY_FROM_CREDIT],
    };
    expect(netBeforeInvoice("inv-new", withPair as any)).toBeCloseTo(500000, 2);
  });

  it("والخصم اليدويّ يُحسب معه في نفس الحساب", () => {
    const both = {
      invoices: [INV_OLD, INV_NEW],
      transactions: [CONSUME, PAY_FROM_CREDIT, DEBIT],
    };
    expect(netBeforeInvoice("inv-new", both as any)).toBeCloseTo(700000, 2);
  });
});

/* ─────────── ٣) الشحن الموجب على حاله ─────────── */

describe("شحنُ الرصيد الموجب ينقص ما على العميل", () => {
  const CHARGE = {
    id: "tx-charge",
    category: "customer_credit",
    amount: 300000,
    date: "2026-08-02",
    created_at: "2026-08-02T10:00:00.000Z",
  };

  it("300,000 شحناً تنقص الحساب القديم إلى 200,000", () => {
    const input = { invoices: [INV_OLD, INV_NEW], transactions: [CHARGE] };
    expect(netBeforeInvoice("inv-new", input as any)).toBeCloseTo(200000, 2);
  });

  it("والشحنُ والخصم معاً يتقاصّان", () => {
    const input = { invoices: [INV_OLD, INV_NEW], transactions: [CHARGE, DEBIT] };
    // 500,000 − 300,000 + 200,000 = 400,000
    expect(netBeforeInvoice("inv-new", input as any)).toBeCloseTo(400000, 2);
  });
});

/* ─────────── ٤) الرصيد الافتتاحي في كشف الفترة ─────────── */

describe("والرصيد الافتتاحي يحمل الخصم أيضاً", () => {
  it("قبل 5 أغسطس: فاتورةٌ وخصم", () => {
    const net = customerNetBefore("2026-08-05T00:00:00.000Z", {
      invoices: [INV_OLD],
      transactions: [DEBIT],
    } as any);
    expect(net).toBeCloseTo(700000, 2);
  });

  it("وقبل الخصم لا يُحسب — الترتيب الزمني محفوظ", () => {
    const net = customerNetBefore("2026-08-02T00:00:00.000Z", {
      invoices: [INV_OLD],
      transactions: [DEBIT],
    } as any);
    expect(net).toBeCloseTo(500000, 2);
  });
});

/* ─────────── ٥) تمييزُ الخصم من الاستهلاك ─────────── */

describe("`isManualDebitRow` تميّز النوعين", () => {
  it("الخصم اليدويّ", () => {
    expect(isManualDebitRow(DEBIT)).toBe(true);
  });

  it("والاستهلاك ليس خصماً", () => {
    expect(isManualDebitRow({ category: "customer_credit", amount: -100000 })).toBe(false);
  });

  it("والشحن الموجب ليس خصماً ولو حمل الوسم", () => {
    expect(isManualDebitRow({ category: "customer_credit", amount: 100000, allocation: { kind: MANUAL_DEBIT_KIND } })).toBe(false);
  });

  it("والدفعة ليست خصماً", () => {
    expect(isManualDebitRow({ category: "customer_payment", amount: -100000 })).toBe(false);
  });

  it("و`allocation` نصّاً يُقرأ — PostgREST يُعيدها كذلك أحياناً", () => {
    expect(isManualDebitRow({ category: "customer_credit", amount: -50, allocation: JSON.stringify({ kind: MANUAL_DEBIT_KIND }) })).toBe(true);
  });

  it("ونصٌّ فاسد لا يُسقط الحساب", () => {
    expect(isManualDebitRow({ category: "customer_credit", amount: -50, allocation: "{ليس" })).toBe(false);
    expect(isManualDebitRow(null)).toBe(false);
    expect(isManualDebitRow(undefined)).toBe(false);
  });

  it("والقيدُ الذي تكتبه الشاشة يُتعرَّف عليه — لا وسمان", () => {
    const payload = buildManualDebitPayload({ customerId: "c1", amount: -200000, method: "cash", date: "2026-08-02" } as any);
    expect(isManualDebitRow({ ...payload, amount: -200000 })).toBe(true);
  });
});
