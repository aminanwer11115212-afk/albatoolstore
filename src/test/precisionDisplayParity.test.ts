import { describe, it, expect } from "vitest";
import { netBalanceOf, computeDisplayBalance, formatMoney } from "@/utils/balanceDisplay";

/**
 * Ensures the UI never diverges from the DB math when totals/discounts
 * arrive as messy decimals or multi-currency floats. `recompute_customer_balance`
 * uses SUM(GREATEST(total - paid, 0)) — we mirror that exactly and assert the
 * displayed value matches to 2 decimals.
 */
function dbBalance(rows: Array<{ total: number; paid: number }>) {
  // Emulate NUMERIC arithmetic by rounding each partial to 2dp (Postgres NUMERIC
  // is exact; JS floats aren't — the DB never returns 0.30000000000000004).
  const r = (n: number) => Math.round(n * 100) / 100;
  return rows.reduce((s, r0) => s + Math.max(r(r0.total) - r(r0.paid), 0), 0);
}

describe("precision parity — DB balance ↔ UI display", () => {
  it("0.1 + 0.2 discounts do not produce 0.30000000000000004 in UI", () => {
    const bal = dbBalance([{ total: 100 - 0.1 - 0.2, paid: 0 }]);
    expect(formatMoney(bal)).toBe("99.7");
    expect(computeDisplayBalance({ balance: bal }).amount).toBeCloseTo(99.7, 2);
  });

  it("many small decimal invoices round-trip without drift", () => {
    const rows = Array.from({ length: 17 }, () => ({ total: 12.37, paid: 0 }));
    const bal = dbBalance(rows);
    // 17 * 12.37 = 210.29 — must render exactly
    expect(formatMoney(bal)).toBe("210.29");
  });

  it("mixed-currency-scale amounts (large + tiny) stay stable to 2dp", () => {
    const bal = dbBalance([
      { total: 1_250_000.55, paid: 0 },
      { total: 0.01, paid: 0 },
      { total: 0.99, paid: 0.5 },
    ]);
    // 1,250,000.55 + 0.01 + 0.49 = 1,250,001.05
    expect(formatMoney(bal)).toBe(Number(1_250_001.05).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });

  it("discount larger than remaining clamps display to 0 (never negative amount)", () => {
    // simulated -50 total after aggressive discount
    const bal = dbBalance([{ total: -50, paid: 0 }]);
    const d = computeDisplayBalance({ balance: bal });
    expect(bal).toBe(0);
    expect(d.direction).toBe("settled");
    expect(d.amount).toBe(0);
  });

  it("net = balance - credit_balance survives float subtraction", () => {
    // paying 100.10 against 100.10 debt should render as 'مسوّى', not 'له 0.0000001'
    const net = netBalanceOf({ balance: 100.1, credit_balance: 100.1 });
    expect(Math.abs(net)).toBeLessThan(0.01);
    expect(computeDisplayBalance({ balance: 100.1, credit_balance: 100.1 }).direction).toBe("settled");
  });

  it("tiny residual under 0.01 is treated as settled (no phantom 'له')", () => {
    const d = computeDisplayBalance({ balance: 500, credit_balance: 500.004 });
    expect(d.direction).toBe("settled");
    expect(d.label).toBe("مسوّى");
  });

  it("formatMoney preserves whole numbers without trailing .00", () => {
    expect(formatMoney(1500)).toBe(Number(1500).toLocaleString());
    expect(formatMoney(1500.5)).toBe(Number(1500.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });
});
