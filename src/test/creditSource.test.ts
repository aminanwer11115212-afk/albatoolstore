import { describe, it, expect } from "vitest";
import { classifyCreditRow, CREDIT_SOURCE_OPTIONS } from "@/utils/creditSource";

describe("classifyCreditRow", () => {
  it("classifies overpay from invoice", () => {
    const info = classifyCreditRow({
      amount: 1000,
      description: "فائض دفعة من الفاتورة INV-123 — رصيد دائن",
    });
    expect(info.source).toBe("overpay_invoice");
    expect(info.linkedInvoice).toBe("INV-123");
  });

  it("classifies manual charge (allocate_customer_charge surplus)", () => {
    const info = classifyCreditRow({
      amount: 500,
      description: "شحن رصيد عميل - رصيد فائض",
      allocation: { kind: "surplus" },
    });
    expect(info.source).toBe("manual_charge");
  });

  it("classifies credit consumption (negative amount)", () => {
    const info = classifyCreditRow({
      amount: -300,
      description: "استخدام رصيد دائن على الفاتورة INV-9",
      allocation: { kind: "credit_used", invoice_number: "INV-9" },
    });
    expect(info.source).toBe("credit_used");
    expect(info.linkedInvoice).toBe("INV-9");
  });

  it("returns unknown when nothing matches", () => {
    const info = classifyCreditRow({ amount: 100, description: "" });
    expect(info.source).toBe("unknown");
  });

  it("exposes all options for the filter UI", () => {
    const values = CREDIT_SOURCE_OPTIONS.map((o) => o.value);
    expect(values).toContain("overpay_invoice");
    expect(values).toContain("manual_charge");
    expect(values).toContain("credit_used");
  });
});
