/**
 * كتلةُ التغليف واحدةٌ في كل مخرجٍ يراه العميل.
 *
 * ## ما طلبه صاحب المستودع
 * «تأكّد من أنّ رابط العميل، وتنزيل PDF للفاتورة وعرض السعر، والمشاركة،
 * والطباعة، وزرّ إرسال PDF في شاشات تعديل وإضافة الفواتير وفواتير الكاش
 * وعروض الأسعار وعروض الأسعار الجانبية — يحمل نفس الشكل الناتج».
 *
 * ## ولماذا يقبل الاختلافُ أن يقع
 * المخارجُ سبعةٌ وتُبنى في ملفّاتٍ متفرّقة، فيكفي أن يمرّر أحدها بياناتٍ بشكلٍ
 * آخر ليفترق. وقد وقع فعلاً: زرُّ «واتساب PDF» كان يُخرج ورقةً بهوامش أوسع
 * وظِلٍّ رمادي لأنه يصوّر إطارَ الشاشة (راجع `pdfSheetFrame.test.ts`).
 *
 * ## والحارس هنا بنيويّ لا تعاقديّ
 * لا يُقارن هذا الاختبار «هل النصّان متشابهان» بل يقطع المسار من مُنتِج
 * الكتلة إلى كل ورقة، ويطابق **الكتلة نفسها حرفاً بحرف**. فأيُّ مخرجٍ يبني
 * تغليفَه بنفسه — لا بـ`formatPackaging` — يسقط هنا.
 */
import { describe, it, expect } from "vitest";
import { formatPackaging, formatTransports, packagingColumns } from "@/utils/printExtras";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildSharedDocumentHTML } from "@/utils/sharedDocumentHtml";
import { pkgLines } from "./helpers/pkgLines";

const PKG_ITEMS = [
  { packaging_types: { name: "كرتونة" }, product_name: "بطارية", packs_count: 2, pieces_per_pack: 10, quantity: 1 },
  { packaging_types: { name: "ربطة" }, product_name: "لستك 16", packs_count: 2, pieces_per_pack: 10, quantity: 1 },
  { packaging_types: { name: "كيس" }, product_name: "فانوس", packs_count: 1, pieces_per_pack: 20, quantity: 1 },
  { packaging_types: { name: "جوال" }, product_name: "طبلون", packs_count: 4, pieces_per_pack: 15, quantity: 1 },
  { packaging_types: { name: "صندوق" }, product_name: "انبوبة", packs_count: 2, pieces_per_pack: 50, quantity: 1 },
];
const TRANSPORTS = [{
  transporters: { name: "شركة النقل السريع", phone: "0911223344", address: "السوق العربي" },
  destinations: { name: "بورتسودان" },
}];

/** الكتلة كما يُنتجها المصدر الواحد — مرجعُ المقارنة. */
const PKG = formatPackaging([], PKG_ITEMS)!;
const TRN = formatTransports(TRANSPORTS)!;

const ITEMS = Array.from({ length: 9 }, (_, i) => ({
  product_name: `صنف ${i + 1}`, quantity: 3, unit_price: 5000,
  tax_amount: 0, discount: 0, total: 15000,
}));

/** يقتطع كتلة التغليف من ورقةٍ مبنيّة. */
function pkgBlockOf(html: string): string {
  const at = html.indexOf("data-pkg-rows");
  expect(at, "الورقة بلا كتلة تغليف").toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const end = html.indexOf("</div>", html.indexOf("إجمالي عدد القطع", at)) + "</div>".length;
  return html.slice(start, end);
}

/* ─────────── ١) المخارج التي تبني الورقة بنفسها ─────────── */

/**
 * كلُّ مخرجٍ ودخلُه كما يبنيه في الإنتاج:
 *   • المعاينةُ والطباعةُ وزرُّ الـPDF في شاشات الإدخال كلُّها
 *     `generatePrintHTML` مباشرةً — بما فيها فواتير الكاش (`isCash`)
 *     وعروضُ السعر الجانبية (نوعها `quote` كالعادية، والجانبيّةُ وضعُ شاشةٍ
 *     لا نوعُ مستند).
 *   • ورقةُ العميل تمرّ بـ`buildSharedDocumentHTML` من حمولة القاعدة.
 */
const OUTPUTS: Array<[string, () => string]> = [
  ["فاتورة — معاينة وطباعة وإرسال PDF", () => generatePrintHTML({
    type: "invoice", number: "INV-1", date: "2026-08-06", customer: { name: "ياسين" },
    items: ITEMS, subtotal: 135000, taxTotal: 0, discountTotal: 0, grandTotal: 135000,
    company: null, packagingInfo: PKG, transportInfo: TRN,
  } as any)],

  ["فاتورة كاش", () => generatePrintHTML({
    type: "invoice", isCash: true, number: "CASH-1", date: "2026-08-06", customer: null,
    items: ITEMS, subtotal: 135000, taxTotal: 0, discountTotal: 0, grandTotal: 135000,
    company: null, packagingInfo: PKG, transportInfo: TRN,
  } as any)],

  ["عرض سعر", () => generatePrintHTML({
    type: "quote", number: "QT-1", date: "2026-08-06", customer: { name: "ياسين" },
    items: ITEMS, subtotal: 135000, taxTotal: 0, discountTotal: 0, grandTotal: 135000,
    company: null, packagingInfo: PKG, transportInfo: TRN,
  } as any)],

  ["عرض سعر جانبي", () => generatePrintHTML({
    type: "quote", number: "QT-S-1", date: "2026-08-06", customer: { name: "ياسين" },
    items: ITEMS, subtotal: 135000, taxTotal: 0, discountTotal: 0, grandTotal: 135000,
    company: null, packagingInfo: PKG, transportInfo: TRN, variant: "full",
  } as any)],

  ["رابط العميل — فاتورة", () => buildSharedDocumentHTML({
    doc_type: "invoice",
    doc: { invoice_number: "INV-1", date: "2026-08-06", total: 135000, subtotal: 135000, paid_amount: 0 },
    customer: { name: "ياسين" }, company: null,
    items: ITEMS.map((i) => ({ ...i })),
    packaging: [], packaging_items: PKG_ITEMS, transports: TRANSPORTS,
  } as any)],

  ["رابط العميل — عرض سعر", () => buildSharedDocumentHTML({
    doc_type: "quote",
    doc: { quote_number: "QT-1", date: "2026-08-06", total: 135000, subtotal: 135000 },
    customer: { name: "ياسين" }, company: null,
    items: ITEMS.map((i) => ({ ...i })),
    packaging: [], packaging_items: PKG_ITEMS, transports: TRANSPORTS,
  } as any)],
];

