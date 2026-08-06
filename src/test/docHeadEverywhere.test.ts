/**
 * شريطُ الترويسة واحدٌ في كل مخرج: إنشاءً ومعاينةً وطباعةً وتعديلاً وPDF.
 *
 * ## ما طلبه صاحب المستودع
 * أرسل الشكلَ مصوَّراً — اسمُ العميل يميناً، و«فاتورة مبيعات» وسطاً، والتاريخُ
 * ورقمُ الفاتورة يساراً — ثمّ: «تحقّق من هذا الشكل في جميع مكان إنشاء ومعاينة
 * وطباعة وتعديل وPDF».
 *
 * ## ولماذا يقبل الاختلافُ أن يقع
 * المخارجُ تُبنى في ثمانية ملفّات: شاشةُ الفاتورة، وشاشةُ عرض السعر، وشاشةُ
 * المشتريات، وصفحةُ المعاينة، وصفحةُ عرض الفاتورة، وصفحةُ المشتريات، والطباعةُ
 * المباشرة، وورقةُ العميل. فيكفي أن يبني أحدُها ترويستَه بنفسه ليفترق — وقد
 * وقع من قبلُ في مربّع الحساب وفي كتلة التغليف.
 *
 * ## والحارس بنيويّ لا تعاقديّ
 * لا يسأل «هل الشكلان متشابهان» بل يقطع المسار: يبني كلَّ مخرجٍ بدخله الحقيقي،
 * ثمّ يطابق **شريط الترويسة نفسه** فيها جميعاً. فأيُّ مخرجٍ يكتب ترويستَه بيده
 * يسقط هنا.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildSharedDocumentHTML } from "@/utils/sharedDocumentHtml";

const ITEMS = Array.from({ length: 6 }, (_, i) => ({
  product_name: `صنف ${i + 1}`, quantity: 2, unit_price: 5000,
  tax_amount: 0, discount: 0, total: 10000,
}));

const BASE = {
  number: "INV-89170", date: "2026-08-06",
  customer: { name: "امين انور" },
  items: ITEMS, subtotal: 60000, taxTotal: 0, discountTotal: 0, grandTotal: 60000,
  company: null,
};

/**
 * كلُّ مخرجٍ ودخلُه كما يبنيه في الإنتاج.
 *
 * المعاينةُ والطباعةُ وزرُّ الـPDF في شاشات الإنشاء والتعديل كلُّها تستدعي
 * `generatePrintHTML` بنفس الوسائط — فالتمييزُ بينها في **نوع المستند
 * وصيغته** لا في مُنتِج الورقة. وورقةُ العميل وحدها تمرّ بمحوِّلٍ من حمولة
 * القاعدة، فهي الأبعدُ عن المصدر وأولاها بالفحص.
 */
const OUTPUTS: Array<[string, () => string]> = [
  ["فاتورة — إنشاء/تعديل/معاينة/طباعة/PDF", () => generatePrintHTML({ ...BASE, type: "invoice" } as any)],
  ["فاتورة كاش", () => generatePrintHTML({ ...BASE, type: "invoice", isCash: true, customer: null } as any)],
  ["فاتورة بحساب العميل", () => generatePrintHTML({ ...BASE, type: "invoice", previousDebt: 25600, paidAmount: 40000 } as any)],
  ["عرض سعر", () => generatePrintHTML({ ...BASE, type: "quote", number: "QT-4412" } as any)],
  ["عرض سعر جانبي", () => generatePrintHTML({ ...BASE, type: "quote", number: "QT-S-1", variant: "full" } as any)],
  ["أمر شراء", () => generatePrintHTML({ ...BASE, type: "purchase", number: "PO-1" } as any)],
  ["مرتجع", () => generatePrintHTML({ ...BASE, type: "return", number: "RET-1" } as any)],
  ["كشف جرد", () => generatePrintHTML({ ...BASE, type: "invoice", variant: "stocktake" } as any)],
  ["منتجات بلا أسعار", () => generatePrintHTML({ ...BASE, type: "invoice", variant: "no-account" } as any)],
  ["بلا ترويسة الشركة", () => generatePrintHTML({ ...BASE, type: "invoice", noHeader: true } as any)],
  ["رابط العميل — فاتورة", () => buildSharedDocumentHTML({
    doc_type: "invoice",
    doc: { invoice_number: "INV-89170", date: "2026-08-06", total: 60000, subtotal: 60000, paid_amount: 0 },
    customer: { name: "امين انور" }, company: null,
    items: ITEMS.map((i) => ({ ...i })), packaging: [], packaging_items: [], transports: [],
  } as any)],
  ["رابط العميل — عرض سعر", () => buildSharedDocumentHTML({
    doc_type: "quote",
    doc: { quote_number: "QT-4412", date: "2026-08-06", total: 60000, subtotal: 60000 },
    customer: { name: "امين انور" }, company: null,
    items: ITEMS.map((i) => ({ ...i })), packaging: [], packaging_items: [], transports: [],
  } as any)],
];

