// القاعدة: «الحساب القديم» = رصيد العميل **قبل إنشاء هذه الفاتورة**.
//
// ومنها تلزم متطابقة تربط الصندوقين في معاينة الفاتورة:
//     الحالي = القديم + إجمالي الفاتورة − المدفوع عليها − أي حركة بعدها
//
// فحالة الفائض (المدفوع > الإجمالي، بلا حركة لاحقة) يجب أن **تفرّق** بينهما
// بمقدار الفائض بالضبط. تطابقهما في هذه الحالة عطل لا صدفة.
import { describe, it, expect } from "vitest";
import { accountEvents, netBeforeInvoice, customerNetBefore } from "@/utils/customerNetBefore";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** الرصيد الحالي محسوباً من نفس الأحداث — لا من العمود المخزَّن. */
const netNow = (input: Parameters<typeof accountEvents>[0]) =>
  r2(accountEvents(input).reduce((s, e) => s + e.effect, 0));

describe("«الحساب القديم» مقابل «الرصيد الحالي»", () => {
  // فاتورة 300 دُفع عليها 400: 300 على الفاتورة و100 فائض إلى الرصيد
  const overpay = {
    invoices: [{ id: "inv-1", total: 300, date: "2026-08-01", created_at: "2026-08-01T10:00:00.000Z" }],
    transactions: [
      { id: "pay-1", category: "customer_payment", amount: 300, method: "cash",
        reference_id: "inv-1", date: "2026-08-01", created_at: "2026-08-01T10:05:00.000Z" },
      { id: "cr-1", category: "customer_credit", amount: 100,
        reference_id: "inv-1", date: "2026-08-01", created_at: "2026-08-01T10:05:00.000Z" },
    ],
  };

  it("الفائض يفرّق بين الصندوقين بمقداره بالضبط — لا يطابقهما", () => {
    const before = netBeforeInvoice("inv-1", overpay)!;
    const now = netNow(overpay);
    expect(before).toBe(0);      // لا شيء قبل الفاتورة
    expect(now).toBe(-100);      // له 100 فائضاً
    expect(r2(before - now)).toBe(100);
    expect(before).not.toBe(now);
  });

  it("والفرق نفسه يبقى مع رصيد سابق قائم", () => {
    const withPrior = {
      invoices: overpay.invoices,
      transactions: [
        { id: "cr-0", category: "customer_credit", amount: 50,
          reference_id: null, date: "2026-07-20", created_at: "2026-07-20T09:00:00.000Z" },
        ...overpay.transactions,
      ],
    };
    const before = netBeforeInvoice("inv-1", withPrior)!;
    expect(before).toBe(-50);                       // له 50 قبل الفاتورة
    expect(netNow(withPrior)).toBe(-150);           // له 150 بعدها
    expect(r2(before - netNow(withPrior))).toBe(100);
  });

  it("التطابق مشروع وحده حين تُسدَّد الفاتورة بالضبط ولا حركة بعدها", () => {
    const exact = {
      invoices: overpay.invoices,
      transactions: [
        { id: "cr-0", category: "customer_credit", amount: 50,
          reference_id: null, date: "2026-07-20", created_at: "2026-07-20T09:00:00.000Z" },
        { id: "pay-1", category: "customer_payment", amount: 300, method: "cash",
          reference_id: "inv-1", date: "2026-08-01", created_at: "2026-08-01T10:05:00.000Z" },
      ],
    };
    // القديم = الحالي = −50: الفاتورة دخلت وخرجت فلم تغيّر الحساب.
    expect(netBeforeInvoice("inv-1", exact)).toBe(-50);
    expect(netNow(exact)).toBe(-50);
  });

  it("دفعة الفاتورة لا تُحسب ضمن «القديم» ولو حملت نفس طابع الإنشاء", () => {
    // `now()` واحد داخل معاملة قاعدة واحدة، فالفاتورة ودفعتها قد تتساويان.
    const sameStamp = {
      invoices: overpay.invoices,
      transactions: [
        { id: "pay-1", category: "customer_payment", amount: 400, method: "cash",
          reference_id: "inv-1", date: "2026-08-01", created_at: "2026-08-01T10:00:00.000Z" },
      ],
    };
    expect(netBeforeInvoice("inv-1", sameStamp)).toBe(0);
  });

  it("قيدٌ بلا طابع إنشاء لا يُزحزَح إلى ما قبل فاتورة نفس اليوم", () => {
    // بيانات مُرحَّلة قد تصل بـ`date` وحده. تاريخٌ بلا وقت = بداية اليوم، فيسبق
    // فاتورة الساعة 10 من نفس اليوم ويُحسب خطأً ضمن «القديم» — وهو المسار
    // الوحيد الذي يجعل الصندوقين يتطابقان في حالة فائض.
    const noStamp = {
      invoices: overpay.invoices,
      transactions: [
        { id: "pay-1", category: "customer_payment", amount: 400, method: "cash",
          reference_id: "inv-1", date: "2026-08-01", created_at: null },
      ],
    };
    expect(netBeforeInvoice("inv-1", noStamp)).toBe(0);
  });

  it("customerNetBefore يستبعد اللحظة نفسها ويضمّ ما قبلها", () => {
    const at = "2026-08-01T10:00:00.000Z";
    expect(customerNetBefore(at, overpay)).toBe(0);
    expect(customerNetBefore("2026-08-01T23:59:59.000Z", overpay)).toBe(-100);
  });
});
