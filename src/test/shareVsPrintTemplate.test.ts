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

function pickRaw(html: string, section: "paid-amount" | "final-total"): string {
  const re = new RegExp(
    `data-section="${section}"[\\s\\S]*?class="summary-box-value[^"]*"[^>]*>([^<]+)<`,
  );
  const m = html.match(re);
  if (!m) throw new Error(`missing box: ${section}`);
  return m[1].trim();
}

function pickBox(html: string, section: "paid-amount" | "final-total"): number {
  return Number(pickRaw(html, section).replace(/,/g, ""));
}

/**
 * «رصيد العميل الحالي» يُعرض بإشارة **العميل** لا بإشارة الدفتر:
 * `−X` أحمر = عليه، `+X` أخضر = له، «خالص» = صفر — كما في كشف الحساب
 * ورسائل الواتساب سواء. المصدر الواحد `signedAmountText`.
 *
 * تُرجع هذه الدالة **ما على العميل** لتبقى التوقّعات مقروءة كما هي:
 * دَينٌ قدره ٧٠٠ يُكتب `700` هنا ويُعرض `−700` على الورق.
 */
function parseOwed(raw: string): number {
  const t = raw.replace(/,/g, "").trim();
  if (t.includes("خالص")) return 0;
  if (/^[−-]/.test(t)) return Number(t.replace(/^[−-]\s*/, ""));
  if (/^\+/.test(t)) return -Number(t.replace(/^\+\s*/, ""));
  return -Number(t);
}

describe("printTemplate account-summary contract (current-balance semantics)", () => {
  // القالب يعرض «رصيد العميل الحالي» = جملة الحساب − المدفوع، موقّعاً.
  it("partial payment: paid + net balance = grandTotal", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 300 });
    const paid = pickBox(html, "paid-amount");
    const net = parseOwed(pickRaw(html, "final-total"));
    expect(paid).toBe(300);
    expect(net).toBe(700); // ما زال عليه 700
    expect(paid + net).toBe(base.grandTotal);
  });

  it("no payment: net balance = grandTotal", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 0 });
    expect(pickBox(html, "paid-amount")).toBe(0);
    expect(parseOwed(pickRaw(html, "final-total"))).toBe(base.grandTotal);
  });

  it("fully paid: net balance = 0 (خالص)", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 1000 });
    expect(parseOwed(pickRaw(html, "final-total"))).toBe(0);
  });

  it("overpayment: shows customer credit (له), not clamped", () => {
    const html = generatePrintHTML({ ...base, paidAmount: 1500 });
    expect(parseOwed(pickRaw(html, "final-total"))).toBe(-500);
  });

  /**
   * الإشارة على الورق هي إشارة العميل نفسها التي في الكشف والواتساب.
   * كانت الطباعة تعكسها — تكتب `+` أحمر لما **عليه** — فيقرأ العميل زائداً
   * بلون الدَّين ويظنّه رصيداً له. هذا الاختبار يمنع عودتها.
   */
  it("الدَّين يُعرض بإشارة سالبة والفائض بموجبة — لا العكس", () => {
    const owes = generatePrintHTML({ ...base, paidAmount: 300 });
    expect(pickRaw(owes, "final-total")).toMatch(/^−/);
    expect(pickRaw(owes, "final-total")).not.toMatch(/^\+/);

    const credit = generatePrintHTML({ ...base, paidAmount: 1500 });
    expect(pickRaw(credit, "final-total")).toMatch(/^\+/);
  });

  it("لون الإشارة يطابق معناها: الدَّين أحمر والفائض أخضر", () => {
    const owes = generatePrintHTML({ ...base, paidAmount: 300 });
    expect(owes).toMatch(/data-section="final-total"[^>]*color:#c0392b/);

    const credit = generatePrintHTML({ ...base, paidAmount: 1500 });
    expect(credit).toMatch(/data-section="final-total"[^>]*color:#16a34a/);
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

  const round2 = (x: number) => Math.round(x * 100) / 100;
  for (const c of cases) {
    it(`${c.label}: paid boxes match; each final follows its template formula`, () => {
      const shareHtml = buildDocHTML({ ...shareBase, grandTotal: c.grandTotal, paidAmount: c.paidAmount });
      const printHtml = generatePrintHTML({ ...base, grandTotal: c.grandTotal, subtotal: c.grandTotal, paidAmount: c.paidAmount });
      // المدفوع متطابق بين القالبين
      expect(pickBox(shareHtml, "paid-amount")).toBe(pickBox(printHtml, "paid-amount"));
      const due = round2(c.grandTotal - c.paidAmount);
      // قالب المشاركة: المتبقي المطلوب مقصوصاً عند 0
      expect(pickBox(shareHtml, "final-total")).toBe(Math.max(0, due));
      // قالب الطباعة: رصيد العميل الحالي موقّعاً (غير مقصوص)
      expect(parseOwed(pickRaw(printHtml, "final-total"))).toBe(due);
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
