import { describe, it, expect } from "vitest";
import { computeInvoiceStatusAfterPayment } from "@/utils/invoiceStatus";

/**
 * محاكاة منطق trigger trg_invoice_recompute_status على مستوى TypeScript
 * لضمان أن أي تغيير في paid_amount / total / discount ينتج status صحيح.
 */
function simulateTrigger(row: {
  total: number;
  paid_amount: number;
  status?: string;
  due_date?: string | null;
}): string {
  if (row.status === "cancelled") return "cancelled";
  return computeInvoiceStatusAfterPayment({
    total: row.total,
    paidAfter: row.paid_amount,
    dueDate: row.due_date ?? null,
  });
}

describe("trg_invoice_recompute_status — parity", () => {
  it("paid_amount == total ⇒ paid", () => {
    expect(simulateTrigger({ total: 500, paid_amount: 500 })).toBe("paid");
  });
  it("paid_amount جزئي ⇒ partial", () => {
    expect(simulateTrigger({ total: 500, paid_amount: 200 })).toBe("partial");
  });
  it("paid_amount = 0 ودون due_date ⇒ pending", () => {
    expect(simulateTrigger({ total: 500, paid_amount: 0 })).toBe("pending");
  });
  it("due_date سابق و متبقي > 0 ⇒ overdue", () => {
    expect(
      simulateTrigger({ total: 500, paid_amount: 0, due_date: "2000-01-01" }),
    ).toBe("overdue");
  });
  it("cancelled لا يتغيّر أبدًا", () => {
    expect(
      simulateTrigger({ total: 500, paid_amount: 500, status: "cancelled" }),
    ).toBe("cancelled");
  });
  it("خصم يقلّل total → paid_amount يصبح كافيًا ⇒ paid", () => {
    // قبل الخصم: total=1000 paid=800 → partial
    expect(simulateTrigger({ total: 1000, paid_amount: 800 })).toBe("partial");
    // بعد خصم 200: total=800 paid=800 → paid
    expect(simulateTrigger({ total: 800, paid_amount: 800 })).toBe("paid");
  });
});
