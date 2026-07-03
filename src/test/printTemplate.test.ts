import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";

/**
 * Sentinels — unique substrings each section emits.
 * If the section is rendered, the sentinel appears in the HTML.
 */
const S = {
  header: 'class="header"',                   // company header block
  itemsTable: ">اسم الصنف<",                  // items <thead>
  prices: ">السعر<",                          // price column header (full only)
  grandTotalRow: 'class="total-row"',         // grand total row in items table
  accountBoxes: ">المبلغ المدفوع<",            // summary boxes
  finalRequired: ">المطلوب النهائي<",
  packaging: ">تفاصيل التغليف<",
  transport: ">معلومات الترحيل<",
  docTitle: 'class="doc-title"',              // always present
};

const baseData = {
  type: "invoice" as const,
  number: "INV-001",
  date: "2026-04-22",
  customer: { name: "أحمد", phone: "0900000000" },
  items: [
    { product_name: "صنف ١", quantity: 2, unit_price: 100, tax_amount: 0, discount: 0, total: 200 },
    { product_name: "صنف ٢", quantity: 1, unit_price: 50,  tax_amount: 0, discount: 0, total: 50  },
  ],
  subtotal: 250,
  taxTotal: 0,
  discountTotal: 0,
  grandTotal: 250,
  oldBalance: 100,
  company: { company_name: "شركة الاختبار", phone: "123" },
};

type Variant = "full" | "no-account" | "account-only" | "no-details";

interface Expectation {
  variant: Variant;
  noHeader: boolean;
  expect: {
    header: boolean;
    items: boolean;
    prices: boolean;       // price/total columns + grand-total row
    account: boolean;      // old balance + final required boxes
    extras: boolean;       // packaging + transport
  };
}

const matrix: Expectation[] = [
  // — with header —
  { variant: "full",         noHeader: false, expect: { header: true,  items: true,  prices: true,  account: true,  extras: true  } },
  { variant: "no-account",   noHeader: false, expect: { header: true,  items: true,  prices: false, account: false, extras: true  } },
  { variant: "account-only", noHeader: false, expect: { header: true,  items: false, prices: false, account: true,  extras: false } },
  { variant: "no-details",   noHeader: false, expect: { header: true,  items: false, prices: false, account: false, extras: false } },
  // — without header (mirror) —
  { variant: "full",         noHeader: true,  expect: { header: false, items: true,  prices: true,  account: true,  extras: true  } },
  { variant: "no-account",   noHeader: true,  expect: { header: false, items: true,  prices: false, account: false, extras: true  } },
  { variant: "account-only", noHeader: true,  expect: { header: false, items: false, prices: false, account: true,  extras: false } },
  { variant: "no-details",   noHeader: true,  expect: { header: false, items: false, prices: false, account: false, extras: false } },
];

describe("printTemplate — variant × noHeader matrix", () => {
  for (const row of matrix) {
    const tag = `${row.variant} | noHeader=${row.noHeader}`;

    it(`${tag} → renders correct sections`, () => {
      const html = generatePrintHTML({ ...baseData, variant: row.variant, noHeader: row.noHeader });

      // Doc title is always rendered (sanity check)
      expect(html).toContain(S.docTitle);

      // Header
      expect(html.includes(S.header)).toBe(row.expect.header);

      // Items table presence
      expect(html.includes(S.itemsTable)).toBe(row.expect.items);

      // Price columns + grand-total row (only in "full" items table)
      expect(html.includes(S.prices)).toBe(row.expect.prices);
      expect(html.includes(S.grandTotalRow)).toBe(row.expect.prices);

      // Account summary boxes
      expect(html.includes(S.accountBoxes)).toBe(row.expect.account);
      expect(html.includes(S.finalRequired)).toBe(row.expect.account);

      // Packaging + transport
      expect(html.includes(S.packaging)).toBe(row.expect.extras);
      expect(html.includes(S.transport)).toBe(row.expect.extras);
    });
  }
});

describe("printTemplate — no-account items table is reduced", () => {
  it("shows only #/name/qty columns and hides prices + grand-total row", () => {
    const html = generatePrintHTML({ ...baseData, variant: "no-account" });
    expect(html).toContain(">اسم الصنف<");
    expect(html).toContain(">الكمية<");
    expect(html).not.toContain(">السعر<");
    expect(html).not.toContain(">الإجمالي<");
    expect(html).not.toContain('class="total-row"');
  });
});

describe("printTemplate — noHeader is independent of variant", () => {
  it("noHeader=true hides header even when variant=full", () => {
    const html = generatePrintHTML({ ...baseData, variant: "full", noHeader: true });
    expect(html).not.toContain(S.header);
  });
  it("noHeader=false (default) shows header for every variant", () => {
    for (const v of ["full", "no-account", "account-only", "no-details"] as Variant[]) {
      const html = generatePrintHTML({ ...baseData, variant: v });
      expect(html, `variant=${v}`).toContain(S.header);
    }
  });
});
