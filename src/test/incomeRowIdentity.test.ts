// بيان سطر الإيراد مختصر — والتفاصيل محفوظة لقسم «المعاملات».
//
// جُرِّب إلحاق الحساب ورقم العملية بالبيان ليتمايز شحنان بنفس المبلغ، فصار
// السطر أربعة أسطر على الهاتف: «تم شحن +3,000 — اولاد جابر — بنك الخرطوم —
// رقم العملية 6080». وعمود البيان ضيّق، فابتلع الطولُ الصفَّ.
//
// فالكشف موضعٌ للأرقام: كم دخل وكم بقي، مقروءان من عمودَيهما. أمّا الحساب
// ورقم العملية فمكانها «المعاملات» حيث لكلٍّ عمودُه — وهي **لا تضيع**: تبقى
// في `detail` على القيد، وهذه الاختبارات تحرس بقاءها.
import { describe, it, expect } from "vitest";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";

const charge = (id: string, amount: number, extra: Record<string, any> = {}) => ({
  id, category: "customer_credit", amount,
  date: "2026-05-01", created_at: `2026-05-01T1${id.length}:00:00`,
  description: "شحن رصيد", ...extra,
});

const build = (transactions: any[], accounts?: Map<string, string>) =>
  buildCustomerAccountView({ invoices: [], transactions, accountNameById: accounts });

describe("بيان سطر الإيراد مختصر", () => {
  it("المبلغ وحده — لا حساب ولا رقم عملية يُطيلان العمود", () => {
    const v = build([charge("a", 500, { reference_no: "OP-77", method: "bank" })]);
    expect(v.rows[0].label).toBe("تم شحن +500");
    expect(v.rows[0].label).not.toContain("رقم العملية");
  });

  it("اسم الحساب لا يظهر في البيان ولو كان معرَّفاً", () => {
    const v = build(
      [charge("a", 500, { reference_no: "OP-9", account_id: "acc-1" })],
      new Map([["acc-1", "بنك الخرطوم"]]),
    );
    expect(v.rows[0].label).toBe("تم شحن +500");
  });

  it("الأرقام في أعمدتها: المدفوع والمتبقي على نفس السطر", () => {
    const [row] = build([charge("a", 500, { reference_no: "OP-5" })]).rows;
    expect([row.value, row.paid, row.remaining]).toEqual([null, 500, 500]);
  });
});

describe("التفاصيل لا تضيع — تبقى للمعاملات", () => {
  it("رقم العملية واسم الحساب محفوظان في القيد", () => {
    const v = build(
      [charge("a", 500, { reference_no: "OP-9", account_id: "acc-1" })],
      new Map([["acc-1", "بنك الخرطوم"]]),
    );
    const entry = v.creditPool[0];
    expect(entry.detail).toContain("بنك الخرطوم");
    expect(entry.detail).toContain("رقم العملية OP-9");
  });

  it("شحنتان بنفس المبلغ تتمايزان في المعاملات لا في البيان", () => {
    const v = build([
      charge("a", 500, { reference_no: "OP-1" }),
      charge("bb", 500, { reference_no: "OP-2" }),
    ]);
    // البيان واحد — والتمييز في تفاصيل القيد
    expect(new Set(v.rows.map((r) => r.label)).size).toBe(1);
    const details = v.creditPool.map((e) => e.detail);
    expect(details.some((d) => d.includes("OP-1"))).toBe(true);
    expect(details.some((d) => d.includes("OP-2"))).toBe(true);
  });
});
