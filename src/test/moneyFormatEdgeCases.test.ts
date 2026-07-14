import { describe, it, expect } from "vitest";
import { formatMoney, computeDisplayBalance, netBalanceOf } from "@/utils/balanceDisplay";

/**
 * Edge cases for money formatting — guards against display/DB mismatch caused
 * by JS float quirks (negative zero, huge separators, trailing zero decimals).
 *
 * Rules the UI must obey (mirror of `recompute_customer_balance` in DB):
 *   - No "-0" ever renders.
 *   - Whole numbers render without trailing decimals (never "1500.00").
 *   - Very large numbers keep the locale thousand separators.
 *   - Sub-cent residuals collapse to "مسوّى" (never render as "له 0").
 */
describe("formatMoney — edge cases", () => {
  it("negative zero renders as plain 0 (no leading minus sign)", () => {
    const out = formatMoney(-0);
    expect(out.startsWith("-")).toBe(false);
    expect(out).toBe(Number(0).toLocaleString());
  });

  it("tiny negative residual (-0.004) rounds to plain 0", () => {
    const out = formatMoney(-0.004);
    expect(out.startsWith("-")).toBe(false);
    expect(out).toBe(Number(0).toLocaleString());
  });

  it("large amounts keep thousand separators", () => {
    const out = formatMoney(1_234_567.89);
    // must be locale-formatted (contain a separator) not scientific / plain digits
    expect(out).toBe(Number(1_234_567.89).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    expect(/\d{7,}/.test(out.replace(/[.,]/g, ""))).toBe(true); // still 9 digits after stripping seps
  });

  it("whole numbers never gain trailing .00", () => {
    expect(formatMoney(1500)).toBe(Number(1500).toLocaleString());
    expect(formatMoney(1500)).not.toMatch(/\.00$/);
    expect(formatMoney(1_000_000)).not.toMatch(/\.00$/);
  });

  it("trailing single-decimal preserved (0.5 → 0.5, not 0.50)", () => {
    expect(formatMoney(1500.5)).not.toMatch(/\.50$/);
    expect(formatMoney(1500.5)).toBe(Number(1500.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });

  it("null / undefined / NaN safely render as 0", () => {
    expect(formatMoney(null)).toBe(Number(0).toLocaleString());
    expect(formatMoney(undefined)).toBe(Number(0).toLocaleString());
    expect(formatMoney(NaN)).toBe(Number(0).toLocaleString());
  });

  it("float artefacts (0.1+0.2) never leak as 0.30000000000000004", () => {
    expect(formatMoney(0.1 + 0.2)).toBe(Number(0.3).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });
});

describe("computeDisplayBalance — edge cases", () => {
  it("negative zero net → settled, no 'له' phantom", () => {
    const d = computeDisplayBalance({ balance: 0, credit_balance: 0 });
    expect(d.direction).toBe("settled");
    expect(d.label).toBe("مسوّى");
    expect(Object.is(d.amount, -0)).toBe(false);
  });

  it("sub-cent residual under 0.01 collapses to settled", () => {
    const d = computeDisplayBalance({ balance: 100, credit_balance: 100.009 });
    expect(d.direction).toBe("settled");
  });

  it("very large debtor amount preserves precision to 2dp", () => {
    const d = computeDisplayBalance({ balance: 9_876_543.21, credit_balance: 0 });
    expect(d.direction).toBe("debtor");
    expect(d.amount).toBeCloseTo(9_876_543.21, 2);
  });

  it("netBalanceOf prefers DB net_balance column when present", () => {
    // Even if raw balance/credit disagree, DB-computed net wins.
    expect(netBalanceOf({ balance: 100, credit_balance: 30, net_balance: 55 })).toBe(55);
  });
});