describe("كتلة التغليف متطابقة في المخارج كلّها", () => {
  const blocks = OUTPUTS.map(([name, build]) => [name, pkgBlockOf(build())] as const);

  it("كلُّ مخرجٍ يحملها", () => {
    for (const [name, block] of blocks) {
      expect(block, name).toContain("data-pkg-rows");
    }
  });

  it("ونصُّها واحدٌ حرفاً بحرف", () => {
    const distinct = new Set(blocks.map(([, b]) => b));
    // عند الاختلاف تُعرض أسماءُ المخارج المختلفة لا نصٌّ طويل
    expect(Array.from(distinct), blocks.map(([n]) => n).join(" · ")).toHaveLength(1);
  });

  it("وهي كتلةُ `formatPackaging` نفسها لا نسخةٌ منها", () => {
    for (const [name, block] of blocks) {
      expect(PKG, name).toContain(block.slice(block.indexOf("data-pkg-rows"), block.indexOf("data-pkg-rows") + 40));
    }
  });
});

/* ─────────── ٢) والملامح المطلوبة موجودةٌ في كلٍّ منها ─────────── */

/**
 * الملامح الثلاثة التي طلبها صاحب المستودع بالصورة: أعمدةٌ بينها خطٌّ فاصل،
 * وشريطُ مجموعٍ مميّز، وخطٌّ عريض. تُفحص في كل مخرجٍ لا في المُنتِج وحده —
 * فقد يبتلعها تنظيفُ الورقة (`cleanExtraHTML`) في أحدها دون البقيّة.
 */
describe("والملامح تصل كل ورقة", () => {
  for (const [name, build] of OUTPUTS) {
    describe(name, () => {
      const html = build();

      it("أعمدةٌ بينها خطٌّ فاصل", () => {
        // عمودان صريحان — لا خاصّيةُ `column-count`، فهي لا تصل ملفَّ العميل
        expect((html.match(/data-pkg-col="/g) || []).length).toBe(2);
        expect(html).toContain("border-left:1px solid");
        expect(html).not.toContain("column-count");
      });

      it("وشريطُ المجموع موصوفٌ بعدده", () => {
        expect(html).toContain("إجمالي عدد القطع");
        // المجموعُ = Σ الأرقام المكتوبة في أوّل الأسطر (لا ضربَ في ‎*‎N)
        expect(html).toMatch(/>(\d+)<\/span>\s*<span>قطعة/);
        // والطرودُ مخفيّة بطلبه — محسوبةٌ في الأسطر فوقها على أي حال
        expect(html).not.toContain("طرداً");
      });

      it("والخطّ عريض", () => {
        expect(html).toContain("font-weight:700");
      });

      it("والبنود كلُّها وصلت", () => {
        for (const r of PKG_ITEMS) expect(html).toContain(r.product_name);
        // خمسةُ بنودٍ + شريطُ المجموع
        expect(pkgLines(pkgBlockOf(html))).toBe(6);
      });

      it("والترحيل معها", () => {
        expect(html).toContain("بورتسودان");
      });
    });
  }
});

/* ─────────── ٣) وعددُ الأعمدة يتبع البنود في كل مخرج ─────────── */

describe("عددُ الأعمدة واحدٌ في المخارج كلّها", () => {
  const counts = [2, 7, 25];

  for (const n of counts) {
    it(`${n} بنداً ⇒ ${packagingColumns(n)} عمود في كل ورقة`, () => {
      const items = Array.from({ length: n }, (_, i) => ({
        packaging_types: { name: "كرتونة" }, product_name: `صنف ${i + 1}`,
        packs_count: 1, pieces_per_pack: 10, quantity: 1,
      }));
      const pkg = formatPackaging([], items)!;
      const expected = packagingColumns(n);
      const countCols = (h: string) => (h.match(/data-pkg-col="/g) || []).length;

      const preview = generatePrintHTML({
        type: "invoice", number: "INV-1", date: "2026-08-06", customer: { name: "ياسين" },
        items: ITEMS, subtotal: 1, taxTotal: 0, discountTotal: 0, grandTotal: 1,
        company: null, packagingInfo: pkg,
      } as any);
      const shared = buildSharedDocumentHTML({
        doc_type: "invoice",
        doc: { invoice_number: "INV-1", date: "2026-08-06", total: 1, subtotal: 1, paid_amount: 0 },
        customer: { name: "ياسين" }, company: null, items: ITEMS.map((i) => ({ ...i })),
        packaging: [], packaging_items: items, transports: [],
      } as any);

      expect(countCols(preview)).toBe(expected);
      expect(countCols(shared)).toBe(expected);
    });
  }
});
