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
// تطابق القالبين: رابط العميل يعرض **نفس** ما تعرضه الطباعة والمعاينة.
//
// كان القالبان يختلفان عمداً: الطباعة تعرض «رصيد العميل الحالي» موقّعاً، ورابط
// العميل يعرض «المطلوب النهائي» مقصوصاً عند الصفر. فمن دفع أكثر من فاتورته
// يقرأ في رابطه «0» ولا يرى رصيده، ومن عليه حسابٌ قديم لا يراه أصلاً — ورقتان
// لمستندٍ واحد. صار القالبان يعطيان الرقم نفسه بالإشارة نفسها.
// ---------------------------------------------------------------------------
describe("share vs print: نفس الأرقام ونفس الإشارة", () => {
  const cases: Array<{ label: string; grandTotal: number; paidAmount: number }> = [
    { label: "clean integers",              grandTotal: 1000,          paidAmount: 300 },
    { label: "0.1 + 0.2 float precision",   grandTotal: 0.1 + 0.2,     paidAmount: 0.1 },
    { label: "cents precision partial",     grandTotal: 123.45,        paidAmount: 67.89 },
    { label: "large amount",                grandTotal: 12_345_678_901.5, paidAmount: 1_234_567.25 },
    { label: "overpayment",                 grandTotal: 500,           paidAmount: 999 },
    { label: "zero total",                  grandTotal: 0,             paidAmount: 0 },
    { label: "many partial sum drift",      grandTotal: 1000,          paidAmount: [123.45, 67.89, 200.11, 8.55].reduce((s, x) => s + x, 0) },
  ];

  const round2 = (x: number) => Math.round(x * 100) / 100;
  for (const c of cases) {
    it(`${c.label}: القالبان يعطيان نفس المدفوع ونفس الرصيد`, () => {
      const shareHtml = buildDocHTML({ ...shareBase, grandTotal: c.grandTotal, subtotal: c.grandTotal, paidAmount: c.paidAmount });
      const printHtml = generatePrintHTML({ ...base, grandTotal: c.grandTotal, subtotal: c.grandTotal, paidAmount: c.paidAmount });
      expect(pickBox(shareHtml, "paid-amount")).toBe(pickBox(printHtml, "paid-amount"));
      // نفس النصّ حرفياً — لا مجرّد نفس القيمة
      expect(pickRaw(shareHtml, "final-total")).toBe(pickRaw(printHtml, "final-total"));
      expect(parseOwed(pickRaw(shareHtml, "final-total"))).toBe(round2(c.grandTotal - c.paidAmount));
    });
  }

  it("الفائض يُعرض رصيداً للعميل — لا يُقصّ عند الصفر كما كان", () => {
    const html = buildDocHTML({ ...shareBase, grandTotal: 500, paidAmount: 999 });
    expect(pickRaw(html, "final-total")).toMatch(/^\+/);
    expect(parseOwed(pickRaw(html, "final-total"))).toBe(-499);
  });

  it("الحساب القديم يظهر في رابط العميل كما في الطباعة", () => {
    const shareHtml = buildDocHTML({ ...shareBase, paidAmount: 0, previousDebt: 700 });
    const printHtml = generatePrintHTML({ ...base, paidAmount: 0, previousDebt: 700 });
    for (const html of [shareHtml, printHtml]) {
      expect(html).toContain("الحساب القديم");
      expect(html).toContain("جملة الحساب");
    }
    expect(pickRaw(shareHtml, "final-total")).toBe(pickRaw(printHtml, "final-total"));
  });

  it("عرض السعر لا يدخل حساب العميل في رابطه أيضاً", () => {
    const html = buildDocHTML({ ...shareBase, docTitle: "عرض سعر", isQuote: true, previousDebt: 300 });
    expect(html).toContain("إجمالي عرض السعر");
    expect(html).not.toContain("جملة الحساب");
    expect(html).not.toContain("المدفوع");
  });

  it("share template: 0.1 + 0.2 لا يُسرّب 0.30000000000000004", () => {
    const html = buildDocHTML({ ...shareBase, grandTotal: 0.1 + 0.2, paidAmount: 0.1 });
    expect(parseOwed(pickRaw(html, "final-total"))).toBe(0.2);
  });

  it("share template: large numbers include thousands grouping", () => {
    const html = buildDocHTML({ ...shareBase, grandTotal: 12_345_678, paidAmount: 0 });
    expect(pickRaw(html, "final-total")).toContain(",");
  });

  it("share template: filename builder ingredients are inlined for e2e download check", () => {
    const html = buildDocHTML({ ...shareBase, paidAmount: 0 });
    expect(html).toContain('"فاتورة مبيعات"');
    expect(html).toContain('"أحمد علي"');
    expect(html).toContain('"INV-001"');
    expect(html).toContain('id="__btn_pdf"');
  });
});

/**
 * بنية الورقة نفسها في القالبين — لا الأرقام وحدها.
 * «يطابق المعاينة والطباعة بكل شيء»: نفس الأقسام، ونفس أعمدة الجدول،
 * ونفس الصناديق والتواقيع، ونفس أدوات التكبير/التصغير.
 */
describe("share vs print: نفس بنية الورقة", () => {
  const shareHtml = buildDocHTML({ ...shareBase, paidAmount: 300 });
  const printHtml = generatePrintHTML({ ...base, paidAmount: 300 });

  const SECTIONS = [
    "header", "items", "grand-total", "account-summary",
    "invoice-value", "majmoo-row", "paid-amount", "final-total",
    "packaging", "transport", "signatures",
  ];

  it.each(SECTIONS)("القسم %s موجود في القالبين", (key) => {
    expect(shareHtml).toContain(`data-section="${key}"`);
    expect(printHtml).toContain(`data-section="${key}"`);
  });

  it("نفس أعمدة جدول البنود", () => {
    for (const th of ["اسم الصنف", "الكمية", "السعر", "الإجمالي"]) {
      expect(shareHtml).toContain(th);
      expect(printHtml).toContain(th);
    }
  });

  it("نفس التواقيع", () => {
    for (const html of [shareHtml, printHtml]) {
      expect(html).toContain("توقيع المستلم");
      expect(html).toContain("توقيع المسؤول");
    }
  });

  it("نفس صندوقَي التغليف والترحيل", () => {
    for (const html of [shareHtml, printHtml]) {
      expect(html).toContain("تفاصيل التغليف");
      expect(html).toContain("معلومات الترحيل");
    }
  });

  it("رابط العميل فيه تكبير وتصغير — الوظيفة التي طُلب تطابقها", () => {
    expect(shareHtml).toContain('id="__zoom_in"');
    expect(shareHtml).toContain('id="__zoom_out"');
    expect(shareHtml).toContain('id="__zoom_reset"');
    expect(shareHtml).toContain('id="__btn_print"');
  });

  it("إخفاء قسم من المعاينة يُخفيه في رابط العميل", () => {
    const html = buildDocHTML({ ...shareBase, hiddenSections: ["signatures", "transport"] });
    expect(html).not.toContain("توقيع المستلم");
    expect(html).not.toContain("معلومات الترحيل");
    expect(html).toContain("تفاصيل التغليف");
  });

  it("تفاصيل التغليف والترحيل تُعرض حين تُمرَّر", () => {
    const html = buildDocHTML({
      ...shareBase,
      packagingInfo: "النوع: كرتونة | الكمية: 10",
      transportInfo: "الاسم: مرحّل | الهاتف: 0912",
    });
    expect(html).toContain("النوع: كرتونة");
    expect(html).toContain("الاسم: مرحّل");
  });
});
