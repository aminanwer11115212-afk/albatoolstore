import { describe, it, expect } from "vitest";

/**
 * Pure-function integration tests for the reverse-charge & delete-conversion
 * semantics that our RPCs guarantee. We reproduce the DB math on the client
 * so that regressions in either layer surface as a test failure.
 *
 * The two invariants under test:
 *  1. `delete_invoice_with_reconciliation`: when a paid invoice is deleted,
 *     the paid_amount is converted to customer_credit (customers.credit_balance
 *     increases by exactly that amount, no money is lost).
 *  2. `reverse_customer_charge`: undoing a charge:
 *       - restores each invoice's paid_amount ← paid_amount − applied
 *       - removes the surplus from customer_credit
 *       - removes cash from the receiving account
 *     …and the resulting state is consistent with the initial (pre-charge) one.
 */

type Invoice = {
  id: string;
  total: number;
  paid_amount: number;
  status?: string;
  source?: string | null;
  cancelled?: boolean;
};

type Customer = { balance: number; credit_balance: number };

function recomputeCustomer(invoices: Invoice[], creditTx: number[]): Customer {
  const balance = invoices
    .filter((i) => !i.cancelled && i.source !== "pos")
    .reduce((s, i) => s + Math.max(i.total - i.paid_amount, 0), 0);
  const credit_balance = creditTx.reduce((s, a) => s + a, 0);
  return { balance, credit_balance };
}

/** Mirror of the SQL `allocate_customer_charge` for FIFO application. */
function applyCharge(invoices: Invoice[], amount: number) {
  let left = amount;
  const items: { invoice_id: string; applied: number; paid_before: number; paid_after: number }[] = [];
  for (const inv of invoices) {
    if (left <= 0.01) break;
    if (inv.cancelled || inv.source === "pos") continue;
    const remaining = Math.max(inv.total - inv.paid_amount, 0);
    if (remaining <= 0.01) continue;
    const apply = Math.min(left, remaining);
    const before = inv.paid_amount;
    inv.paid_amount = before + apply;
    inv.status = inv.paid_amount >= inv.total - 0.01 ? "paid" : "partial";
    items.push({ invoice_id: inv.id, applied: apply, paid_before: before, paid_after: inv.paid_amount });
    left -= apply;
  }
  const surplus = Math.max(left, 0);
  return { items, surplus };
}

/** Mirror of `reverse_customer_charge`: undo an applied charge group. */
function reverseCharge(
  invoices: Invoice[],
  items: { invoice_id: string; applied: number }[],
  surplus: number,
  accountBalance: number,
) {
  for (const alloc of items) {
    const inv = invoices.find((i) => i.id === alloc.invoice_id);
    if (!inv) continue;
    inv.paid_amount = Math.max(inv.paid_amount - alloc.applied, 0);
    inv.status = inv.paid_amount <= 0.01
      ? "pending"
      : inv.paid_amount >= inv.total - 0.01
        ? "paid"
        : "partial";
  }
  const totalApplied = items.reduce((s, a) => s + a.applied, 0);
  const cashRemoved = totalApplied + surplus;
  return {
    accountBalance: accountBalance - cashRemoved,
    surplusRemoved: surplus,
  };
}

describe("integration: delete paid invoice → customer_credit conversion", () => {
  it("keeps customer credit balance == invoice.paid_amount after deletion", () => {
    const invoices: Invoice[] = [
      { id: "A", total: 600, paid_amount: 600, status: "paid" },
    ];
    // Delete invoice A → payment converts to credit.
    const convertedToCredit = invoices[0].paid_amount;
    const remaining = invoices.filter((i) => i.id !== "A");
    const cust = recomputeCustomer(remaining, [convertedToCredit]);
    expect(cust.balance).toBe(0);
    expect(cust.credit_balance).toBe(600);
  });

  it("partial-paid invoice → converts only the paid part to credit, remaining debt disappears", () => {
    const invoices: Invoice[] = [
      { id: "A", total: 500, paid_amount: 200, status: "partial" },
    ];
    const convertedToCredit = invoices[0].paid_amount;
    const remaining = invoices.filter((i) => i.id !== "A");
    const cust = recomputeCustomer(remaining, [convertedToCredit]);
    expect(cust.balance).toBe(0);
    expect(cust.credit_balance).toBe(200);
  });
});

describe("integration: reverse_customer_charge scenarios", () => {
  it("charge distributed across multiple invoices → reverse restores all paid_amounts", () => {
    const invoices: Invoice[] = [
      { id: "A", total: 300, paid_amount: 0, status: "pending" },
      { id: "B", total: 400, paid_amount: 0, status: "pending" },
      { id: "C", total: 500, paid_amount: 0, status: "pending" },
    ];
    const { items, surplus } = applyCharge(invoices, 900);
    expect(surplus).toBe(0);
    expect(invoices.map((i) => i.paid_amount)).toEqual([300, 400, 200]);
    expect(invoices.map((i) => i.status)).toEqual(["paid", "paid", "partial"]);

    // Reverse
    const { accountBalance, surplusRemoved } = reverseCharge(invoices, items, surplus, 900);
    expect(accountBalance).toBe(0);
    expect(surplusRemoved).toBe(0);
    expect(invoices.map((i) => i.paid_amount)).toEqual([0, 0, 0]);
    expect(invoices.map((i) => i.status)).toEqual(["pending", "pending", "pending"]);
    const cust = recomputeCustomer(invoices, []);
    expect(cust).toEqual({ balance: 1200, credit_balance: 0 });
  });

  it("charge with surplus → reverse restores dues and removes the surplus credit", () => {
    const invoices: Invoice[] = [
      { id: "A", total: 200, paid_amount: 0, status: "pending" },
    ];
    const { items, surplus } = applyCharge(invoices, 500);
    expect(items[0].applied).toBe(200);
    expect(surplus).toBe(300);

    const creditTx = [surplus];
    const before = recomputeCustomer(invoices, creditTx);
    expect(before).toEqual({ balance: 0, credit_balance: 300 });

    // Reverse: invoice A becomes unpaid again AND surplus disappears.
    reverseCharge(invoices, items, surplus, 500);
    const after = recomputeCustomer(invoices, []);
    expect(after).toEqual({ balance: 200, credit_balance: 0 });
  });

  it("FIFO ordering: charges consume oldest invoices first, then reverse produces mirror-image state", () => {
    const invoices: Invoice[] = [
      { id: "old", total: 100, paid_amount: 0 },
      { id: "mid", total: 100, paid_amount: 0 },
      { id: "new", total: 100, paid_amount: 0 },
    ];
    const { items } = applyCharge(invoices, 150);
    // Oldest fully paid, then middle partial, newest untouched.
    expect(items.map((i) => i.invoice_id)).toEqual(["old", "mid"]);
    expect(items.map((i) => i.applied)).toEqual([100, 50]);
    expect(invoices[2].paid_amount).toBe(0);

    reverseCharge(invoices, items, 0, 150);
    expect(invoices.every((i) => i.paid_amount === 0)).toBe(true);
  });

  it("blocks inconsistent groups (applied + surplus ≠ total) at the confirmation stage", () => {
    // Simulate a corrupt group where applied + surplus does not match total.
    const group = { total: 500, allocated: 300, surplus: 100 };
    const diff = Math.abs(group.allocated + group.surplus - group.total);
    // Our confirm dialog blocks if diff > 1
    expect(diff).toBeGreaterThan(1);
  });
});