/** يقتطع شريطَ الترويسة من ورقةٍ مبنيّة. */
function headOf(html: string): string {
  const at = html.indexOf('<div class="doc-head">');
  expect(at, "الورقة بلا شريط ترويسة").toBeGreaterThan(-1);
  const end = html.indexOf("<!-- Items Table", at);
  return html.slice(at, end > at ? end : at + 1400);
}

const built = OUTPUTS.map(([name, build]) => [name, build()] as const);

/* ─────────── ١) الشريط في كل مخرج، وترتيبُه واحد ─────────── */

describe("شريطُ الترويسة يصل كلَّ مخرج", () => {
  it("كلُّ مخرجٍ يحمله", () => {
    for (const [name, html] of built) {
      expect(html, name).toContain('<div class="doc-head">');
    }
  });

  it("والترتيبُ فيه واحد: العميل ثمّ العنوان ثمّ التاريخ والرقم", () => {
    for (const [name, html] of built) {
      const head = headOf(html);
      const right = head.indexOf("doc-head-right");
      const title = head.indexOf('class="doc-title"');
      const left = head.indexOf("doc-head-left");
      expect(right, `${name}: جانب العميل`).toBeGreaterThan(-1);
      expect(title, `${name}: العنوان`).toBeGreaterThan(right);
      expect(left, `${name}: التاريخ والرقم`).toBeGreaterThan(title);
    }
  });

  it("واسمُ العميل في جانبه، والتاريخُ والرقم في الآخر", () => {
    for (const [name, html] of built) {
      const head = headOf(html);
      const [, rightCol, leftCol] = head.split(/doc-head-(?:right|left)/);
      expect(rightCol, `${name}: اسم العميل`).toContain("اسم العميل:");
      expect(leftCol, `${name}: التاريخ`).toContain("التاريخ:");
      expect(leftCol, `${name}: الرقم`).toContain("رقم ");
    }
  });

  it("ولا يبقى أثرٌ من السطرين القديمين", () => {
    for (const [name, html] of built) {
      expect(html, name).not.toContain('class="info-row"');
    }
  });
});

/* ─────────── ٢) والتنسيق واحدٌ لا نسخةٌ في كل ورقة ─────────── */

describe("تنسيقُ الشريط من مصدرٍ واحد", () => {
  it("قواعدُه في كل ورقة — لا ورقةَ تعرضه بلا تنسيق", () => {
    for (const [name, html] of built) {
      expect(html, `${name}: .doc-head`).toMatch(/\.doc-head \{[^}]*display: flex/);
      expect(html, `${name}: .doc-head-side`).toMatch(/\.doc-head-side \{[^}]*flex: 1 1 0/);
      expect(html, `${name}: .info-line`).toMatch(/\.info-line \{[^}]*font-size: 15px/);
    }
  });

  /**
   * الجانبان بمرونةٍ متساوية (`1 1 0`) لا بمحتواهما: بها يقع العنوانُ في
   * المنتصف الحقيقي مهما طال اسمُ العميل أو قصُر — لا في منتصفِ ما تبقّى.
   */
  it("والجانبان متساويان فيقع العنوانُ في المنتصف الحقيقي", () => {
    const shortName = generatePrintHTML({ ...BASE, type: "invoice", customer: { name: "ع" } } as any);
    const longName = generatePrintHTML({
      ...BASE, type: "invoice",
      customer: { name: "شركة أولاد جابر لإسبيرات المواتر والتكاتك المحدودة" },
    } as any);
    for (const html of [shortName, longName]) {
      expect(html).toMatch(/\.doc-head-side \{[^}]*flex: 1 1 0/);
      expect(html).toMatch(/\.doc-title \{[^}]*flex: 0 0 auto/);
    }
  });

  /**
   * ولا يُقصّ اسمٌ طويل: الورقةُ لا تُخفي شيئاً — وهو حارسُها نفسه — و
   * html2canvas يقصّ صندوقَ النصّ بحسابه هو، فظهرت الأسطرُ مقطوعةً من نصفها
   * في الملفّ الناتج حين كان القصُّ مُعلَناً.
   */
  it("ولا يُبتر اسمٌ طويل بثلاث نقاط", () => {
    for (const [name, html] of built) {
      expect(html, name).not.toMatch(/\.info-line \{[^}]*text-overflow/);
      expect(html, name).not.toMatch(/\.info-line \{[^}]*overflow: hidden/);
    }
  });
});

