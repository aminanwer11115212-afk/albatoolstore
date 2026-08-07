/**
 * الشكلُ الجديد يظهر في **كل** المواضع — لا في المعاينة وحدها.
 *
 * طلبه صاحبُ المستودع بعد أن رأى تعديلاً لم يصل بعضَ الشاشات: «تأكّد من
 * ظهوره في كل المواضع».
 *
 * ## ولمَ يكفي فحصٌ واحدٌ لأربعة مسارات
 * المعاينةُ والطباعةُ ورابطُ العميل والـPDF **قالبٌ واحد** لا أربعة: كلُّها
 * تمرّ بـ`generatePrintHTML`، والـPDF يصوّر ناتجَه. فالعقدُ ذو شقّين:
 *
 *   ١. **لا مسارَ يبني ورقةً بنفسه** — وهو ما يفحصه القسمُ الأخير هنا: كلُّ
 *      ملفٍّ يُخرج ورقةَ مستندٍ يستورد القالب ولا يكتب جدولَ بنودٍ بيده.
 *   ٢. **والقالبُ يُخرج الشكلَ لكلّ نوعٍ ووضع** — وهو بقيّةُ الملفّ.
 *
 * وما يخصّ مساراً بعينه له حرّاسُه: `e2e/print-pdf-shape.spec.ts` يقيس ما
 * يصل الـPDF بالبكسلات، و`sharedDocumentHtml.test.ts` يفحص رابط العميل.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildSharedDocumentHTML } from "@/utils/sharedDocumentHtml";
import { stripScreenOnlyCss } from "@/utils/pdfSheetFrame";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const COMPANY = {
  company_name: "شركة البتول", phone: "0909605576", address: "عطبرة",
  manager_name: "مينا جابر", invoice_notes: "شكراً لتعاملكم مع شركة البتول",
} as any;

const ITEMS = [
  { product_name: "لستك 16*350", quantity: 10, unit_price: 84000, tax_amount: 0, discount: 0, total: 840000 },
  { product_name: "بطارية جي ان", quantity: 2, unit_price: 75600, tax_amount: 0, discount: 0, total: 151200 },
];

function sheet(over: Record<string, any> = {}) {
  return generatePrintHTML({
    type: "invoice", number: "INV-1", date: "2026-08-01",
    customer: { name: "ابرام جرجس", phone: "0912345678", address: "بحري" },
    items: ITEMS, subtotal: 991200, taxTotal: 0, discountTotal: 0, grandTotal: 991200,
    company: COMPANY, paidAmount: 100000, previousDebt: 200000, previousCredit: 0,
    transportInfo: '<span class="tr-main">الاسم: شرق النيل</span>',
    packagingInfo: '<div data-pkg-rows="1"><div data-pkg-line>1 كرتونة *8</div></div>',
    ...over,
  } as any);
}

/** العلاماتُ التي طلبها صاحبُ المستودع، ومكانُ كلٍّ منها. */
const MARKS = {
  headerStrip: 'class="header-meta"',
  grandBand: 'class="grand-band"',
  thanks: 'class="doc-thanks"',
  transportIcon: "تفاصيل الترحيل",
  packagingIcon: "تفاصيل التغليف",
  acctIcons: 'data-section="account-summary"',
};

/* ═══════ ١) كلُّ نوعِ مستندٍ يخرج بالشكل نفسه ═══════ */

/**
 * الأنواعُ التي يعرفها القالب. ولكلٍّ ما يخصّه: عرضُ السعر لا «مدفوع» فيه،
 * والمشترياتُ لا حسابَ عميلٍ لها — فيُفحص لكلٍّ ما يليق به لا قائمةٌ واحدة.
 */
