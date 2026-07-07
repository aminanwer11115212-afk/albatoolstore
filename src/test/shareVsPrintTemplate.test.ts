// Contract test: ensures printTemplate.ts and the customer share-link template
// keep identical semantics for the account-summary block.
//
// Both templates render two boxes:
//   [data-section="paid-amount"]  → المبلغ المدفوع (paidAmount)
//   [data-section="final-total"]  → المطلوب النهائي = max(0, grandTotal - paidAmount)
//
// The Deno counterpart lives at supabase/functions/document-share/index_test.ts
// and asserts the exact same math + markers on the share-link HTML — so any
// future drift between the two templates fails CI on one side or the other.
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
// The share-link template is a pure module — safe to import from Node/Vitest.
import { buildDocHTML } from "../../supabase/functions/document-share/template";

const base = {
  type: "invoice" as const,
  number: "INV-001",
  date: "2026-07-07",
  customer: { name: "أحمد علي", phone: "0100", address: "شارع 1" },
  items: [
    { product_name: "منتج 1", quantity: 2, unit_price: 100, tax_amount: 0, discount: 0, total: 200 },
    { product_name: "منتج 2", quantity: 1, unit_price: 800, tax_amount: 0, discount: 0, total: 800 },
  ],
  subtotal: 1000,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 1000,
  company: { company_name: "شركة" },
};

const shareBase = {
  docTitle: "فاتورة مبيعات",
  docNumber: "INV-001",
  date: "2026-07-07",
  customer: { name: "أحمد علي", phone: "0100", address: "شارع 1" },
  items: [
    { product_name: "منتج 1", quantity: 2, unit_price: 100, total: 200 },
    { product_name: "منتج 2", quantity: 1, unit_price: 800, total: 800 },
  ],
  grandTotal: 1000,
  company: { company_name: "شركة" },
};

function pickBox(html: string, section: "paid-amount" | "final-total"): number {
  const re = new RegExp(
    `data-section="${section}"[\\s\\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)<`,
  );
  const m = html.match(re);
  if (!m) throw new Error(`missing box: ${section}`);
  return Number(m[1].replace(/,/g, ""));
}

describe("printTemplate account-summary contract (must stay in sync with share-link)", () => {
  it("partial payment: paid + remaining = grandTotal", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 300 });
    const paid = pickBox(html, "paid-amount");
    const remaining = pickBox(html, "final-total");
    expect(paid).toBe(300);
    expect(remaining).toBe(700);
    expect(paid + remaining).toBe(base.grandTotal);
  });

  it("no payment: remaining = grandTotal", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 0 });
    expect(pickBox(html, "paid-amount")).toBe(0);
    expect(pickBox(html, "final-total")).toBe(base.grandTotal);
  });

  it("fully paid: remaining = 0", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 1000 });
    expect(pickBox(html, "final-total")).toBe(0);
  });

  it("overpayment: remaining is clamped to 0 (never negative)", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 1500 });
    expect(pickBox(html, "final-total")).toBe(0);
  });

  it("exposes lov-doc-label / lov-doc-number / lov-customer-name meta for unified PDF naming", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 0 });
    expect(html).toContain('<meta name="lov-doc-label"');
    expect(html).toContain('content="فاتورة مبيعات"');
    expect(html).toContain('<meta name="lov-doc-number" content="INV-001">');
    expect(html).toContain('<meta name="lov-customer-name" content="أحمد علي">');
  });

  it("renders the shared account-summary section markers", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 250 });
    expect(html).toContain('data-section="account-summary"');
    expect(html).toContain('data-section="paid-amount"');
    expect(html).toContain('data-section="final-total"');
  });
});

// ---------------------------------------------------------------------------
// Cross-template equivalence: the print template and the share template must
// display the SAME numbers for the same input (paid + final boxes).
// ---------------------------------------------------------------------------
describe("share vs print: equivalent numeric output", () => {
  const cases: Array<{ label: string; grandTotal: number; paidAmount: number }> = [
    { label: "clean integers",              grandTotal: 1000,          paidAmount: 300 },
    { label: "0.1 + 0.2 float precision",   grandTotal: 0.1 + 0.2,     paidAmount: 0.1 },
    { label: "cents precision partial",     grandTotal: 123.45,        paidAmount: 67.89 },
    { label: "large amount",                grandTotal: 12_345_678_901.5, paidAmount: 1_234_567.25 },
    { label: "overpayment clamped",         grandTotal: 500,           paidAmount: 999 },
    { label: "zero total",                  grandTotal: 0,             paidAmount: 0 },
    { label: "many partial sum drift",      grandTotal: 1000,          paidAmount: [123.45, 67.89, 200.11, 8.55].reduce((s, x) => s + x, 0) },
  ];

  for (const c of cases) {
    it(`${c.label}: share and print show identical paid + final`, () => {
      const shareHtml = buildDocHTML({ ...shareBase, grandTotal: c.grandTotal, paidAmount: c.paidAmount });
      const printHtml = generatePrintHTML({ ...base, grandTotal: c.grandTotal, subtotal: c.grandTotal, paidAmount: c.paidAmount });
      expect(pickBox(shareHtml, "paid-amount")).toBe(pickBox(printHtml, "paid-amount"));
      expect(pickBox(shareHtml, "final-total")).toBe(pickBox(printHtml, "final-total"));
    });
  }

  it("share template: 0.1 + 0.2 doesn't leak 0.30000000000000004", () => {
    const html = buildDocHTML({ ...shareBase, grandTotal: 0.1 + 0.2, paidAmount: 0.1 });
    expect(pickBox(html, "final-total")).toBe(0.2);
  });

  it("share template: large numbers include thousands grouping", () => {
    const html = buildDocHTML({ ...shareBase, grandTotal: 12_345_678, paidAmount: 0 });
    const m = html.match(/data-section="final-total"[\s\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)</);
    expect(m).toBeTruthy();
    expect(m![1]).toContain(",");
  });

  it("share template: filename builder ingredients are inlined for e2e download check", () => {
    const html = buildDocHTML({ ...shareBase, paidAmount: 0 });
    expect(html).toContain('"فاتورة مبيعات"');
    expect(html).toContain('"أحمد علي"');
    expect(html).toContain('"INV-001"');
    // The button also exposes the computed filename as data-filename after JS runs.
    expect(html).toContain('id="__btn_pdf"');
  });
});
