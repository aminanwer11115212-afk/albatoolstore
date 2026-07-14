import { describe, it, expect } from "vitest";
import { computeDisplayBalance } from "@/utils/balanceDisplay";

/**
 * Contract test for the label shown next to the customer on the invoice-create
 * screen. Mirrors the E2E scenarios that a browser harness would run:
 *   - Partial payments across multiple invoices
 *   - Rounding threshold near zero
 *   - Overpayment producing surplus credit
 *
 * If this fails, the invoice-create UI will silently display the wrong label.
 */
function simulateCustomer(invoices: Array<{ total: number; paid: number }>, creditBalance = 0) {
  const balance = invoices.reduce((s, i) => s + Math.max(i.total - i.paid, 0), 0);
  return { balance, credit_balance: creditBalance };
}

describe("invoice-create — 'عليه/له/خالص' label parity", () => {
  it("single partial payment → 'عليه' with remainder", () => {
    const c = simulateCustomer([{ total: 1000, paid: 400 }]);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("عليه");
    expect(d.amount).toBe(600);
  });

  it("multiple invoices, some paid, some open → 'عليه' with sum of open remainders", () => {
    const c = simulateCustomer([
      { total: 500, paid: 500 }, // fully paid
      { total: 800, paid: 300 }, // 500 open
      { total: 250, paid: 0 },   // 250 open
    ]);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("عليه");
    expect(d.amount).toBe(750);
  });

  it("all invoices paid + extra credit charged → 'له' with surplus only", () => {
    const c = simulateCustomer([{ total: 500, paid: 500 }], 300);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("له");
    expect(d.amount).toBe(300);
  });

  it("open invoice + credit that partially covers → still 'عليه' with residual", () => {
    // 800 open, 300 credit → net 500 debt
    const c = simulateCustomer([{ total: 800, paid: 0 }], 300);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("عليه");
    expect(d.amount).toBe(500);
  });

  it("open invoice + credit that overpays → flips to 'له' with surplus", () => {
    const c = simulateCustomer([{ total: 200, paid: 0 }], 500);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("له");
    expect(d.amount).toBe(300);
  });

  it("rounding threshold: residual < 0.01 renders as 'خالص', not 'له'", () => {
    const c = simulateCustomer([{ total: 100.005, paid: 100 }]);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("خالص");
  });

  it("rounding threshold: residual >= 0.01 still renders as 'عليه'", () => {
    const c = simulateCustomer([{ total: 100.02, paid: 100 }]);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("عليه");
    expect(d.amount).toBeCloseTo(0.02, 2);
  });

  it("exactly balanced with credit → 'خالص'", () => {
    const c = simulateCustomer([{ total: 100, paid: 0 }], 100);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("خالص");
    expect(d.amount).toBe(0);
  });

  it("many small invoices with mixed partial payments — precision stays stable", () => {
    const invoices = Array.from({ length: 12 }, (_, i) => ({ total: 33.33, paid: i % 2 === 0 ? 33.33 : 0 }));
    // 6 unpaid × 33.33 = 199.98
    const c = simulateCustomer(invoices);
    const d = computeDisplayBalance(c);
    expect(d.label).toBe("عليه");
    expect(d.amount).toBeCloseTo(199.98, 2);
  });
});