describe("كلُّ نوعِ مستندٍ يخرج بالشكل الجديد", () => {
  const TYPES: Array<{ type: string; account: boolean }> = [
    { type: "invoice", account: true },
    { type: "quote", account: true },
    { type: "return", account: true },
    { type: "purchase", account: true },
  ];

  for (const { type, account } of TYPES) {
    it(`${type} — الترويسةُ والشريطُ والشكرُ والعلامات`, () => {
      const html = sheet({ type });
      expect(html, "شريطُ بيانات الشركة").toContain(MARKS.headerStrip);
      expect(html, "شريطُ الجملة").toContain(MARKS.grandBand);
      expect(html, "عبارةُ الشكر").toContain(MARKS.thanks);
      expect(html, "عنوانُ الترحيل الجديد").toContain(MARKS.transportIcon);
      expect(html, "عنوانُ التغليف").toContain(MARKS.packagingIcon);
      if (account) {
        expect(html, "مربّعُ الحساب").toContain(MARKS.acctIcons);
        // ولكلّ صفٍّ في المربّع علامتُه
        const at = html.indexOf(MARKS.acctIcons);
        const box = html.slice(at, html.indexOf("</table>", at));
        expect((box.match(/<svg /g) || []).length).toBe((box.match(/<tr /g) || []).length);
      }
    });
  }

  /** والفاتورةُ الكاش نوعٌ من الفاتورة — لا شكلٌ ثانٍ. */
  it("والفاتورةُ الكاش كذلك", () => {
    const html = sheet({ isCash: true });
    expect(html).toContain("فاتورة كاش");
    expect(html).toContain(MARKS.grandBand);
    expect(html).toContain(MARKS.thanks);
  });
});

/* ═══════ ٢) وكلُّ وضعِ عرضٍ (variant) ═══════ */

/**
 * الأوضاعُ تُخفي أقساماً بقصد. فالمفحوصُ هنا أنّ ما **يبقى** يخرج بالشكل
 * الجديد — لا أن كلَّ شيءٍ يظهر في كل وضع.
 */
describe("وكلُّ وضعِ عرضٍ يبقى على الشكل", () => {
  it("full — كلُّ شيء", () => {
    const html = sheet({ variant: "full" });
    for (const m of Object.values(MARKS)) expect(html).toContain(m);
  });

  it("no-account — بلا مربّع حساب، وبقيّةُ الشكل باقية", () => {
    const html = sheet({ variant: "no-account" });
    expect(html).not.toContain(MARKS.acctIcons);
    expect(html).toContain(MARKS.headerStrip);
    expect(html).toContain(MARKS.thanks);
  });

  it("account-only — المربّعُ بعلاماته، ولا جدولَ بنود", () => {
    const html = sheet({ variant: "account-only" });
    expect(html).toContain(MARKS.acctIcons);
    const at = html.indexOf(MARKS.acctIcons);
    const box = html.slice(at, html.indexOf("</table>", at));
    expect((box.match(/<svg /g) || []).length).toBe((box.match(/<tr /g) || []).length);
    expect(html).not.toContain(MARKS.grandBand);
  });

  it("stocktake — كشفُ جردٍ لا شكرَ فيه ولا تواقيع", () => {
    const html = sheet({ variant: "stocktake" });
    expect(html).toContain("كشف جرد");
    expect(html).not.toContain(MARKS.thanks);
    expect(html).toContain(MARKS.headerStrip);   // الترويسةُ باقية
  });

  /** وبلا ترويسةٍ (noHeader) يبقى ما تحتها كما هو. */
  it("noHeader — لا ترويسةَ ولا شريطَ بياناتها، وبقيّةُ الشكل باقية", () => {
    const html = sheet({ noHeader: true });
    expect(html).not.toContain(MARKS.headerStrip);
    expect(html).toContain(MARKS.grandBand);
    expect(html).toContain(MARKS.thanks);
    expect(html).toContain(MARKS.acctIcons);
  });
});

/* ═══════ ٣) ورابطُ العميل يخرج بالشكل نفسه ═══════ */

/**
 * الرابطُ يقرأ من دالّة القاعدة ويبني بـ`generatePrintHTML` نفسِها — فالتطابقُ
 * **بنيويٌّ لا تعاقديّ**. وهذا يثبته على الحمولة كما تأتي من القاعدة.
 */
describe("رابطُ العميل", () => {
  const PAYLOAD = {
    kind: "invoice",
    doc: {
      invoice_number: "INV-1", date: "2026-08-01", total: 991200,
      paid_amount: 100000, subtotal: 991200, discount: 0,
    },
    items: ITEMS.map((i) => ({ ...i })),
    customer: { name: "ابرام جرجس", phone: "0912", address: "بحري" },
    company: COMPANY,
  } as any;

  it("يخرج بالشريط والشكر وعلامات المربّع", () => {
    const html = buildSharedDocumentHTML(PAYLOAD);
    expect(html).toContain(MARKS.headerStrip);
    expect(html).toContain(MARKS.grandBand);
    expect(html).toContain(MARKS.thanks);
  });

  it("وعبارةُ الشكر من إعدادات الشركة كما في المعاينة", () => {
    expect(buildSharedDocumentHTML(PAYLOAD)).toContain("شكراً لتعاملكم مع شركة البتول");
  });
});

