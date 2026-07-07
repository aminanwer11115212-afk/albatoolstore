// Tests the customer share-link HTML template. Verifies:
//  1) Partial-payment math: paidAmount + (grandTotal - paidAmount) = grandTotal.
//  2) Section markers match the printTemplate.ts contract exactly
//     (data-section="paid-amount" / "final-total" / "account-summary").
//  3) PDF filename builder uses "<label> - <customer> - <number>.pdf" naming.
//  4) HTML head exposes lov-doc-label / lov-doc-number / lov-customer-name meta.
//
// Vitest counterpart lives at src/test/shareVsPrintTemplate.test.ts and asserts
// printTemplate.ts renders the same account-summary contract with the same math
// — so any future drift between the two templates breaks CI.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDocHTML } from "./index.ts";

const baseArgs = {
  docTitle: "فاتورة مبيعات",
  docNumber: "INV-001",
  date: "2026-07-07",
  customer: { name: "أحمد علي", phone: "0100", address: "شارع 1" },
  items: [
    { product_name: "منتج 1", quantity: 2, unit_price: 100, total: 200 },
    { product_name: "منتج 2", quantity: 1, unit_price: 800, total: 800 },
  ],
  grandTotal: 1000,
  company: { company_name: "شركة", address: "", phone: "" },
};

Deno.test("share template: paid + remaining = grandTotal (partial payment)", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 300 });
  // paid box
  const paidBox = html.match(
    /data-section="paid-amount"[\s\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)</,
  );
  assert(paidBox, "paid-amount box missing");
  // final box
  const finalBox = html.match(
    /data-section="final-total"[\s\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)</,
  );
  assert(finalBox, "final-total box missing");
  const paid = Number(paidBox![1].replace(/,/g, ""));
  const remaining = Number(finalBox![1].replace(/,/g, ""));
  assertEquals(paid, 300);
  assertEquals(remaining, 700);
  assertEquals(paid + remaining, baseArgs.grandTotal);
});

Deno.test("share template: zero payment renders 0 paid + full remaining", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  assertStringIncludes(html, 'data-section="paid-amount"');
  const finalBox = html.match(
    /data-section="final-total"[\s\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)</,
  );
  assertEquals(Number(finalBox![1].replace(/,/g, "")), baseArgs.grandTotal);
});

Deno.test("share template: fully paid → remaining = 0", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 1000 });
  const finalBox = html.match(
    /data-section="final-total"[\s\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)</,
  );
  assertEquals(Number(finalBox![1].replace(/,/g, "")), 0);
});

Deno.test("share template: overpayment clamps remaining to 0 (never negative)", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 1500 });
  const finalBox = html.match(
    /data-section="final-total"[\s\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)</,
  );
  assertEquals(Number(finalBox![1].replace(/,/g, "")), 0);
});

Deno.test("share template: exposes meta tags for PDF naming", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  assertStringIncludes(html, '<meta name="lov-doc-label" content="فاتورة مبيعات">');
  assertStringIncludes(html, '<meta name="lov-doc-number" content="INV-001">');
  assertStringIncludes(html, '<meta name="lov-customer-name" content="أحمد علي">');
});

Deno.test("share template: PDF filename is 'label - customer - number.pdf'", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 0 });
  // The runtime builds the filename in-page — assert the raw ingredients are inlined.
  assertStringIncludes(html, '"فاتورة مبيعات"');
  assertStringIncludes(html, '"INV-001"');
  assertStringIncludes(html, '"أحمد علي"');
  // Naming template is present verbatim.
  assertStringIncludes(html, "__parts.join(' - ')");
});

Deno.test("share template: account-summary section markers present", () => {
  const html = buildDocHTML({ ...baseArgs, paidAmount: 250 });
  assertStringIncludes(html, 'data-section="account-summary"');
  assertStringIncludes(html, 'data-section="paid-amount"');
  assertStringIncludes(html, 'data-section="final-total"');
  assertStringIncludes(html, 'data-section-label="المبلغ المدفوع"');
  assertStringIncludes(html, 'data-section-label="المطلوب النهائي"');
});
