import { describe, it, expect } from "vitest";
import { netBalanceOf } from "@/utils/balanceDisplay";

/**
 * Consistency contract for `netBalanceOf`:
 * every surface (CustomerDetailView, CustomersPage, statement pages,
 * debt report, print templates) MUST derive the customer's net balance
 * through this helper so all pages show the same number.
 */
describe("netBalanceOf — single source of truth", () => {
  it("returns 0 for null / undefined customer", () => {
    expect(netBalanceOf(null)).toBe(0);
    expect(netBalanceOf(undefined)).toBe(0);
    expect(netBalanceOf({})).toBe(0);
  });

  it("prefers DB-computed net_balance when present", () => {
    expect(netBalanceOf({ balance: 999, credit_balance: 0, net_balance: 250 })).toBe(250);
    expect(netBalanceOf({ balance: 0, credit_balance: 999, net_balance: -300 })).toBe(-300);
    expect(netBalanceOf({ balance: 100, credit_balance: 40, net_balance: 0 })).toBe(0);
  });

  it("falls back to balance − credit_balance when net_balance is missing", () => {
    expect(netBalanceOf({ balance: 500, credit_balance: 200 })).toBe(300);
    expect(netBalanceOf({ balance: 100, credit_balance: 400 })).toBe(-300);
    expect(netBalanceOf({ balance: 50, credit_balance: 50 })).toBe(0);
  });

  it("treats null numeric fields as 0", () => {
    expect(netBalanceOf({ balance: null, credit_balance: 100 })).toBe(-100);
    expect(netBalanceOf({ balance: 100, credit_balance: null })).toBe(100);
    expect(netBalanceOf({ balance: null, credit_balance: null })).toBe(0);
  });

  it("ignores NaN net_balance and falls back to raw diff", () => {
    expect(netBalanceOf({ balance: 200, credit_balance: 50, net_balance: NaN })).toBe(150);
  });

  it("coerces string numeric fields (Supabase JSON quirks)", () => {
    expect(netBalanceOf({ balance: "300" as any, credit_balance: "100" as any })).toBe(200);
    expect(netBalanceOf({ net_balance: "-75" as any })).toBe(-75);
  });

  it("gives identical output regardless of which page-shaped input is used", () => {
    // Shape A: full DB row (has net_balance)
    const a = netBalanceOf({ balance: 800, credit_balance: 300, net_balance: 500 });
    // Shape B: legacy cached row (no net_balance)
    const b = netBalanceOf({ balance: 800, credit_balance: 300 });
    // Shape C: only net_balance available (public statement)
    const c = netBalanceOf({ net_balance: 500 });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
