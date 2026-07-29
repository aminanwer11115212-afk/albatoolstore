import { describe, it, expect } from "vitest";
import { buildSettlementLedger } from "@/lib/settlementLedger";

// سيناريو القبول: 5 فواتير + فائض من الفاتورة 4 + شحن رصيد 300
const invoices = [
  { id: "i1", invoice_number: "INV-1", date: "2026-01-01", total: 500, paid_amount: 500 },
  { id: "i2", invoice_number: "INV-2", date: "2026-01-02", total: 600, paid_amount: 600 },
  { id: "i3", invoice_number: "INV-3", date: "2026-01-03", total: 300, paid_amount: 300 },
  { id: "i4", invoice_number: "INV-4", date: "2026-01-04", total: 500, paid_amount: 500 },
  { id: "i5", invoice_number: "INV-5", date: "2026-01-05", total: 500, paid_amount: 400 },
];

const settle = (id: string, invId: string, invNum: string, applied: number, srcKind: string, srcRef: string, srcNum: string | null, date: string) => [
  {
    id: `p-${id}`,
    date,
    category: "customer_payment",
    method: "credit_balance",
    amount: applied,
    reference_id: invId,
    allocation: {
      kind: "credit_used", auto: true, applied, invoice_id: invId, invoice_number: invNum,
      new_status: "paid", source_kind: srcKind, source_ref: srcRef, source_invoice_number: srcNum, source_date: date,
    },
  },
  { id: `c-${id}`, date, category: "customer_credit", amount: -applied, reference_id: invId, allocation: { kind: "credit_used" } },
];

const transactions: any[] = [
  { id: "t1", date: "2026-01-01", category: "customer_payment", method: "cash", amount: 300, reference_id: "i1" },
  { id: "t2", date: "2026-01-02", category: "customer_payment", method: "cash", amount: 400, reference_id: "i2" },
  { id: "t3", date: "2026-01-03", category: "customer_payment", method: "cash", amount: 200, reference_id: "i3" },
  { id: "t4", date: "2026-01-04", category: "customer_payment", method: "cash", amount: 500, reference_id: "i4" },
  { id: "t5", date: "2026-01-04", category: "customer_credit", amount: 500, reference_id: "i4", allocation: { kind: "overpay_surplus", invoice_id: "i4", invoice_number: "INV-4" } },
  ...settle("s1", "i1", "INV-1", 200, "invoice_overpay", "i4", "INV-4", "2026-01-04"),
  ...settle("s2", "i2", "INV-2", 200, "invoice_overpay", "i4", "INV-4", "2026-01-04"),
  ...settle("s3", "i3", "INV-3", 100, "invoice_overpay", "i4", "INV-4", "2026-01-04"),
  { id: "t6", date: "2026-01-05", category: "customer_payment", method: "cash", amount: 100, reference_id: "i5" },
  { id: "t7", date: "2026-01-06", category: "customer_credit", amount: 300, allocation: { kind: "manual_charge", group_id: "g1" } },
  {
    id: "p-s4", date: "2026-01-06", category: "customer_payment", method: "credit_balance", amount: 300, reference_id: "i5",
    allocation: { kind: "credit_used", auto: true, applied: 300, invoice_id: "i5", invoice_number: "INV-5", new_status: "partial", source_kind: "manual_charge", source_ref: "g1", source_date: "2026-01-06" },
  },
  { id: "c-s4", date: "2026-01-06", category: "customer_credit", amount: -300, reference_id: "i5", allocation: { kind: "credit_used" } },
];

describe("buildSettlementLedger — سيناريو التسوية التلقائية", () => {
  const ledger = buildSettlementLedger({ invoices, transactions });

  it("الرصيد النهائي = 100 مطلوب من العميل", () => {
    expect(ledger.finalBalance).toBe(100);
    expect(ledger.totalDebit).toBe(2400);
    expect(ledger.totalCredit).toBe(2300);
  });

  it("لا تُعرض قيود التسوية المتعادلة كصفوف مستقلة", () => {
    expect(ledger.rows.some((r) => r.key.startsWith("tx-p-s"))).toBe(false);
    expect(ledger.rows.some((r) => r.key.startsWith("tx-c-s"))).toBe(false);
  });

  it("الفواتير 1-3 مسددة بالكامل مع ذكر مصدر التسوية", () => {
    for (const n of ["i1", "i2", "i3"]) {
      const row = ledger.rows.find((r) => r.key === `inv-${n}`)!;
      expect(row.note).toContain("مسددة بالكامل");
      expect(row.note).toContain("من دفعة فاتورة رقم INV-4");
    }
  });

  it("صف الفائض يوضح تصفير المديونية السابقة", () => {
    const row = ledger.rows.find((r) => r.key === "tx-t5")!;
    expect(row.note).toContain("تم تصفير المديونية السابقة كاملة");
    expect(row.tone).toBe("success");
  });

  it("صف شحن الرصيد يوضح الخصم الجزئي من الفاتورة 5", () => {
    const row = ledger.rows.find((r) => r.key === "tx-t7")!;
    expect(row.note).toContain("خصم من متبقي الفاتورة رقم INV-5");
    expect(row.balance).toBe(100);
  });

  it("الفاتورة 5 تبقى مفتوحة بمتبقي 100", () => {
    const row = ledger.rows.find((r) => r.key === "inv-i5")!;
    expect(row.note).toContain("متبقي 100");
  });
});
