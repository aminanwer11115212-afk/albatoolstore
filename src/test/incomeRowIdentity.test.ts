// سطر الإيراد يحمل معرّفه كما تحمل الفاتورة رقمها.
//
// كان «تم شحن +500» بلا معرّف: شحنتان بنفس المبلغ لا يُميَّزان، ولا يستطيع
// العميل مطابقة السطر بإيصال تحويله. صار يحمل حسابه ورقم عمليته — والأرقام
// تبقى في أعمدتها لا في النصّ.
import { describe, it, expect } from "vitest";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";

const charge = (id: string, amount: number, extra: Record<string, any> = {}) => ({
  id, category: "customer_credit", amount,
  date: "2026-05-01", created_at: `2026-05-01T1${id.length}:00:00`,
  description: "شحن رصيد", ...extra,
});

const build = (transactions: any[], accounts?: Map<string, string>) =>
  buildCustomerAccountView({ invoices: [], transactions, accountNameById: accounts });

describe("سطر الإيراد يحمل معرّفه", () => {
  it("رقم العملية يظهر في البيان", () => {
    const v = build([charge("a", 500, { reference_no: "OP-77", method: "bank" })]);
    expect(v.rows[0].label).toContain("رقم العملية OP-77");
  });

  it("اسم الحساب يظهر معه", () => {
    const v = build(
      [charge("a", 500, { reference_no: "OP-9", account_id: "acc-1" })],
      new Map([["acc-1", "بنك الخرطوم"]]),
    );
    expect(v.rows[0].label).toBe("تم شحن +500 — بنك الخرطوم — رقم العملية OP-9");
  });

  it("شحنتان بنفس المبلغ تتمايزان برقم العملية", () => {
    const v = build([
      charge("a", 500, { reference_no: "OP-1" }),
      charge("bb", 500, { reference_no: "OP-2" }),
    ]);
    const labels = v.rows.map((r) => r.label);
    expect(new Set(labels).size).toBe(2);
    expect(labels.some((l) => l.includes("OP-1"))).toBe(true);
    expect(labels.some((l) => l.includes("OP-2"))).toBe(true);
  });

  it("بلا رقم عملية يبقى اسم الحساب وحده — لا نصّ فارغ معلّق", () => {
    const v = build([charge("a", 300, { method: "cash" })]);
    expect(v.rows[0].label).toBe("تم شحن +300 — نقدًا");
  });

  it("الأرقام تبقى في أعمدتها: المدفوع والمتبقي على نفس السطر", () => {
    const v = build([charge("a", 500, { reference_no: "OP-5" })]);
    const [row] = v.rows;
    expect([row.value, row.paid, row.remaining]).toEqual([null, 500, 500]);
  });
});
