/**
 * ورقةٌ واحدة لكل مخرَج — والقياسُ بالتعاقب لا بوجود السطر.
 *
 * ## العطل المُعاد إنتاجه
 * قِيست مخرجاتُ الطباعة كلُّها في متصفّحٍ حقيقي (Chromium)، معاينةً وورقاً،
 * فخرج عرضُ المحتوى مختلفاً في ستّةٍ منها:
 *
 *   | المخرَج               | المعاينة | الورق  | الفرق    |
 *   |-----------------------|----------|--------|----------|
 *   | الفاتورة/عرض السعر    | 190      | 190    | مطابق    |
 *   | كشف الحساب            | 199.5    | 179.4  | −20.1mm  |
 *   | التقرير المالي        | 199.5    | 179.4  | −20.1mm  |
 *   | تقرير الترحيل         | 199.5    | 190    | −9.5mm   |
 *   | تقرير التغليف         | 199.5    | 190    | −9.5mm   |
 *   | الأصناف غير المتوفّرة | 199.5    | 190    | −9.5mm   |
 *   | كشف الترحيلات         | 208      | 196.1  | −11.9mm  |
 *
 * والعشرون مليمتراً في أوّلين منها لها سببٌ لا يُرى بالقراءة السريعة:
 *
 *     @media print { body { padding: 0; } }   ← أوّلاً
 *     body { padding: 20px; }                 ← ثمّ هذه
 *
 * قاعدتان على العنصر نفسِه بنفس الأولوية، فيفوز **الأخير**. أي أن إلغاء
 * الهامش للطباعة **مكتوبٌ ولا يعمل**: تُطبع الورقة بهامش `@page` عشرةً
 * زائداً عشرين بكسلاً من body، فيضيق المحتوى إلى 179.4mm.
 *
 * ولذلك لا يحرس هذا بحثٌ عن نصّ القاعدة — النصُّ موجود. يحرسه حسابُ الغالب
 * في التعاقب، وهو ما يفعله `measureSheet`.
 *
 * ## ما يُثبَّت
 * عرضُ المحتوى واحدٌ في المعاينة وفي الورق، ويساوي عرضَ الورقة ناقصَ
 * هامشين — 190mm طولياً و277mm عرضياً.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { measureSheet, winningDeclaration } from "./helpers/sheetGeometry";
import { A4_MM } from "@/utils/sheetPagePlan";
import { sheetContentMm } from "@/utils/sheetShellCss";
import { generatePrintHTML } from "@/utils/printTemplate";
import { generateStatementHTML } from "@/utils/statementPrintTemplate";
import { generateFinancialReportHTML } from "@/utils/financialReportPrintTemplate";
import { generateTransportReportHTML, generatePackagingReportHTML } from "@/utils/transportPackagingPrint";
import { buildUnavailableItemsPrintHTML } from "@/utils/unavailableItemsShare";
import { buildDispatchSheetHTML } from "@/utils/dispatchReportPrint";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ limit: async () => ({ data: [] }) }) }) },
}));

const company = { company_name: "شركة", phone: "0770", address: "بغداد" };
const customer = { name: "عميل" };

/* ─────────── المخرَجات، ببياناتٍ أدنى تكفي لتوليد الورقة ─────────── */

