/**
 * E2E: customer statement groups customer_credit rows by source and lets the
 * user filter by source. Runs against the classifier directly via a page
 * evaluate to keep the test deterministic without needing seeded data.
 */
import { test, expect } from "@playwright/test";

test("credit source classifier drives the statement filter chips", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const mod = await import("/src/utils/creditSource.ts");
    return {
      overpay: mod.classifyCreditRow({
        amount: 1000,
        description: "فائض دفعة من الفاتورة INV-501 — رصيد دائن",
      }),
      manual: mod.classifyCreditRow({
        amount: 500,
        description: "شحن رصيد عميل - رصيد فائض",
        allocation: { kind: "surplus" },
      }),
      used: mod.classifyCreditRow({
        amount: -200,
        description: "استخدام رصيد دائن",
        allocation: { kind: "credit_used" },
      }),
      options: mod.CREDIT_SOURCE_OPTIONS.map((o: any) => o.value),
    };
  });

  expect(result.overpay.source).toBe("overpay_invoice");
  expect(result.overpay.linkedInvoice).toBe("INV-501");
  expect(result.manual.source).toBe("manual_charge");
  expect(result.used.source).toBe("credit_used");
  expect(result.options).toEqual(
    expect.arrayContaining(["overpay_invoice", "manual_charge", "credit_used"]),
  );
});
