import { describe, it, expect } from "vitest";
import { netBalanceOf } from "@/utils/balanceDisplay";

/**
 * Mirrors the DB rule `recompute_customer_balance`:
 *   balance = Σ GREATEST(total − paid_amount, 0)  (per non-cancelled, non-pos invoice)
 * Guarantees:
 *   - balance is NEVER negative
 *   - a discount on a single invoice reduces its `total`, which reduces balance
 *   - net = balance − credit_balance; can be negative (customer has credit)
 */
function recomputeBalance(invoices: Array<{ total: number; paid: number; cancelled?: boolean }>) {
  let bal = 0;
  for (const inv of invoices) {
    if (inv.cancelled) continue;
    bal += Math.max((inv.total || 0) - (inv.paid || 0), 0);
  }
  return bal;
}

describe("discount → recompute_customer_balance (never negative)", () => {
  it("partial discount reduces balance by discount amount", () => {
    const before = recomputeBalance([{ total: 1000, paid: 0 }]);
    const after = recomputeBalance([{ total: 1000 - 200, paid: 0 }]);
    expect(before - after).toBe(200);
    expect(after).toBe(800);
  });

  it("full discount equal to remaining zeros the invoice balance", () => {
    const after = recomputeBalance([{ total: 1000 - 1000, paid: 0 }]);
    expect(after).toBe(0);
  });

  it("discount larger than remaining still clamps to 0 (never negative)", () => {
    // simulate discount = 1500 on a 1000-invoice → total goes to -500
    const after = recomputeBalance([{ total: -500, paid: 0 }]);
    expect(after).toBe(0);
    expect(after).toBeGreaterThanOrEqual(0);
  });

  it("discount on partly-paid invoice reduces remaining, still >= 0", () => {
    // total 1000, paid 400, discount 300 → total 700, remaining 300
    const after = recomputeBalance([{ total: 700, paid: 400 }]);
    expect(after).toBe(300);
  });

  it("discount + overpayment split — main invoice zeroed, overpay recorded as credit", () => {
    const invoicesAfter = [{ total: 900, paid: 900 }]; // discount 100 + full pay
    const bal = recomputeBalance(invoicesAfter);
    // overpay 200 tracked as credit_balance
    const net = netBalanceOf({ balance: bal, credit_balance: 200 });
    expect(bal).toBe(0);
    expect(net).toBe(-200); // "له 200"
  });

  it("multiple invoices — one discounted to 0, other still owed", () => {
    const after = recomputeBalance([
      { total: 0, paid: 0 },
      { total: 500, paid: 0 },
    ]);
    expect(after).toBe(500);
  });

  it("cancelled invoices are ignored", () => {
    const after = recomputeBalance([
      { total: 9999, paid: 0, cancelled: true },
      { total: 300, paid: 0 },
    ]);
    expect(after).toBe(300);
  });
});

describe("netBalanceOf never invents negatives on the raw side", () => {
  it("balance side is clamped by DB; net can go negative only via credit_balance", () => {
    // Even if we simulate the app receiving a stale row where balance is 0 and credit is high,
    // net is negative but balance itself remains 0.
    const bal = recomputeBalance([{ total: 100, paid: 100 }]);
    expect(bal).toBe(0);
    expect(netBalanceOf({ balance: bal, credit_balance: 300 })).toBe(-300);
  });

  it("partial discount keeps balance positive, net follows", () => {
    const bal = recomputeBalance([{ total: 800, paid: 0 }]);
    expect(netBalanceOf({ balance: bal, credit_balance: 0 })).toBe(800);
    expect(netBalanceOf({ balance: bal, credit_balance: 200 })).toBe(600);
  });
});
