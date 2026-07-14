import { describe, it, expect } from "vitest";
import { computeReconciliation, sortGroups } from "@/lib/chargeReconciliation";

describe("computeReconciliation", () => {
  it("passes when balance and credit match invoices + surplus", () => {
    const r = computeReconciliation({
      customer: { balance: 150, credit_balance: 30 },
      invoices: [
        { total: 200, paid_amount: 50, status: "partial", source: null },
        { total: 100, paid_amount: 100, status: "paid", source: null },
      ],
      groups: [{ surplus: 30, allocated: 100 }],
    });
    expect(r.ok).toBe(true);
    expect(r.expectedBalance).toBe(150);
    expect(r.expectedCredit).toBe(30);
  });

  it("ignores cancelled and pos invoices in expected balance", () => {
    const r = computeReconciliation({
      customer: { balance: 40, credit_balance: 0 },
      invoices: [
        { total: 40, paid_amount: 0, status: "pending", source: null },
        { total: 500, paid_amount: 0, status: "cancelled", source: null },
        { total: 500, paid_amount: 0, status: "pending", source: "pos" },
      ],
      groups: [],
    });
    expect(r.ok).toBe(true);
    expect(r.expectedBalance).toBe(40);
  });

  it("flags mismatch when customer balance drifts from invoice sum", () => {
    const r = computeReconciliation({
      customer: { balance: 999, credit_balance: 0 },
      invoices: [{ total: 100, paid_amount: 50, status: "partial", source: null }],
      groups: [],
    });
    expect(r.ok).toBe(false);
    expect(r.balanceDelta).toBeGreaterThan(0.02);
    expect(r.text).toMatch(/تعارض/);
  });

  it("flags mismatch when credit_balance differs from summed surplus", () => {
    const r = computeReconciliation({
      customer: { balance: 0, credit_balance: 10 },
      invoices: [],
      groups: [{ surplus: 25, allocated: 0 }, { surplus: 15, allocated: 0 }],
    });
    expect(r.ok).toBe(false);
    expect(r.creditDelta).toBeCloseTo(30, 2);
  });

  it("treats near-zero deltas (≤ 0.02) as ok — rounding tolerance", () => {
    const r = computeReconciliation({
      customer: { balance: 100.01, credit_balance: 0 },
      invoices: [{ total: 100, paid_amount: 0, status: "pending", source: null }],
      groups: [],
    });
    expect(r.ok).toBe(true);
  });

  it("matches the exact banner text shown in the UI", () => {
    const r = computeReconciliation({
      customer: { balance: 50, credit_balance: 20 },
      invoices: [{ total: 50, paid_amount: 0, status: "pending", source: null }],
      groups: [{ surplus: 20, allocated: 0 }],
    });
    expect(r.text).toBe("الأرصدة متطابقة — المستحق 50.00 / الدائن 20.00");
  });
});

describe("sortGroups", () => {
  const rows = [
    { date: "2026-01-01", method: "cash", created_at: "2026-01-01T00:00:00Z" },
    { date: "2026-03-15", method: "bank_transfer", created_at: "2026-03-15T00:00:00Z" },
    { date: "2026-02-10", method: "card", created_at: "2026-02-10T00:00:00Z" },
  ];

  it("sorts by date desc by default", () => {
    expect(sortGroups(rows, "date_desc").map((r) => r.date)).toEqual([
      "2026-03-15", "2026-02-10", "2026-01-01",
    ]);
  });

  it("sorts by date asc", () => {
    expect(sortGroups(rows, "date_asc").map((r) => r.date)).toEqual([
      "2026-01-01", "2026-02-10", "2026-03-15",
    ]);
  });

  it("sorts by method asc / desc", () => {
    expect(sortGroups(rows, "method_asc").map((r) => r.method)).toEqual([
      "bank_transfer", "card", "cash",
    ]);
    expect(sortGroups(rows, "method_desc").map((r) => r.method)).toEqual([
      "cash", "card", "bank_transfer",
    ]);
  });
});