const docSheet = (type: "invoice" | "quote" | "return" | "purchase" = "invoice") =>
  generatePrintHTML({
    type,
    number: "INV-1",
    date: "2026-08-09",
    customer,
    items: [{ product_name: "صنف", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
    subtotal: 1000,
    taxTotal: 0,
    discountTotal: 0,
    grandTotal: 1000,
    company,
  } as any);

const statement = () =>
  generateStatementHTML({
    kind: "customer",
    party: { name: "عميل", balance: 1000 },
    company,
    invoices: [{ invoice_number: "INV-1", date: "2026-08-09", total: 1000, paid_amount: 0 }],
    totals: { invoicesTotal: 1000, paidTotal: 0, remaining: 1000, balance: 1000 },
  });

const financial = () =>
  generateFinancialReportHTML({
    title: "قائمة الدخل",
    company,
    sections: [
      {
        key: "income",
        label: "الإيرادات",
        columns: [{ key: "desc", label: "البيان" }, { key: "amount", label: "المبلغ", numeric: true }],
        rows: [{ desc: "مبيعات", amount: 1000 }],
      },
    ],
  });

const doc = { number: "INV-1", date: "2026-08-09", customerName: "عميل" };
const transport = () =>
  generateTransportReportHTML({ docType: "invoice", doc, company, rows: [{ transporter: "ناقل", destination: "الموصل", cost: 1000 }] });
const packaging = () =>
  generatePackagingReportHTML({ docType: "invoice", doc, company, rows: [{ type: "كارتون", product: "صنف", packs_count: 1, pieces_per_pack: 1 }] });

const unavailable = () =>
  buildUnavailableItemsPrintHTML({
    isInvoice: true,
    docId: "x",
    docNumber: "INV-1",
    customerName: "عميل",
    date: "2026-08-09",
    company,
    rows: [{ product_name: "صنف", quantity: 1, unit: "قطعة" }],
  });

const dispatch = () =>
  buildDispatchSheetHTML(
    [
      {
        invoice: { id: "1", invoice_number: "INV-1", invoice_date: "2026-08-09", customers: { name: "عميل" } },
        itemsCount: 1,
        qtyTotal: 1,
        transports: [],
        packaging: [],
      } as any,
    ],
    company
  );

/** كلُّ مخرَجٍ ورقيّ في النظام، واتجاهُ ورقته. */
const OUTPUTS: Array<{ name: string; html: () => string; landscape?: boolean }> = [
  { name: "فاتورة مبيعات", html: () => docSheet("invoice") },
  { name: "عرض سعر", html: () => docSheet("quote") },
  { name: "مرتجع", html: () => docSheet("return") },
  { name: "فاتورة شراء", html: () => docSheet("purchase") },
  { name: "كشف حساب", html: statement },
  { name: "تقرير مالي", html: financial },
  { name: "تقرير الترحيل", html: transport },
  { name: "تقرير التغليف", html: packaging },
  { name: "الأصناف غير المتوفّرة", html: unavailable },
  { name: "كشف الترحيلات", html: dispatch },
];

describe("عرضُ المحتوى واحدٌ في المعاينة وفي الورق", () => {
  it.each(OUTPUTS)("$name", ({ html, landscape }) => {
    const src = html();
    const screen = measureSheet(src, "screen");
    const print = measureSheet(src, "print");
    const expected = sheetContentMm(landscape);

    expect({
      screen: screen.contentMm,
      print: print.contentMm,
    }).toEqual({ screen: expected, print: expected });
  });

  it("والمتوقَّع 190mm — 210 ناقصَ هامشين", () => {
    expect(sheetContentMm()).toBe(A4_MM.width - 2 * A4_MM.margin);
    expect(sheetContentMm()).toBe(190);
  });
});

describe("هامشُ الورقة واحدٌ في كل مخرَج", () => {
  it.each(OUTPUTS)("$name — @page بهامش المصدر الواحد", ({ html }) => {
    expect(measureSheet(html(), "print").pageMarginMm).toBe(A4_MM.margin);
  });

  /**
   * الورقةُ على الشاشة صفحةُ A4 بعرضٍ مطلق لا عمودٌ يتبع النافذة — وإلا
   * اختلف شكلُ المعاينة عن الملفّ باختلاف حجم الشاشة وحدَه.
   */
  it.each(OUTPUTS)("$name — الورقة بعرضٍ مطلق على الشاشة", ({ html, landscape }) => {
    const screen = measureSheet(html(), "screen");
    expect(screen.pageWidthMm).toBe(landscape ? A4_MM.height : A4_MM.width);
  });

  /** وعلى الورق لا هامشَ ثانٍ فوق هامش `@page`: لا من body ولا من الورقة. */
  it.each(OUTPUTS)("$name — لا هامشَ مضاعف في الطباعة", ({ html }) => {
    const print = measureSheet(html(), "print");
    expect({ body: print.bodyPadMm, page: print.pagePadMm }).toEqual({ body: 0, page: 0 });
  });
});

/**
 * ## صفحةٌ بيضاءُ زائدة في آخر كل فاتورة
 *
 * ترقيمُ المعاينة طبقةٌ مطلقة، فيحتاج ورقةً بطولِ صفحاتها كلِّها ليضع
 * أرقامَه — ويكتب السكربتُ ذلك الطولَ **سطرياً** على العنصر:
 *
 *     page.style.minHeight = (pages * pageH + padTop * 2) + 'px';
 *
 * والقيمةُ السطرية تغلب كلَّ قاعدةٍ في التنسيق إلا المُعلَّمةَ بـ`!important`.
 * فكان الطولُ يعبر إلى الطباعة كما هو. قِيس في Chromium على فاتورةٍ محتواها
 * صفحتان: ارتفاعُ المستند 574mm على صفحةٍ 277mm ⇒ **ثلاثُ صفحات**، الثالثةُ
 * ممتلئةٌ 7% — ورقةٌ بيضاء تخرج من الطابعة مع كلّ فاتورة.
 *
 * فلا يكفي أن تُوجد قاعدةُ إلغاءٍ للطباعة: يلزم أن تكون `!important` وإلا
 * لم تُرَ أصلاً. وهذا ما يُثبَّت هنا.
 */
describe("ارتفاعُ الترقيم لا يعبر إلى الورق", () => {
  const src = docSheet();

  it("والسكربتُ فعلاً يكتب الارتفاع سطرياً — وإلا فلا موضوع للفحص", () => {
    const pagination = fs.readFileSync(path.resolve(process.cwd(), "src/utils/sheetPagination.ts"), "utf8");
    expect(pagination).toMatch(/page\.style\.minHeight\s*=/);
  });

  it("فالطباعة تُلغيه بـ!important — لا بقاعدةٍ عاديّة يغلبها السطريّ", () => {
    expect(winningDeclaration(src, "print", ".page", "min-height")).toEqual({ value: "0", important: true });
  });

  it("والمعاينةُ تحتفظ بورقةٍ بطول صفحةٍ كاملة", () => {
    expect(winningDeclaration(src, "screen", ".page", "min-height")?.value).toBe("297mm");
  });
});

/**
 * العطلُ الذي أخرج هذا الفحص: قاعدةٌ صحيحةٌ مكتوبةٌ في المكان الخطأ.
 * فيُثبَّت أن `measureSheet` يراه — وإلا كان الفحصُ كلُّه أخضرَ بلا معنى.
 */
describe("القياسُ يرى الترتيب لا النصّ", () => {
  const page = (css: string) => `<html><head><style>${css}</style></head><body><div class="page"></div></body></html>`;

  it("إلغاءُ الهامش قبلَ الهامش ⇒ لا يُلغى", () => {
    const css = `
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @media print { body { padding: 0; } }
      body { padding: 20px; }
    `;
    // 190 − (20px+20px = 10.6mm) = 179.4mm — نفسُ ما قاسه المتصفّح
    expect(measureSheet(page(css), "print").contentMm).toBe(179.4);
  });

  it("وبعدَه ⇒ يُلغى", () => {
    const css = `
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { padding: 20px; }
      @media print { body { padding: 0; } }
    `;
    expect(measureSheet(page(css), "print").contentMm).toBe(190);
  });

  it("و`!important` يغلب الترتيب", () => {
    const css = `
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @media print { body { padding: 0 !important; } }
      body { padding: 20px; }
    `;
    expect(measureSheet(page(css), "print").contentMm).toBe(190);
  });

  it("وأولويّةُ المُحدِّد تغلب الترتيب: `*` لا يهزم `body`", () => {
    const css = `
      @page { size: A4; margin: 10mm; }
      body { padding: 20px; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
    `;
    expect(measureSheet(page(css), "print").contentMm).toBe(179.4);
  });
});
