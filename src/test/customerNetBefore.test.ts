/**
 * «الحساب القديم» — صافي حساب العميل قبل إنشاء الفاتورة.
 *
 * الاختبار الحاسم هنا هو الأخير في «الطريقة القديمة كانت تخطئ»: فاتورة أُنشئت
 * **بعد** الفاتورة المعروضة يجب ألّا تدخل حسابها القديم إطلاقاً. الطرح من
 * الرصيد الحالي كان يُدخلها، وهذا سبب استبداله بإعادة تشغيل زمنية.
 */
import { describe, it, expect } from "vitest";
import {
  customerNetBefore,
  netBeforeInvoice,
  accountEvents,
  stampKey,
} from "@/utils/customerNetBefore";

const inv = (o: any) => ({ status: "pending", total: 0, paid_amount: 0, ...o });
const tx = (o: any) => ({ ...o });

describe("الحساب قبل الفاتورة", () => {
  it("أول فاتورة للعميل: لا حساب قديم", () => {
    const invoices = [inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500 })];
    expect(netBeforeInvoice("a", { invoices, transactions: [] })).toBe(0);
  });

  it("فاتورة سابقة غير مسددة تظهر كاملة في الحساب القديم", () => {
    const invoices = [
      inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500 }),
      inv({ id: "b", created_at: "2026-02-01T09:00:00Z", total: 300 }),
    ];
    expect(netBeforeInvoice("b", { invoices, transactions: [] })).toBe(500);
  });

  it("الدفعة السابقة تُنقص الحساب القديم", () => {
    const invoices = [
      inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500 }),
      inv({ id: "b", created_at: "2026-02-01T09:00:00Z", total: 300 }),
    ];
    const transactions = [
      tx({ id: "p", category: "customer_payment", amount: 200, reference_id: "a", method: "cash", created_at: "2026-01-05T09:00:00Z" }),
    ];
    expect(netBeforeInvoice("b", { invoices, transactions })).toBe(300);
  });

  it("شحن الرصيد السابق يجعل الحساب القديم سالباً «له»", () => {
    const invoices = [inv({ id: "b", created_at: "2026-02-01T09:00:00Z", total: 300 })];
    const transactions = [
      tx({ id: "ch", category: "customer_credit", amount: 800, created_at: "2026-01-10T09:00:00Z" }),
    ];
    expect(netBeforeInvoice("b", { invoices, transactions })).toBe(-800);
  });
});

describe("الطريقة القديمة كانت تخطئ — وهذه الحالات تثبت الفرق", () => {
  const invoices = [
    inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500 }),
    inv({ id: "b", created_at: "2026-02-01T09:00:00Z", total: 300 }),
    inv({ id: "c", created_at: "2026-03-01T09:00:00Z", total: 900 }),
  ];
  const transactions: any[] = [];

  it("فاتورة أُنشئت بعد المعروضة لا تدخل حسابها القديم", () => {
    // الرصيد الحالي = 500+300+900 = 1,700. طرح فاتورة «b» وحدها يعطي 1,400 خطأً
    // لأنه يُدخل «c» التي لم تكن موجودة. الصحيح 500 فقط.
    expect(netBeforeInvoice("b", { invoices, transactions })).toBe(500);
    const currentNet = invoices.reduce((s, i) => s + i.total, 0);
    expect(currentNet - 300).toBe(1400); // ما كانت تعطيه الطريقة القديمة
  });

  it("الفاتورة الأخيرة حسابها القديم = مجموع ما قبلها", () => {
    expect(netBeforeInvoice("c", { invoices, transactions })).toBe(800);
  });

  it("مديونية ورصيد دائن معاً: لا قصّ عند الصفر يشوّه الصافي", () => {
    // عليه 500 من فاتورة، وله 800 رصيد ⇒ الصافي −300 لا صفر
    const invs = [
      inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500 }),
      inv({ id: "z", created_at: "2026-05-01T09:00:00Z", total: 100 }),
    ];
    const txs = [tx({ id: "ch", category: "customer_credit", amount: 800, created_at: "2026-02-01T09:00:00Z" })];
    expect(netBeforeInvoice("z", { invoices: invs, transactions: txs })).toBe(-300);
  });
});

describe("الحالات التي لا تغيّر الصافي", () => {
  it("السداد من الرصيد أثره صفر — لا يغيّر الحساب القديم", () => {
    const invoices = [
      inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500, paid_amount: 200 }),
      inv({ id: "z", created_at: "2026-05-01T09:00:00Z", total: 100 }),
    ];
    const base = [tx({ id: "ch", category: "customer_credit", amount: 800, created_at: "2026-01-02T09:00:00Z" })];
    const withSettle = [
      ...base,
      tx({ id: "s", category: "customer_credit", amount: -200, reference_id: "a", method: "credit_balance", created_at: "2026-02-01T09:00:00Z" }),
      tx({ id: "sp", category: "customer_payment", amount: 200, reference_id: "a", method: "credit_balance", created_at: "2026-02-01T09:00:00Z" }),
    ];
    const before = netBeforeInvoice("z", { invoices, transactions: base });
    const after = netBeforeInvoice("z", { invoices, transactions: withSettle });
    expect(after).toBe(before);
    expect(after).toBe(-300); // 500 − 800
  });

  it("الفاتورة الملغاة لا تدخل الحساب القديم", () => {
    const invoices = [
      inv({ id: "x", created_at: "2026-01-01T09:00:00Z", total: 5000, status: "cancelled" }),
      inv({ id: "b", created_at: "2026-02-01T09:00:00Z", total: 300 }),
    ];
    expect(netBeforeInvoice("b", { invoices, transactions: [] })).toBe(0);
  });
});

describe("الترتيب الزمني", () => {
  it("حركة في نفس لحظة الفاتورة لا تُحتسب قبلها", () => {
    const invoices = [inv({ id: "a", created_at: "2026-01-01T09:00:00Z", total: 500 })];
    const transactions = [
      tx({ id: "p", category: "customer_payment", amount: 100, created_at: "2026-01-01T09:00:00Z" }),
    ];
    // «قبل» تعني قبلها تماماً — لا تشمل ما وقع في نفس اللحظة
    expect(netBeforeInvoice("a", { invoices, transactions })).toBe(0);
  });

  it("تاريخ بلا وقت يُعامل كبداية اليوم فيسبق حركات اليوم نفسه", () => {
    expect(stampKey({ date: "2026-01-01" })).toBe("2026-01-01T00:00:00.000Z");
    expect(stampKey({ date: "2026-01-01", created_at: "2026-01-01T14:00:00Z" }))
      .toBe("2026-01-01T14:00:00.000Z");
  });

  it("الأحداث مرتّبة تصاعدياً", () => {
    const events = accountEvents({
      invoices: [inv({ id: "b", created_at: "2026-02-01T09:00:00Z", total: 300 })],
      transactions: [tx({ id: "ch", category: "customer_credit", amount: 800, created_at: "2026-01-10T09:00:00Z" })],
    });
    expect(events.map((e) => e.effect)).toEqual([-800, 300]);
  });
});

describe("حالات الحافة", () => {
  it("فاتورة غير موجودة تُعيد null لا صفراً", () => {
    expect(netBeforeInvoice("nope", { invoices: [], transactions: [] })).toBeNull();
  });

  it("لحظة فارغة تُعيد صفراً بلا كسر", () => {
    expect(customerNetBefore("", { invoices: [], transactions: [] })).toBe(0);
  });

  it("بلا بيانات إطلاقاً", () => {
    expect(accountEvents({})).toEqual([]);
  });
});