/* ─────────── ٣) والكثافة ترفعه ولا تحذفه ─────────── */

describe("الكثافةُ تضغط الشريط ولا تُسقطه", () => {
  const many = (n: number) => generatePrintHTML({
    ...BASE, type: "invoice",
    items: Array.from({ length: n }, (_, i) => ({
      product_name: `صنف ${i + 1}`, quantity: 1, unit_price: 1000,
      tax_amount: 0, discount: 0, total: 1000,
    })),
    subtotal: n * 1000, grandTotal: n * 1000,
  } as any);

  it("في الدرجات الثلاث: الشريطُ قائمٌ ببياناته", () => {
    for (const n of [6, 30, 80]) {
      const html = many(n);
      expect(html, `${n} بنداً`).toContain('<div class="doc-head">');
      expect(html, `${n} بنداً`).toContain("اسم العميل:");
      expect(html, `${n} بنداً`).toContain("رقم الفاتورة:");
      expect(html, `${n} بنداً`).toContain("INV-89170");
    }
  });

  it("والمقاسُ ينزل بالدرجة ولا ينزل تحت أرضية القراءة", () => {
    const sizes = [15];
    for (const d of ["d-compact", "d-dense"]) {
      const m = new RegExp(`\\.${d} \\.info-line \\{[^}]*font-size: ([\\d.]+)px`).exec(many(80));
      expect(m, `${d} .info-line`).toBeTruthy();
      sizes.push(Number(m![1]));
    }
    // متناقصةٌ بالدرجة، وأدناها فوق أرضية القراءة
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBeGreaterThan(sizes[2]);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
  });
});

/* ─────────── ٤) ولا شاشةَ تكتب ترويستَها بيدها ─────────── */

describe("لا مخرجَ يبني ترويستَه خارج القالب", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  /**
   * «قاعدة الورقة الواحدة»: تنسيقُ الورقة في `generatePrintHTML` وحدها. فمن
   * كتب `doc-head` أو `info-line` في صفحةٍ أو شاشة فقد شقَّ الشكلَ نسختين.
   */
  it("لا صفحةَ ولا شاشةَ تحمل أصنافَ الشريط", () => {
    const hosts = [
      "src/pages/DocumentPreviewPage.tsx",
      "src/pages/StandaloneShareDocument.tsx",
      "src/pages/InvoiceViewPage.tsx",
      "src/pages/QuoteViewPage.tsx",
      "src/pages/QuoteCreatePage.tsx",
      "src/pages/PurchaseCreatePage.tsx",
      "src/pages/PurchasePage.tsx",
      "src/screens/InvoiceCreateScreen.tsx",
      "src/screens/InvoicesScreen.tsx",
    ];
    for (const h of hosts) {
      const src = read(h);
      expect(src, `${h}: doc-head`).not.toContain("doc-head");
      expect(src, `${h}: info-line`).not.toContain("info-line");
    }
  });

  it("وكلُّها تبني ورقتها من القالب الواحد", () => {
    for (const h of [
      "src/pages/DocumentPreviewPage.tsx",
      "src/pages/InvoiceViewPage.tsx",
      "src/pages/QuoteCreatePage.tsx",
      "src/pages/PurchaseCreatePage.tsx",
      "src/pages/PurchasePage.tsx",
      "src/screens/InvoiceCreateScreen.tsx",
      "src/utils/printInvoiceDirect.ts",
      "src/utils/sharedDocumentHtml.ts",
    ]) {
      expect(read(h), h).toContain("generatePrintHTML");
    }
  });
});
