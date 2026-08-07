/**
 * كلُّ زرٍّ يعرض فاتورةً أو يرسلها — يخرج بالشكل نفسه.
 *
 * طلبه صاحبُ المستودع: «تأكّد من ظهور جميع التعديلات في المعاينة كاملة، وجميع
 * الأزرار والأشياء التي ترسل فاتورة أو تعرضها».
 *
 * ## ولمَ لا يكفي أن نفحص القالب
 * فحصُ القالب يقول إنّ **الورقة** صحيحة. وهذا الملفّ يقول إنّ **كلَّ مخرجٍ
 * يمرّ بها** — وهما دعويان مختلفتان. فمن أضاف زرّاً غداً يبني ورقته بيده
 * لم يسقط فحصُ القالب، وسقط هذا.
 *
 * ## والمخارجُ محصورةٌ بالبحث لا بالذاكرة
 * القائمةُ أدناه مكتوبةٌ بأسمائها، ومعها فحصٌ يمشي شجرةَ المصدر: أيُّ ملفٍّ
 * يبني ورقةَ مستندٍ ولا يستورد القالب يُسقط الفحص. فالقائمةُ تُراجَع نفسَها.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const SRC = path.resolve(process.cwd(), "src");

/* ═══════ ١) المخارجُ التي تعرض فاتورةً أو ترسلها ═══════ */

/**
 * لكلّ مخرجٍ: الملفُّ الذي فيه الزرّ، وما يجب أن يستدعيه.
 *
 * والوسائطُ ثلاث لا أكثر:
 *   • `generatePrintHTML` — يبني الورقة بنفسه (نافذةُ الطباعة، الطباعةُ
 *     المباشرة، رابطُ العميل).
 *   • `/preview/` — ينتقل إلى صفحة المعاينة، وهي تبني بالقالب.
 *   • `shareDocumentPdf` — يصوّر ورقةً بُنيت بالقالب.
 */
const OUTLETS: Array<{ file: string; label: string; via: RegExp }> = [
  // ── الفاتورة ──
  { file: "src/screens/InvoiceCreateScreen.tsx", label: "شاشةُ إنشاء/تعديل الفاتورة — طباعة ومعاينة وإرسال PDF",
    via: /generatePrintHTML|\/preview\/invoice|shareDocumentPdf/ },
  { file: "src/screens/InvoicesScreen.tsx", label: "قائمةُ الفواتير — معاينة وطباعة",
    via: /generatePrintHTML|\/preview\/invoice/ },
  { file: "src/pages/InvoiceViewPage.tsx", label: "صفحةُ الفاتورة — طباعة",
    via: /generatePrintHTML/ },
  { file: "src/utils/printInvoiceDirect.ts", label: "الطباعةُ المباشرة",
    via: /generatePrintHTML/ },

  // ── عرض السعر ──
  { file: "src/pages/QuoteCreatePage.tsx", label: "شاشةُ إنشاء/تعديل العرض — طباعة ومعاينة وإرسال PDF",
    via: /generatePrintHTML|\/preview\/quote|shareDocumentPdf/ },
  { file: "src/pages/QuotesPage.tsx", label: "قائمةُ العروض",
    via: /generatePrintHTML|\/preview\/quote/ },
  { file: "src/pages/QuoteViewPage.tsx", label: "صفحةُ العرض — طباعة",
    via: /generatePrintHTML/ },

  // ── المشتريات والمرتجع ──
  { file: "src/pages/PurchaseCreatePage.tsx", label: "شاشةُ المشتريات",
    via: /generatePrintHTML|\/preview\/purchase/ },
  { file: "src/pages/PurchasePage.tsx", label: "قائمةُ المشتريات",
    via: /generatePrintHTML|\/preview\/purchase/ },
  { file: "src/pages/StockReturnViewPage.tsx", label: "صفحةُ المرتجع",
    via: /generatePrintHTML|\/preview\/return/ },

  { file: "src/pages/StockReturnCreatePage.tsx", label: "شاشةُ إنشاء المرتجع",
    via: /generatePrintHTML|\/preview\/return/ },
  { file: "src/pages/StockReturnPage.tsx", label: "قائمةُ المرتجعات",
    via: /generatePrintHTML|\/preview\/return/ },

  // ── العروضُ الجانبية ──
  { file: "src/pages/SideQuotesPage.tsx", label: "قائمةُ العروض الجانبية",
    via: /generatePrintHTML|\/preview\/quote/ },
  { file: "src/pages/SideQuoteDetailPage.tsx", label: "صفحةُ العرض الجانبي — طباعة",
    via: /generatePrintHTML|\/preview\/quote/ },

  // ── شاشاتُ التغليف: تعرض المستندَ بعد إدخال تغليفه ──
  { file: "src/components/packaging/PackagingDialog.tsx", label: "نافذةُ التغليف — معاينةُ المستند",
    via: /\/preview\/(invoice|quote)/ },
  { file: "src/pages/InvoicePackagingPage.tsx", label: "صفحةُ تغليف الفاتورة",
    via: /\/preview\/invoice/ },
  { file: "src/pages/QuotePackagingPage.tsx", label: "صفحةُ تغليف العرض",
    via: /\/preview\/quote/ },

  // ── المعاينةُ ورابطُ العميل ──
  { file: "src/pages/DocumentPreviewPage.tsx", label: "صفحةُ المعاينة — لكل الأنواع",
    via: /generatePrintHTML/ },
  { file: "src/utils/sharedDocumentHtml.ts", label: "رابطُ العميل",
    via: /generatePrintHTML/ },
  { file: "src/pages/StandaloneShareDocument.tsx", label: "صفحةُ رابط العميل",
    via: /fetchSharedDocumentHTML|buildSharedDocumentHTML/ },
];

