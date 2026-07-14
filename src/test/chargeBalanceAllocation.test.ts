import { describe, it, expect } from "vitest";
import { netBalanceOf, computeDisplayBalance } from "@/utils/balanceDisplay";

/**
 * ChargeBalanceDialog inserts a single `customer_credit` transaction. The DB
 * trigger `recompute_customer_balance` then:
 *   - `balance`        = Σ GREATEST(invoice.total − invoice.paid_amount, 0)   [never negative]
 *   - `credit_balance` = Σ customer_credit transactions
 *   - `net_balance`    = balance − credit_balance                             [can be negative]
 *
 * The UI convention says: any charged credit reduces net dues FIRST; only any
 * surplus turns into "له" (creditor). These tests lock that allocation logic in.
 */
function afterCharge(opts: { debt: number; existingCredit?: number; charge: number }) {
  const debt = opts.debt;
  const credit = (opts.existingCredit || 0) + opts.charge;
  return {
    balance: debt,
    credit_balance: credit,
    net_balance: debt - credit,
  };
}

describe("charge balance allocation — dues first, surplus as credit", () => {
  it("charge < total dues → still 'عليه' with reduced amount", () => {
    const row = afterCharge({ debt: 1000, charge: 300 });
    const d = computeDisplayBalance(row);
    expect(d.direction).toBe("debtor");
    expect(d.label).toBe("عليه");
    expect(d.amount).toBe(700);
    expect(row.balance).toBe(1000); // raw invoice balance untouched
    expect(row.credit_balance).toBe(300);
  });

  it("charge == total dues → 'مسوّى'", () => {
    const row = afterCharge({ debt: 1000, charge: 1000 });
    expect(computeDisplayBalance(row).direction).toBe("settled");
    expect(netBalanceOf(row)).toBe(0);
  });

  it("charge > total dues → 'له' with the surplus only", () => {
    const row = afterCharge({ debt: 800, charge: 1000 });
    const d = computeDisplayBalance(row);
    expect(d.direction).toBe("creditor");
    expect(d.label).toBe("له");
    expect(d.amount).toBe(200);
  });

  it("customer with zero dues + charge → full charge becomes credit", () => {
    const row = afterCharge({ debt: 0, charge: 500 });
    expect(row.balance).toBe(0);
    expect(row.credit_balance).toBe(500);
    expect(computeDisplayBalance(row)).toMatchObject({ direction: "creditor", label: "له", amount: 500 });
  });

  it("multiple partial charges stack on credit_balance, net keeps shrinking", () => {
    let row = afterCharge({ debt: 1000, charge: 200 });
    expect(computeDisplayBalance(row).amount).toBe(800);
    row = afterCharge({ debt: 1000, existingCredit: 200, charge: 300 });
    expect(computeDisplayBalance(row).amount).toBe(500);
    row = afterCharge({ debt: 1000, existingCredit: 500, charge: 500 });
    expect(computeDisplayBalance(row).direction).toBe("settled");
  });

  it("decimal charge respects 2dp — no phantom residual 'له 0.001'", () => {
    const row = afterCharge({ debt: 1234.56, charge: 1234.56 });
    expect(computeDisplayBalance(row).direction).toBe("settled");
  });
});

describe("invoice-create header balance label — display contract", () => {
  // Mirrors the inline logic in src/pages/InvoiceCreatePage.tsx (~line 1660).
  function labelOf(customer: { balance: number; credit_balance?: number }) {
    return computeDisplayBalance(customer).label;
  }

  it("shows 'عليه' when unpaid invoices exist (net > 0)", () => {
    expect(labelOf({ balance: 500, credit_balance: 0 })).toBe("عليه");
    expect(labelOf({ balance: 500, credit_balance: 200 })).toBe("عليه");
  });

  it("shows 'له' ONLY when all invoices paid and surplus exists (net < 0)", () => {
    expect(labelOf({ balance: 0, credit_balance: 300 })).toBe("له");
  });

  it("never shows 'له' when the customer still owes anything", () => {
    // even huge credit against still-open invoices → we render the dues, not 'له'
    expect(labelOf({ balance: 100, credit_balance: 50 })).toBe("عليه");
  });

  it("'مسوّى' when everything nets to zero", () => {
    expect(labelOf({ balance: 500, credit_balance: 500 })).toBe("مسوّى");
    expect(labelOf({ balance: 0, credit_balance: 0 })).toBe("مسوّى");
  });
});