/* ═══════ ٤) ومسارُ الـPDF لا يُسقط الشكل ═══════ */

/**
 * الـPDF يصوّر الورقة بعد تجريد أنماط الشاشة. فلو جرّد قاعدةً من قواعد الشكل
 * الجديد لخرج الملفُّ مختلفاً عن المعاينة — وهو ما لا يُكتشف إلا عند العميل.
 */
describe("تجريدُ أنماط الشاشة لا يمسّ الشكل", () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(sheet())![1];
  const stripped = stripScreenOnlyCss(css);

  for (const rule of [".grand-band", ".doc-thanks", ".header-meta", ".account-box", ".extra-box-title"]) {
    it(`${rule} باقٍ بعد التجريد`, () => {
      expect(stripped).toContain(rule);
    });
  }

  it("والمجرَّدُ أقصرُ من الأصل — التجريدُ يعمل فعلاً", () => {
    expect(stripped.length).toBeLessThan(css.length);
  });
});

/* ═══════ ٥) ولا مسارَ يبني ورقةً بنفسه ═══════ */

/**
 * هذا هو الشقُّ الذي يجعل ما سبق كافياً: ما دام كلُّ منتِجِ ورقةٍ يمرّ
 * بالقالب، فإصلاحُ القالب يصل الجميع. وأيُّ ملفٍّ يبني جدولَ بنودٍ بيده يكسر
 * ذلك — وهو ما يبحث عنه هذا الفحص في المشروع كلّه.
 *
 * وقالبُ دالّة الحافة (`supabase/functions`) مستثنى: لا يُعدَّل من هنا
 * بسياسة لافابل، وهو مسارُ سقوطٍ للروابط القديمة لا يُطوَّر.
 */
describe("كلُّ منتِجِ ورقةِ مستندٍ يمرّ بالقالب", () => {
  /** ملفّاتُ القوالب المستقلّة المعروفة — لكلٍّ موضوعٌ غيرُ ورقة المستند. */
  const OTHER_TEMPLATES = new Set([
    "src/utils/statementPrintTemplate.ts",      // كشف الحساب
    "src/utils/financialReportPrintTemplate.ts", // التقارير المالية
    "src/utils/dispatchReportPrint.ts",          // كشف الترحيلات
    "src/utils/transportPackagingPrint.ts",      // ورقة الترحيل والتغليف
    "src/utils/unavailableItemsShare.ts",        // الأصناف غير المتوفّرة
    "src/utils/stockMovementsPrint.ts",          // حركة المخزون
    "src/utils/printTemplate.ts",                // القالبُ نفسُه
  ]);

  it("لا ملفَّ يبني «جملة الفاتورة» خارج القالب", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "test") walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
        if (OTHER_TEMPLATES.has(rel)) continue;
        const src = fs.readFileSync(full, "utf8");
        /*
         * منتِجُ ورقةٍ = **يرسم** صفَّ الجملة بيده. وذكرُ العبارة في تعليقٍ
         * شارح ليس رسماً — فيُشترط معها وسمُ جدول، وإلا سقط الفحصُ على
         * وحدة الكثافة ووحدة وسائط الحساب وكلتاهما لا ترسم شيئاً.
         */
        const draws = /<t[dr][\s>]/.test(src);
        if (draws && /جملة (الفاتورة|عرض السعر)/.test(src) && !src.includes("generatePrintHTML")) {
          offenders.push(rel);
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });

  /**
   * والقوالبُ الأخرى ليست ورقةَ مستند، لكنّها شاشاتُ طباعةٍ ومعاينة — فتلزمها
   * قاعدةُ الخطّ التي طُلبت لها جميعاً.
   */
  it("وقوالبُ الطباعة الأخرى على الخطّ المطلوب", () => {
    for (const f of OTHER_TEMPLATES) {
      if (f === "src/utils/printTemplate.ts") continue;
      const src = read(f);
      if (!/font-family/.test(src)) continue;
      const first = /font-family:\s*([^;]+);/.exec(src)![1];
      expect(first, `${f} لا يبدأ بـArial`).toMatch(/^Arial|^["']?Arial/);
    }
  });
});
