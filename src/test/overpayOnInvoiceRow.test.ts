// القاعدة الصارمة: لا توزيع، والفائض في سطر فاتورته.
//
// من دفع 500 على فاتورة 400 دفعها كلها في عمليةٍ واحدة. تفتيتها إلى «مدفوع
// 400» وسطرٍ ثانٍ «دفعة زائدة +100» يجعل حساب الفاتورة على سطرها خاطئاً:
// يقرأ العميل «خالص» وقد دفع أكثر، ولا يعرف من أين جاء السطر الثاني.
import { describe, it, expect } from "vitest";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";

const inv = (id: string, total: number, paid: number, day: string) => ({
  id, invoice_number: `INV-${id}`, date: `2026-03-${day}`,
  created_at: `2026-03-${day}T09:00:00`, total, paid_amount: paid, status: "paid",
});

describe("الفائض في سطر فاتورته — مثال العميل", () => {
  // فاتورة 400 دفع عليها 500: 400 على الفاتورة و100 فائض
  const v = buildCustomerAccountView({
    invoices: [inv("a", 400, 400, "01")],
    transactions: [
      { id: "p", category: "customer_payment", amount: 400, reference_id: "a",
        method: "cash", date: "2026-03-01", created_at: "2026-03-01T10:00:00" },
      { id: "o", category: "customer_credit", amount: 100, reference_id: "a",
        date: "2026-03-01", created_at: "2026-03-01T10:00:00",
        description: "فائض دفعة على فاتورة A" },
    ],
    netBalance: -100,
  });

  it("سطر واحد يحمل الحساب كاملاً: 400 · 500 · +100", () => {
    expect(v.rows).toHaveLength(1);
    const [row] = v.rows;
    expect(row.kind).toBe("invoice");
    expect([row.value, row.paid, row.remaining]).toEqual([400, 500, 100]);
  });

  it("لا سطر «دفعة زائدة» مستقلاً", () => {
    expect(v.rows.some((r) => /زائدة/.test(r.label))).toBe(false);
    expect(v.rows.filter((r) => r.kind === "credit")).toEqual([]);
  });

  it("الطرح يقفل والصافي مطابق", () => {
    expect(v.rowsValue - v.rowsPaid).toBe(v.accountTotal);
    expect(v.accountTotal).toBe(-100);
    expect(v.drift).toBe(0);
  });

  it("العمود يُجمع رأسياً فيعطي صافي الحساب", () => {
    expect(v.rows.reduce((s, r) => s + r.remaining, 0)).toBe(100);
  });
});

describe("الشحن يبقى سطراً مستقلاً — يُخصم من التراكمي لا من فاتورة", () => {
  const v = buildCustomerAccountView({
    invoices: [inv("a", 400, 400, "01"), inv("b", 600, 200, "02")],
    transactions: [
      { id: "p1", category: "customer_payment", amount: 400, reference_id: "a",
        method: "cash", date: "2026-03-01", created_at: "2026-03-01T10:00:00" },
      { id: "o", category: "customer_credit", amount: 100, reference_id: "a",
        date: "2026-03-01", created_at: "2026-03-01T10:00:00", description: "فائض دفعة" },
      { id: "p2", category: "customer_payment", amount: 200, reference_id: "b",
        method: "cash", date: "2026-03-02", created_at: "2026-03-02T10:00:00" },
      { id: "ch", category: "customer_credit", amount: 300, date: "2026-03-03",
        created_at: "2026-03-03T09:00:00", description: "شحن رصيد" },
    ],
    netBalance: 0,
  });

  it("ثلاثة أسطر: فاتورتان وشحن — والفائض داخل سطر فاتورته", () => {
    expect(v.rows.map((r) => [r.kind, r.value, r.paid, r.remaining])).toEqual([
      ["invoice", 400, 500, 100],
      ["invoice", 600, 200, -400],
      ["credit", null, 300, 300],
    ]);
  });

  it("مجموع العمود صفر — خالص", () => {
    expect(v.rows.reduce((s, r) => s + r.remaining, 0)).toBe(0);
    expect(v.accountTotal).toBe(0);
  });
});