describe("كلُّ مخرجٍ يمرّ بالقالب", () => {
  for (const { file, label, via } of OUTLETS) {
    it(label, () => {
      expect(read(file), `${file} لا يمرّ بالقالب`).toMatch(via);
    });
  }
});

/* ═══════ ٢) والمعاينةُ تغطّي الأنواع الأربعة ═══════ */

/**
 * صفحةُ المعاينة هي المخرجُ الذي يمرّ به أكثرُ الأزرار (كلُّ ما ينتقل إلى
 * `/preview/...`). فتُفحص مساراتُها الأربعة.
 */
describe("صفحةُ المعاينة تبني الأنواع الأربعة بالقالب", () => {
  const page = read("src/pages/DocumentPreviewPage.tsx");
  const app = read("src/App.tsx");

  it("لها أربعةُ مساراتٍ مسجَّلة", () => {
    for (const t of ["quote", "invoice", "purchase", "return"]) {
      expect(app, `مسارُ ${t} غير مسجَّل`).toContain(`/preview/${t}/:id`);
    }
  });

  it("وتستدعي القالبَ في كلٍّ منها", () => {
    expect((page.match(/generatePrintHTML\(/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  /** ولا تكتب تنسيقَ ورقةٍ بنفسها — قاعدةُ الورقة الواحدة. */
  it("ولا تكتب تنسيقَ ورقةٍ بنفسها", () => {
    expect(page).not.toMatch(/\.page\s*\{|@page\s/);
  });
});

/* ═══════ ٣) ولا مخرجَ جديدٌ يفوت القائمة ═══════ */

/**
 * القائمةُ أعلاه مكتوبةٌ بيدٍ، والمكتوبُ بيدٍ يشيخ. فهذا الفحصُ يمشي شجرةَ
 * المصدر: كلُّ ملفٍّ يذكر مسارَ معاينةٍ أو يستدعي القالبَ أو المصوِّر هو مخرج
 * — فإن لم يكن في القائمة سقط الفحصُ باسمه.
 */
describe("لا مخرجَ خارج القائمة", () => {
  it("كلُّ ملفٍّ يعرض مستنداً أو يرسله مذكورٌ أعلاه", () => {
    const known = new Set(OUTLETS.map((o) => o.file));
    /* ملفّاتٌ تلمس هذه الأسماء ولا تعرض مستنداً للمستخدم: القالبُ نفسُه،
       وأدواتُه، وصفحاتُ تقاريرَ لها قوالبُها. */
    const notOutlets = new Set([
      "src/App.tsx",                                  // تسجيلُ المسارات
      "src/utils/printTemplate.ts",                   // القالب
      "src/utils/shareDocumentPdf.ts",                // المصوِّر
      "src/utils/pdfSheetFrame.ts",                   // إطارُ التصوير
      "src/utils/sheetPagination.ts",                 // ترقيمُ المعاينة
      "src/utils/documentFrameFit.ts",                // ملاءمةُ الإطار
      "src/utils/statementPrintTemplate.ts",          // قالبُ الكشف
      "src/pages/TransportPackagingReportPage.tsx",   // تقريرُ التغليف — قالبُه
      "src/pages/PackagingReportPreviewPage.tsx",     //   الخاصّ به
      "src/pages/StatementPreviewPage.tsx",           // معاينةُ الكشف
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "test") walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
        if (known.has(rel) || notOutlets.has(rel)) continue;
        const src = fs.readFileSync(full, "utf8");
        if (/generatePrintHTML\(|shareDocumentPdf\(|\/preview\/(invoice|quote|purchase|return)\//.test(src)) {
          offenders.push(rel);
        }
      }
    };
    walk(SRC);
    expect(offenders, "مخارجُ غيرُ مذكورة في القائمة").toEqual([]);
  });
});

/* ═══════ ٤) وقوالبُ الطباعة كلُّها تطبع أرضياتها ═══════ */

/**
 * العطلُ الذي بلّغ عنه صاحبُ المستودع («الجملة في الطباعة لا تظهر») ليس خاصّاً
 * بورقة الفاتورة: المتصفّحاتُ تُسقط أرضياتِ الألوان عند الطباعة في **كل**
 * صفحة. فكلُّ قالبٍ يُطبع ويرسم أرضيةً يلزمه الإلزام نفسُه.
 */
describe("كلُّ ما يُطبع يطبع أرضياته", () => {
  const PRINTABLE = [
    "src/utils/printTemplate.ts",
    "src/utils/statementPrintTemplate.ts",
    "src/utils/financialReportPrintTemplate.ts",
    "src/utils/dispatchReportPrint.ts",
    "src/utils/transportPackagingPrint.ts",
    "src/utils/stockMovementsPrint.ts",
    "src/utils/unavailableItemsShare.ts",
    "src/pages/PublicCustomerStatementPage.tsx",
  ];

  for (const f of PRINTABLE) {
    it(f, () => {
      const src = read(f);
      expect(src, "لا يُلزم المتصفّحَ برسم الأرضيات").toMatch(/print-color-adjust:\s*exact/);
      expect(src, "بلا بادئة webkit — وبها يطبع أكثرُ مستخدمي الهاتف")
        .toMatch(/-webkit-print-color-adjust:\s*exact/);
    });
  }
});
