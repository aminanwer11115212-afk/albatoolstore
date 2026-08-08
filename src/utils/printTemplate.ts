interface PrintItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount: number;
  total: number;
}

interface PrintData {
  type: "invoice" | "quote" | "purchase" | "return";
  isCash?: boolean;
  number?: string;
  date: string;
  
  dueDate?: string;
  customer?: { name: string; phone?: string; address?: string; company?: string; email?: string } | null;
  items: PrintItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  shipping?: number;
  grandTotal: number;
  paidAmount?: number;
  dueAmount?: number;
  notes?: string;
  status?: string;
  paymentMethod?: string;
  company?: {
    company_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    tax_number?: string;
    currency?: string;
    logo_url?: string;
    tax_rate?: number;
    website?: string;
    bank_name?: string;
    bank_account?: string;
    iban?: string;
  } | null;
  variant?: "full" | "no-account" | "account-only" | "no-details" | "stocktake";
  noHeader?: boolean;
  oldBalance?: number;
  packagingInfo?: string;
  transportInfo?: string;
  customTitle?: string;
  /** رصيد العميل المدين قبل هذه الفاتورة (لا يشمل متبقّي هذه الفاتورة). */
  previousDebt?: number;
  /** رصيد العميل الدائن قبل هذه الفاتورة. */
  previousCredit?: number;
  /** إخفاء صندوق "المبلغ المدفوع" في قسم ملخّص الحساب (يُستخدم في المعاينة). */
  hidePaidBox?: boolean;
  /**
   * أقسامٌ تُحذف من الورقة قبل توليدها: `signatures` | `transport` |
   * `packaging`. الحذف من الـHTML لا بالتنسيق، لأن مسارات PDF والرابط العام
   * والطباعة المباشرة لا تمرّ بشريط المعاينة الذي يخفي بالـCSS — فلو كان
   * الإخفاء تنسيقاً لخرج المخفيُّ إلى العميل.
   */
  hiddenSections?: string[];
  /**
   * صافي حساب العميل **الآن** بإشارة الدفاتر (موجب = عليه).
   *
   * حين يُمرَّر، يصير هو «رصيد العميل الحالي» ويُشتقّ منه «المدفوع»:
   *     المدفوع = جملة الحساب − الرصيد الحالي
   * بدل أن يُؤخذ `paid_amount` الفاتورة وحده. راجع تعليق `paidValue` أدناه.
   */
  currentNet?: number | null;
}

import {
  SVG_TRUCK, SVG_BOX, SVG_PHONE, SVG_USER, SVG_PIN, SVG_HANDSHAKE,
  SVG_FILE, SVG_CLOCK, SVG_CALC, SVG_CASH, SVG_WALLET, SVG_TAG,
  ACCT_ICON_COLOR,
} from "../../supabase/functions/_shared/documentIcons";
import { resolveLogoUrl } from "@/utils/albatoolLogo";
import { computeDocumentBalance } from "@/utils/documentBalanceSummary";
import { signedAmountText } from "@/utils/buildCustomerAccountView";
import {
  printDensity, densityClass, DENSITY_CSS,
  ACCOUNT_FONT_PX, ACCOUNT_ROW_H_PX,
} from "@/utils/printDensity";
import { PDF_SCALE_INLINE_JS } from "@/utils/pdfCanvasScale";
import { PAGINATION_CSS, PAGINATION_INLINE_JS } from "@/utils/sheetPagination";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * ## رسومُ الورقة — سطريّةٌ لا إيموجي
 *
 * طلب صاحبُ المستودع علامةَ عربةٍ مع «تفاصيل الترحيل»، ومثلَها على بقيّة
 * العناوين. ولم تُستعمل رموزُ الإيموجي (🚚 📦 🤝) وإن كانت أقصر: الإيموجي
 * يُرسم بخطٍّ ملوّنٍ منفصل عن خطّ النصّ، وهو غيرُ مضمونٍ في المصوِّر ولا في
 * سائقات الطباعة — فيخرج مربّعاً فارغاً في ملفّ العميل على بعض الأجهزة، وهو
 * ما لا يُكتشف إلا عنده.
 *
 * والرسمُ السطريّ بـcurrentColor يرث لونَ عنوانه، فلا لونَ يُكتب مرّتين،
 * ويطبع بأيّ حبر.
 *
 * ولا علامةَ backtick في هذه التعليقات ولا في وسوم SVG: الملفُّ كلُّه سلسلةٌ
 * نصّية، والعلامةُ تنهيها فيسقط التصريف على سطرٍ لا علاقة له بالعلّة.
 */
/** ألوان الإشارة في الطباعة — مطابقة لألوان الكشف: أخضر للعميل، أحمر عليه. */
const TONE_COLOR: Record<"debit" | "credit" | "settled", string> = {
  credit: "#16a34a",
  debit: "#c0392b",
  settled: "#111",
};

function cleanExtraHTML(s?: string): string | undefined {
  if (!s) return undefined;
  // Strip dangerous constructs (script/style tags, inline event handlers,
  // javascript: URLs) before doing the formatting cleanup.
  const out = s
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<(div|span|p|section)[^>]*>\s*(<br\s*\/?>)?\s*<\/\1>/gi, "")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
    .replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, "")
    .trim();
  const textOnly = out.replace(/<[^>]+>/g, "").trim();
  return textOnly.length ? out : undefined;
}

export function generatePrintHTML(data: PrintData): string {
  const {
    type, isCash, number, date, dueDate, customer, items,
    subtotal, taxTotal, discountTotal, shipping = 0, grandTotal,
    paidAmount = 0, dueAmount = 0, notes, company, status, paymentMethod,
    variant = "full", noHeader = false, oldBalance = 0, packagingInfo, transportInfo, customTitle,
    previousDebt = 0, previousCredit = 0, hidePaidBox = false, currentNet = null,
    hiddenSections = [],
  } = data;

  const isSectionHidden = (key: string) => hiddenSections.includes(key);

  const balSum = computeDocumentBalance({
    grandTotal, discount: discountTotal, paidAmount,
    previousDebt, previousCredit,
  });
  const fmt = (n: number) => Number(n || 0).toLocaleString();

  const title = variant === "stocktake"
    ? "كشف جرد"
    : (customTitle || (type === "invoice"
      ? (isCash ? "فاتورة كاش" : "فاتورة مبيعات")
      : type === "quote" ? "عرض سعر"
      : type === "return" ? "مرتجع مبيعات"
      : type === "purchase" ? "أمر شراء"
      : "فاتورة مشتريات"));

  // اسم المستند في جُمَل «لا توجد بيانات…» — كان "الفاتورة" مثبَّتاً حتى في
  // عرض السعر، ومرّةً بخطأ نحوي ("لهذا الفاتورة").
  const docNoun = type === "quote" ? "لعرض السعر هذا"
    : type === "purchase" ? "لأمر الشراء هذا"
    : type === "return" ? "لهذا المرتجع"
    : "لهذه الفاتورة";

  const currency = "";
  // Header visibility is controlled solely by the explicit `noHeader` flag.
  const showHeader = noHeader !== true;
  const showItems = variant !== "account-only" && variant !== "no-details";
  const showAccount = variant !== "no-account" && variant !== "no-details" && variant !== "stocktake";
  // Packaging/transport block: hidden for account-only and no-details variants.
  const extrasAllowedByVariant = variant !== "account-only" && variant !== "no-details" && variant !== "stocktake";
  const showPackaging = extrasAllowedByVariant && !isSectionHidden("packaging");
  const showTransport = extrasAllowedByVariant && !isSectionHidden("transport");
  // الصندوقان متجاوران؛ إن أُخفيا معاً سقط الصفّ كلّه فلا يبقى إطارٌ فارغ.
  const showExtras = showPackaging || showTransport;
  const showSignatures = variant !== "stocktake" && !isSectionHidden("signatures");
  /**
   * عبارةُ الشكر قسمٌ قائمٌ بذاته لا ذيلٌ للتواقيع.
   *
   * كانت تذهب معها لأنها كانت جزءاً من صندوقها، وصاحبُ المستودع يُخفي
   * التواقيع دائماً — فلا يرى العميلُ شكراً أبداً. فصار لها مفتاحُها: تُخفى
   * وحدها، وتبقى وحدها.
   */
  const thanksText = String(
    (company as any)?.invoice_notes ?? "",
  ).trim() || "شكراً لتعاملكم معنا";
  const showThanks = variant !== "stocktake" && !isSectionHidden("thanks");
  const logoURL = resolveLogoUrl(company?.logo_url);
  // "المطلوب النهائي" = جملة الفاتورة − المبلغ المدفوع (لا يُجمع مع الحساب القديم).
  const finalTotal = Math.max(0, grandTotal - paidAmount);
  const cleanPackaging = cleanExtraHTML(packagingInfo);
  const cleanTransport = cleanExtraHTML(transportInfo);

  /**
   * عدد بنود التغليف — تقرؤه الكثافةُ وحدها الآن.
   *
   * وكان يُستعمل قبله لقرارِ تخطيطٍ ثانٍ: صندوقا التغليف والترحيل متجاوران ما
   * دام التغليف قصيراً، فإذا تجاوز عشرين بنداً نزل كلٌّ منهما بعرض الورقة.
   * سقط ذلك القرار حين صار للتغليف سطرُه دائماً — فلا حدَّ يُتجاوز.
   *
   * والعدد يأتي من `data-pkg-rows` الذي يكتبه `formatPackaging` — أي من
   * مُنتِج الجدول، لا من عدٍّ لوسوم `<tr>` هنا يخطئ إن تغيّر الشكل.
   */
  const pkgRows = Number(/data-pkg-rows="(\d+)"/.exec(cleanPackaging || "")?.[1] || 0);

  /**
   * الكثافة التلقائية — الحدود ومعناها في `printDensity`.
   *
   * تُقرأ من عدد البنود وبنود التغليف معاً، وتُوضع صنفاً على `.page` فتسري
   * على الورقة كلّها: المعاينة والطباعة ورابط العميل — قالبٌ واحد لا ثلاثة.
   */
  const density = printDensity(items?.length, pkgRows);
  const pageDensityClass = densityClass(density);

  /**
   * صنفُ الجدول من أطول رقمٍ فيه.
   *
   * «تصغر في حالة وجود أرقام كثيرة للسعر بحيث كلهم تكون متساويات». وأعمدةُ
   * السعر والإجمالي ثابتةُ العرض (100px و110px)، فرقمٌ من تسعة أرقام بفواصله
   * يبلغ 11 محرفاً — يلامس حافّة عموده عند 15px، وما زاد يلتفّ سطرين فيرتفع
   * الصفُّ ويختلّ الجدول.
   *
   * فالمقاسُ ينزل درجةً **للجدول كلّه** لا لخليّةٍ بعينها: تصغيرُ خليّةٍ وحدها
   * يعيد الاختلافَ الذي طُلب رفعُه. والحدودُ مقيسةٌ بالتصيير لا مقدَّرة —
   * راجع `e2e/print-rows-per-page.spec.ts`.
   */
  const longestMoney = Math.max(
    0,
    ...(items || []).flatMap((it) => [
      (Number(it.unit_price) || 0).toLocaleString().length,
      (Number(it.total) || 0).toLocaleString().length,
    ]),
    (Number(grandTotal) || 0).toLocaleString().length,
  );
  const numClass = longestMoney >= 13 ? " num-xl" : longestMoney >= 11 ? " num-lg" : "";

  // Helper: escape value for safe insertion inside an HTML attribute (double-quoted)
  const attr = (v: string) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Helper: escape value for safe insertion as HTML body text
  const esc = (v: any) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return `<!DOCTYPE html>
<!-- data-lov-sheet: علامةُ أنّ هذه ورقتنا لا ورقةَ دالّة الحافة القديمة.
     يقرؤها المضيف في documentFrameFit ليعرف كيف يصغّرها: بالمتغيّر الذي
     يعرفه القالب، أو على الجذر مباشرةً لورقةٍ لا تعرفه. -->
<html dir="rtl" lang="ar" data-lov-sheet="1">
<head>
<meta charset="utf-8">
<!-- عرضٌ ثابتٌ بمقاس A4 (210mm ≈ 794px): الهاتف يعرض الورقة كاملةً مصغَّرةً
     كما يفعل قارئ الـPDF، بدل شريط تمرير أفقي على ورقةٍ أعرض من الشاشة. -->
<meta name="viewport" content="width=794">
<meta name="lov-doc-label" content="${attr(title)}">
<meta name="lov-doc-number" content="${attr(number || "")}">
<meta name="lov-customer-name" content="${attr(customer?.name || "")}">
<meta name="lov-doc-total" content="${attr(String(Math.round(grandTotal * 100) / 100))}">
<meta name="lov-wa-phone" content="">
<title>${esc(title)} ${esc(number || "")}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* Pagination across A4 pages for long tables */
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .total-row, .summary-row, .summary-box, .footer, .signatures { page-break-inside: avoid; break-inside: avoid; }
  /* صندوقا التغليف والترحيل ينقسمان على الصفحات بحرّية: بنود التغليف قد تبلغ
     عشرات الأسطر، ومنعُ القسمة يدفع الصندوق كلّه لصفحةٍ تالية — أو يقصّه. */
  .extra-row, .extra-box { page-break-inside: auto; break-inside: auto; }
  @media print { body { padding: 0; } .page { max-width: none; } }
  /**
   * === الخطّ: Arial في الورقة كلّها ===
   *
   * طلبه صاحبُ المستودع صراحةً: «نوع الخط في جميع شاشات المعاينة والطباعة
   * يكون Arial، دا كويس بوضح أكتر». وله سببٌ عمليّ فوق الذوق: الخطُّ السابق
   * خطُّ ويندوز، لا يوجد على الهاتف ولا في المصوِّر — فتسقط الورقة إلى بديلٍ
   * يختلف باختلاف الجهاز، وتختلف عروضُ الحروف فيفيض النصّ عن صناديقه. وArial
   * (أو بديلُه المتري Liberation Sans / Helvetica) موجودٌ في كل مكان، فالورقة
   * واحدةٌ على الشاشة والورق وملفّ العميل.
   *
   * والأرقامُ بـtabular-nums: أعمدةُ المبالغ تصطفّ رأسياً على منازلها، وهو ما
   * كان يُشترى قبلُ بخطٍّ أحاديّ المسافة غريبٍ عن بقيّة الورقة.
   *
   * (ولا يُذكر اسمُ خطٍّ مهجورٍ هنا: هذا التعليقُ يخرج في الورقة، وفحصُ
   * «لا أثرَ للخطّ القديم» يبحث عن اسمه في الناتج فيجده في تعليقٍ فيسقط.)
   */
  body {
    font-family: Arial, 'Liberation Sans', Helvetica, sans-serif;
    color: #1a1a1a; background: #fff; padding: 20px; line-height: 1.5;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  .page { max-width: 800px; margin: 0 auto; }

  /**
   * على الشاشة: ورقةُ A4 كالـPDF تماماً — لا عمودٌ مطّاط بعرض النافذة.
   *
   * الرابط والمعاينة يعرضان هذا المستند في iframe، فكان يتمدّد بعرض الشاشة
   * ويختلف عمّا يراه العميل حين ينزّل الـPDF. فصار الورقُ صفحةً بيضاء بعرض
   * 210mm وهامشٍ 10mm — نفس قاعدة @page — على أرضيةٍ رمادية تُظهر حوافّه.
   *
   * والعرض ثابتٌ بالمليمتر لا نسبةً: A4 مقاسٌ لا يتغيّر. أمّا الشاشة الضيّقة
   * فيتكفّل بها وسمُ viewport في الترويسة: يعرض المتصفّح الورقة كاملةً
   * مصغَّرةً كما يفعل قارئ الـPDF، بدل شريط تمرير أفقي.
   */
  @media screen {
    body { background: #e5e7eb; padding: 10px 0; }
    .page {
      width: 210mm; max-width: 210mm; min-height: 297mm;
      margin: 0 auto; background: #fff; padding: 10mm;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.18);
      /**
       * الهاتف: الورقة كاملةً في عرض الشاشة، ثم يكبّرها القارئ بأصابعه.
       *
       * وسمُ viewport في الترويسة يكفي حين يُفتح المستند في تبويبٍ مستقلّ،
       * ولا يكفي داخل iframe — فالمتصفّحات تتجاهله في الإطارات، فتخرج
       * الورقة أعرض من الإطار بشريط تمرير أفقي. والمعاينةُ ورابطُ العميل
       * كلاهما إطار، فهذه هي الحالة الغالبة لا الاستثناء.
       *
       * فالنسبةُ تُحسب بسكربتٍ صغير أسفل الصفحة ويكتبها في المتغيّر
       * --lov-fit. وخاصّية zoom لا transform: الأخيرة تُصغّر المرسوم وتترك
       * مكانه محجوزاً، فيبقى تحت الورقة بياضٌ بطول ما اختصرته. ولا تُكبَّر
       * الورقة فوق مقاسها أبداً — التكبير للقارئ لا للصفحة.
       */
      zoom: var(--lov-fit, 1);
    }
  }
${DENSITY_CSS}
${PAGINATION_CSS}

  /* === HEADER === */
  .header {
    text-align: center; padding-bottom: 10px;
    border-bottom: 3px solid #4a7c59;
    margin-bottom: 10px; position: relative;
  }
  .header-logos {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px;
  }
  .header-logo img { height: 75px; object-fit: contain; }
  .header-title {
    font-size: 22px; font-weight: 900; color: #c0392b;
    margin-bottom: 4px;
  }
  /**
   * === شريطُ بيانات الشركة: سطرٌ واحد بعلاماتٍ فاصلة ===
   *
   * أرسل صاحبُ المستودع الشكل مصوَّراً: الهاتفُ والمسؤولُ والعنوان في **سطرٍ
   * واحد**، كلٌّ بعلامته، بينها فواصل رأسية. وكان سطرين — العنوان تحت الاسم
   * ثمّ الهاتف تحته — أي سطرٌ زائدٌ من رأس الورقة لمعلوماتٍ تسع سطراً.
   *
   * والعلاماتُ رسومٌ لا رموزُ إيموجي: الإيموجي يُرسم بخطٍّ ملوّنٍ قد لا يوجد
   * في المصوِّر ولا في المطبعة، فيخرج مربّعاً فارغاً في ملفّ العميل. والرسمُ
   * السطريّ يرث لونَ النصّ ويطبع بأيّ حبر.
   */
  .header-meta {
    display: flex; justify-content: center; align-items: center;
    flex-wrap: wrap; gap: 4px 10px;
    font-size: 13.5px; font-weight: 700; color: #1a1a1a;
    margin-top: 3px; line-height: 1.5;
  }
  .header-meta-item { display: inline-flex; align-items: center; gap: 4px; }
  .header-meta-item svg { width: 13px; height: 13px; flex: 0 0 auto; }
  .header-meta-sep { color: #9aa3ad; font-weight: 400; }

  /* === DOC HEAD: العميل يميناً، العنوان وسطاً، التاريخ والرقم يساراً ===
     أرسل صاحبُ المستودع الشكل مصوَّراً: الثلاثةُ في شريطٍ واحد لا في ثلاثة
     أسطر. وله سببٌ في التخطيط لا في الذوق: العنوانُ كان سطراً وحده والبياناتُ
     سطرين تحته — ثلاثةُ أسطرٍ لمعلوماتٍ تسع سطراً واحداً، ونحو 30px من رأس
     الصفحة تُؤخذ من الجدول.

     والجانبان بمرونةٍ متساوية (1 1 0) كي يقع العنوانُ في المنتصف الحقيقي
     مهما طال اسمُ العميل أو قصُر — لا في منتصفِ ما تبقّى. */
  .doc-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 10px; margin: 8px 0 8px;
  }
  .doc-head-side { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .doc-head-right { text-align: right; }
  .doc-head-left { text-align: left; }
  .doc-title { flex: 0 0 auto; text-align: center; margin: 0; }
  .doc-title h1 {
    font-size: 22px; color: #2c3e50; font-weight: 800;
    display: inline-block; border-bottom: 3px solid #5b2c8e;
    padding-bottom: 3px;
  }

  /* === INFO LINE ===
     مقاسُه 15px لا 14: «كبّر خط تفاصيل الفاتورة لكي يكون واضح». وهو اسمُ
     العميل وتاريخُه ورقمُ فاتورته — أوّلُ ما يُتحقَّق منه في الورقة.

     ولا يُقصّ بـoverflow: اسمٌ طويل يلتفّ سطرين ولا يُبتر بثلاث نقاط. وهو
     حارسُ الورقة نفسه: لا شيء يُخفى. ولذلك سببٌ ثانٍ: html2canvas يقصّ
     صندوقَ النصّ بحسابه هو، فظهرت أسطرُ الترويسة **مقطوعةً من نصفها** في
     الملفّ الناتج بينما هي سليمةٌ على الشاشة. */
  .info-line {
    font-size: 15px; line-height: 1.45;
  }
  .info-label { color: #1a1a1a; font-weight: 700; }
  .info-value { color: #c0392b; font-weight: 700; }
  .info-value-blue { color: #2980b9; font-weight: 800; }

  /* === TABLE === */
  table {
    width: 100%; border-collapse: collapse; margin-bottom: 12px;
    border: 2px solid #1a1a1a;
  }
  /**
   * === صفوفٌ أقصر تسع أصنافاً أكثر ===
   *
   * قارن صاحبُ المستودع ورقتَنا بورقةِ Access القديمة: تسعةُ أصنافٍ عندها في
   * ثلث ما تأخذه عندنا. وقاس: «صغّر الأسطر عشان تشيل أصناف أكتر».
   *
   * والحشوُ هو المأخذ لا الخطّ: 7px فوق و7px تحت في خليّةٍ سطرُها 13px يعني
   * أنّ **نصفَ ارتفاع الصفّ فراغ**. فنزل الحشوُ إلى 3.5px والخطُّ إلى 12.5px،
   * فقصُر الصفُّ من نحو 34px إلى نحو 26px — أي بندٌ إضافيٌّ لكلّ أربعةٍ كانت.
   * وهو فوق أرضية القراءة (MIN_FONT_PX) بمسافةٍ مريحة.
   *
   * وحدودُ الكثافة أُعيد قياسُها على هذا الارتفاع الجديد — لا تُخمَّن.
   */
  thead th {
    background: #5b4cad; color: white;
    padding: 5px 8px; font-size: 15px; font-weight: 700;
    text-align: center; border: 1px solid #1a1a1a;
  }
  /*
   * === ترويسةُ جدول البنود: بيضاءُ الأرضية أسودُ الخطّ ===
   *
   * طلبُ صاحب المستودع: «الشريط الذي فيه اسم الصنف والكمية والسعر والإجمالي
   * اجعله أبيض والكتابة بالأسود».
   *
   * وهي مقصورةٌ على جدول البنود عمداً: القاعدةُ العامّة للترويسة هي
   * **مرساةُ هوية** كشف الحساب — يقارنها فحصُ التطابق بأنماط صفحة الكشف
   * العامّة. فتغييرُها يُلوّن كشفَ الحساب بلا طلب.
   *
   * ويفصلها عن البنود حدُّها الأسفلُ الغليظ — خطٌّ لا لون، فلا يسقط في طباعةٍ
   * تُسقط الأرضيات.
   */
  table.items-table thead th {
    background: #fff; color: #000;
    border-bottom-width: 2px;
  }
  tbody td {
    padding: 3.5px 8px; text-align: center; font-size: 15px;
    border: 1px solid #999;
  }
  /**
   * === خلايا الجدول كلُّها بمقاسٍ واحد ===
   *
   * طلبه صاحبُ المستودع: «اجعل حجم الخط — اسم الصنف والأصناف والإجمالي
   * ومجموعهم، وحقول الترويسة كلها — بنفس خط الكميات والسعر، لتكون متساوية
   * ومنسّقة».
   *
   * وكان عمودا الكمية والسعر وحدهما 15px وبقيّةُ الخلايا 12.5 — رُفعا قبلُ
   * لأنهما كانا الأنحفَ، فصارا الأعرضَ وحدهما، فاختلّ الصفُّ في الاتجاه
   * المقابل. فالمقاسُ اليوم واحدٌ في الخلايا والترويسة معاً (15px)، والفرقُ
   * بينها في **الثقل** لا في الحجم: الكميةُ والسعر أثقلُ لأنهما ما يُراجَع،
   * والباقي عاديّ. فتُقرأ الأعمدةُ صفّاً مستقيماً.
   *
   * ولا تُكتب هنا نصوصُ الأقسام كما تظهر للعميل: تعليقاتُ هذا المقطع تخرج
   * في الورقة، وفحوصُ الإخفاء تبحث عن تلك النصوص فتجدها في تعليقٍ فتسقط.
   */
  .col-qty, .col-price {
    font-weight: 800; color: #111;
  }
  /**
   * === وتصغر جميعاً حين تطول الأرقام ===
   *
   * «وتصغر في حالة وجود أرقام كثيرة للسعر بحيث كلهم تكون متساويات».
   *
   * والصنفُ يُوضع على الجدول من عدد أطول رقمٍ فيه — لا على خليّةٍ بعينها:
   * تصغيرُ خليّةٍ واحدة يعيد الاختلافَ الذي طُلب رفعُه. فالجدولُ كلُّه ينزل
   * درجةً، فتبقى الأعمدةُ متساوية وإن ضاقت.
   *
   * والحدُّ الأدنى فوق أرضية القراءة — الصفحةُ الزائدة أهون من رقمٍ لا يُقرأ.
   */
  table.num-lg tbody td, table.num-lg thead th { font-size: 13.5px; }
  table.num-xl tbody td, table.num-xl thead th { font-size: 12px; }
  tbody tr:nth-child(even) { background: #f8f8f8; }
  /* صفُّ الجملة القديم باقٍ لقالب كشف الحساب — هو الذي يستعمله الآن،
     وورقةُ الفاتورة صارت إلى الشريط المضغوط أدناه. */
  .total-row td {
    font-weight: 800; font-size: 14px;
    border: 2px solid #1a1a1a; background: #f0f0f0;
  }
  .product-name { text-align: right; font-weight: 600; }

  /**
   * === شريطُ جملة الفاتورة ===
   *
   * قال صاحبُ المستودع: «عامل مستطيل طويل بحجم الورقة كلها ومقسّم فاضي ساي،
   * شكلو ما حلو». وهو وصفٌ دقيق: كان صفّاً في الجدول بخمس خلايا، ثلاثٌ منها
   * **فارغةٌ عمداً** كي يقع الرقمُ تحت عمود الإجمالي — فيمتدّ الإطارُ الأسود
   * بعرض الورقة حاملاً كلمتين ورقماً وثلاثة فراغات.
   *
   * فخرج من الجدول إلى شريطٍ بقدر ما فيه: أرضيةٌ داكنة، وعرضُه من محتواه لا
   * من الورقة.
   *
   * ## ومكانُه شمالَ الورقة
   * «الجملة جيبها شمال». وكان الهامشُ التلقائي على اليسار فيدفعه إلى اليمين
   * تحت عمود الاسم؛ فصار على اليمين ليدفعه إلى اليسار — تحت عمود الإجمالي
   * الذي يحمل الرقم، فتنزل العينُ من آخر مبلغٍ إلى جملته في خطٍّ مستقيم.
   *
   * ## ومربّعان لا مربّع
   * «خليها في مربعات زي ما رسلتها ليك». فبينهما فاصلٌ رأسيّ وللرقم أرضيةٌ
   * أغمق قليلاً: يُقرأ الوصفُ خانةً والرقمُ خانةً كما في الصورة، لا سطراً
   * واحداً بينه فراغ.
   *
   * ولا يُشطر بين صفحتين، وهو ذرّةٌ في حساب الترقيم كصفوف الجدول.
   */
  .grand-band {
    display: flex; align-items: stretch;
    width: fit-content; min-width: 250px; max-width: 62%;
    margin: -12px auto 14px 0;
    border-radius: 5px; overflow: hidden;
    background: #1f2d5a; color: #fff;
    page-break-inside: avoid; break-inside: avoid;
  }
  .grand-band-label {
    padding: 6px 14px; font-size: 15px; font-weight: 800; white-space: nowrap;
    display: flex; align-items: center;
  }
  .grand-band-value {
    padding: 6px 16px; font-size: 17px; font-weight: 900; white-space: nowrap;
    letter-spacing: 0.3px; background: #16224a;
    border-inline-start: 1px solid rgba(255, 255, 255, 0.28);
    display: flex; align-items: center; margin-inline-start: auto;
  }

  /* === SUMMARY BOXES === */
  .summary-row {
    display: flex; justify-content: center; gap: 30px;
    margin: 16px 0;
  }
  .summary-box {
    border: 2px solid #1a1a1a; border-radius: 6px;
    padding: 12px 30px; text-align: center; min-width: 220px;
  }
  .summary-box-title {
    font-size: 15px; font-weight: 800; color: #1a1a1a;
    margin-bottom: 4px;
  }
  .summary-box-value {
    font-size: 20px; font-weight: 900;
  }
  .summary-box-value.red { color: #c0392b; }
  .summary-box-value.blue { color: #2980b9; }

  /* === PACKAGING & TRANSPORT === */
  .extra-row {
    display: flex; gap: 16px; margin: 16px 0;
  }
  .extra-box {
    flex: 1; border: 2px solid #999; border-radius: 6px;
    /* بلا ارتفاعٍ أدنى: الصندوق بقدر ما فيه، لا بقدرٍ مفروض */
    padding: 8px 12px;
  }
  /*
   * سطرُ الترحيل والحساب.
   *
   * صندوقان ثابتا الطول يتقاسمان سطراً واحداً: الترحيلُ يميناً (أوّلُ عنصرٍ
   * في RTL) والحسابُ يساراً، مشدودين إلى حافّتَي الورقة بـspace-between فلا
   * يطفو أحدهما في الوسط.
   *
   * وصندوقُ النقل صغير — طُلب أن يكون بسيطاً ومربّعه صغيراً: يمتدّ حتى
   * نصف السطر ولا يتجاوزه، فيبقى إلى جانبه الحسابُ بقدره لا مضغوطاً.
   *
   * وalign-items: flex-start كي لا يُمطَّ الأقصرُ إلى طول الأطول: صندوقُ
   * ترحيلٍ فيه سطران يخرج بارتفاع أربعة صفوفٍ من الحساب، فيه فراغٌ ظاهر.
   */
  .extra-row--head {
    justify-content: space-between; align-items: flex-start;
  }
  .extra-row--head .extra-box--transport {
    flex: 1 1 auto; max-width: 50%; min-height: 0; padding: 8px 12px;
  }
  /**
   * الحساب بقدر أرقامه: عرضٌ ثابتٌ لا يتمدّد ولا ينضغط، فتبقى الأعمدة على
   * محاذاةٍ واحدة مهما طالت أسماء الصفوف.
   *
   * ## ومكانُه لا يتحرّك بإخفاء غيره
   * طلبه صاحبُ المستودع: يبقى في مكانه مهما أُخفي حوله. وكان يتحرّك من طرفين،
   * قِيسا بالتصيير:
   *   1. **عرضاً بإخفاء جاره في السطر.** السطرُ موزَّعٌ بـspace-between، وهي
   *      بعنصرٍ واحد تُلصقه بالبداية — والبدايةُ يمينٌ في RTL. فبإخفاء جاره
   *      قفز 458px من طرفٍ إلى طرف. وهامشُ inline-start التلقائي يدفعه إلى
   *      الطرف الآخر دائماً، بجارٍ أو بلا جار.
   *   2. **علوّاً بإخفاء صفٍّ منه.** إخفاءُ صفٍّ واحد أنزل ارتفاعه من 122 إلى
   *      99 فصعد ما تحته 24px. فيُحجز ارتفاعُه بمتغيّر --acct-h يكتبه القالب
   *      من عدد صفوفه المرسومة — فالإخفاء يُفرغ مكان الصفّ ولا يزيله.
   *
   * ولا تُكتب أسماءُ الصفوف هنا كما تظهر للعميل: التعليقُ يخرج في الورقة،
   * وفحوصُ الإخفاء تبحث عن تلك الأسماء فتجدها في تعليقٍ فتسقط.
   */
  .account-box {
    flex: 0 0 auto; width: auto; min-width: 260px; max-width: 46%; margin: 0;
    margin-inline-start: auto;
    min-height: var(--acct-h, 0);
  }
  /*
   * صفٌّ واحدٌ لكل بند مهما كبر المبلغ — وإلا سقط الارتفاعُ المحجوز.
   *
   * الحجزُ عددُ صفوفٍ × ارتفاعِ صفّ، وهو صحيحٌ ما دام الصفُّ سطراً. وبعرضٍ
   * ثابتٍ 260px يلتفّ الرقمُ عند **تسعة أرقام** — أي مئاتِ الملايين، وهي في
   * متناول هذا المستند. قِيس: 968,125,000 رفع الصندوق 125 ← 134، فتجاوز
   * حجزَه وعاد يتحرّك بإخفاء صفّ.
   *
   * فالصندوقُ يتّسع بالرقم بدل أن يلتفّ به: عرضُه من محتواه فوق أرضيةِ
   * 260px، وسقفُه 46% من الورقة. قِيس إلى اثني عشر رقماً: العرضُ 260 ← 308
   * والارتفاعُ 125 ثابت، ولا يفيض عن الورقة.
   */
  .account-box td { white-space: nowrap; }
  /*
   * ولا يُشطر بين صفحتين. هو جدولٌ، والقاعدة العامّة تسمح بقسمة الجداول —
   * فوقع القطعُ بين صفوفه وذهب آخرُها وحده إلى الصفحة التالية، وهو صفُّ
   * الرصيد الذي جاء العميلُ لأجله. والقاعدة أخصُّ من العامّة فتغلبها.
   */
  .account-box, .account-box tbody, .account-box tr {
    page-break-inside: avoid; break-inside: avoid;
  }
  /** والتغليف وحده في سطره، بعرض الورقة كاملاً. */
  .extra-row--pkg { margin-top: 10px; }
  .extra-row--pkg .extra-box { flex: 1 1 100%; }
  /*
   * وصندوقُ التغليف ينتقل كاملاً إلى الصفحة التالية — لا يُشطر.
   *
   * كان محتواه وحده ممنوعاً من القسمة (إعلانٌ سطريّ في formatPackaging)،
   * والصندوقُ المؤطَّر حوله يتبع القاعدة العامّة «page-break-inside: auto».
   * فانتقل المحتوى إلى الصفحة التالية وبقي الإطارُ والعنوانُ في الأولى:
   * صندوقٌ فارغ فيه عنوانُه وخطُّه المتقطّع لا شيء تحته، ثمّ أسطرٌ عاريةٌ بلا
   * إطارٍ ولا عنوان في الثانية. صوّره صاحب المستودع من الطباعة.
   *
   * وأمكن المنعُ بعد أن وزّعت الأعمدةُ الأسطرَ فقصر الصندوق إلى الثلث. ولو
   * جاءت مئتا بندٍ فطال عن صفحة تجاهل المتصفّحُ المنعَ وقسم — وهو المخرج
   * الآمن نفسه.
   *
   * والقاعدة أخصُّ من العامّة (صنفان لا صنف) فتغلبها بلا !important.
   */
  .extra-row--pkg, .extra-row--pkg .extra-box {
    page-break-inside: avoid; break-inside: avoid;
  }
  .tr-main { font-size: 12px; font-weight: 700; color: #1a1a1a; }
  .tr-sub  { font-size: 10.5px; color: #666; }
  /* عنوانُ الصندوق ورسمُه في سطرٍ واحد — والرسمُ يرث لونَ العنوان بـ
     currentColor فلا لونَ يُكرَّر في موضعين. */
  .extra-box-title {
    display: flex; align-items: center; gap: 6px;
    font-size: 14px; font-weight: 800; color: #5b2c8e;
    border-bottom: 2px dashed #5b2c8e;
    padding-bottom: 4px; margin-bottom: 8px;
  }
  .extra-box-title svg { width: 16px; height: 16px; flex: 0 0 auto; }
  .extra-box p, .extra-content {
    font-size: 12px; color: #666;
  }
  /* جدول التغليف يرث تنسيقه من السمات داخله (يُحقن في قالبين)، فلا يأخذ
     تنسيق جدول البنود العام. */
  .extra-content table { width: 100%; border-collapse: collapse; }
  /* صفُّ المجموع في المتن لا في ذيلٍ يتكرّر على كل صفحة */
  .extra-content tfoot { display: table-row-group; }
  .extra-content thead th { background: #5b4cad; color: #fff; }

  /* === NOTES === */
  .notes-section {
    margin: 10px 0; padding: 8px 12px;
    background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
  }
  .notes-section h4 { font-size: 13px; color: #92400e; font-weight: 700; margin-bottom: 3px; }
  .notes-section p { font-size: 12px; color: #78350f; }

  /* === SIGNATURES === */
  .signatures {
    display: flex; justify-content: space-between; padding: 20px 50px 10px;
    margin-top: 20px;
  }
  .sig-box { text-align: center; width: 150px; }
  .sig-line {
    border-top: 1px solid #999; margin-top: 45px; padding-top: 5px;
    font-size: 12px; color: #555; font-weight: 600;
  }

  /**
   * === سطرُ الشكر — لا يذهب مع التواقيع ===
   *
   * قال صاحبُ المستودع إنّه يُخفي خانتَي التوقيع دائماً — لا يريدهما أن تظهرا
   * للزبون — وطلب أن تبقى عبارةُ الشكر ظاهرةً ولا تختفي معهما.
   *
   * (ولا تُذكر هنا أسماءُ الأقسام كما تظهر للعميل: هذا التعليقُ يخرج في
   * الورقة، وفحوصُ الإخفاء تبحث عن تلك الأسماء فتجدها في تعليقٍ فتسقط.)
   *
   * فالسطرُ عنصرٌ مستقلٌّ خارج صندوق التواقيع بقسمٍ خاصٍّ به اسمُه thanks: من
   * أخفى التواقيع أخفاها وحدها، وبقي الشكرُ آخرَ ما يقرأ العميل. ومن أراد
   * إخفاءه أخفاه من زرّ تخصيص الرؤية كسائر الأقسام — الاختيارُ له لا للتلازم.
   *
   * ونصُّه من إعدادات الشركة (invoice_notes) لا مكتوباً هنا: كلُّ محلٍّ
   * يشكر عملاءه بعبارته.
   */
  .doc-thanks {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    margin-top: 6px; padding: 6px 0;
    font-size: 13.5px; font-weight: 800; color: #2f6b4f;
  }
  .doc-thanks svg { width: 18px; height: 18px; flex: 0 0 auto; }
  .doc-thanks-rule {
    display: inline-block; width: 26px; height: 0;
    border-top: 2px solid #2f6b4f; opacity: 0.55;
  }

  /**
   * === الألوانُ تُطبع كما تُعرض ===
   *
   * بلّغ صاحبُ المستودع: «الجملة في الطباعة لا تظهر». وصوّر الورقة مطبوعة،
   * فإذا ترويسةُ الجدول البنفسجية بيضاء، ومربّعُ الحساب بلا تظليل، وشريطُ
   * الجملة بلا أرضيته الداكنة.
   *
   * والسببُ ليس في الورقة: المتصفّحات **تُسقط أرضياتِ الألوان عند الطباعة**
   * افتراضاً توفيراً للحبر، ما لم يؤشّر القارئُ «طباعة الخلفيات» في مربّع
   * الحوار. فالشريطُ أرضيتُه داكنة وخطُّه أبيض — تسقط الأرضيةُ فيبقى خطٌّ
   * أبيضُ على ورقٍ أبيض، أي **لا شيء**. وهو أسوأُ ما يقع: رقمٌ يختفي بلا
   * أثرٍ يدلّ على غيابه.
   *
   * وخاصّيةُ print-color-adjust بقيمة exact تُلزم المتصفّحَ برسم ما رُسم على
   * الشاشة.
   * فتُكتب هنا مرّةً على كل عنصر — لا على الشريط وحده: العلّةُ عامّةٌ في
   * الورقة كلّها، وكلُّ ما له أرضيةٌ يصيبه ما أصابه.
   *
   * والبادئةُ webkit- معها: كروم وسفاري القديمان لا يعرفان الاسمَ القياسي،
   * وهما ما يطبع به أكثرُ المستخدمين على الهاتف.
   */
  @media print {
    body { padding: 0; }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
</style>
</head>
<body>
<div class="page ${pageDensityClass}">

${showHeader ? `
<!-- Header -->
<div class="header" data-section="header" data-section-label="الترويسة">
  <div class="header-logos">
    <div class="header-logo"><img src="${logoURL}" alt="Logo" /></div>
    <div>
      <div class="header-title">${esc(company?.company_name || "اولاد جابر لاسبيرات المواتر والتكاتك")}</div>
      ${(() => {
        /**
         * الهاتفُ والمسؤولُ والعنوان في سطرٍ واحد، وما لم يُملأ لا يترك أثراً:
         * لا علامةً معلّقة ولا فاصلاً زائداً في الطرف. فالفواصلُ تُنسج بين
         * الموجود لا حول كلّ حقل.
         */
        const bits = [
          company?.phone ? `<span class="header-meta-item">${SVG_PHONE}<span>${esc(company.phone)}</span></span>` : "",
          (company as any)?.manager_name
            ? `<span class="header-meta-item">${SVG_USER}<span>${esc((company as any).manager_name)}</span></span>` : "",
          company?.address ? `<span class="header-meta-item">${SVG_PIN}<span>${esc(company.address)}</span></span>` : "",
        ].filter(Boolean);
        if (!bits.length) return "";
        return `<div class="header-meta">${bits.join('<span class="header-meta-sep">|</span>')}</div>`;
      })()}
    </div>
    <div class="header-logo"><img src="${logoURL}" alt="Logo" /></div>
  </div>
</div>
` : ""}

<!-- Document Head: العميل · العنوان · التاريخ والرقم — في شريطٍ واحد -->
<div class="doc-head">
  <div class="doc-head-side doc-head-right">
    <div class="info-line">
      <span class="info-label">اسم العميل:</span>
      <span class="info-value">${esc(customer?.name || "كاش")}</span>
    </div>
    ${customer?.address ? `<div class="info-line">
      <span class="info-label">العنوان:</span>
      <span class="info-value">${esc(customer.address)}</span>
    </div>` : ""}
  </div>
  <div class="doc-title">
    <h1>${esc(title)}</h1>
  </div>
  <div class="doc-head-side doc-head-left">
    <div class="info-line">
      <span class="info-label">التاريخ:</span>
      <span class="info-value">${date}</span>
    </div>
    <div class="info-line">
      <span class="info-label">رقم ${type === "invoice" ? "الفاتورة" : type === "quote" ? "عرض السعر" : "المشتريات"}:</span>
      <span class="info-value-blue">${esc(number || "")}</span>
    </div>
  </div>
</div>

${showItems ? (variant === "stocktake" ? `
<!-- Items Table (STOCKTAKE — quantity first + tick circle) -->
<table class="items-table${numClass}" data-section="items" data-section-label="كشف الجرد">
  <thead>
    <tr>
      <th style="width:60px;">العدد</th>
      <th>اسم الصنف</th>
      <th style="width:90px;">السعر</th>
      <th style="width:110px;">الإجمالي</th>
      <th style="width:60px;">التجرد</th>
      <th style="width:35px;">#</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it, i) => `
      <tr>
        <td class="col-qty">${it.quantity}</td>
        <td class="product-name">${esc(it.product_name)}</td>
        <td class="col-price">${(Number(it.unit_price) || 0).toLocaleString()}</td>
        <td style="font-weight:700;">${(Number(it.total) || 0).toLocaleString()}</td>
        <td style="text-align:center;"><span style="display:inline-block;width:18px;height:18px;border:1.5px solid #333;border-radius:50%;"></span></td>
        <td>${i + 1}</td>
      </tr>
    `).join("")}
    <tr class="total-row" data-section="grand-total" data-section-label="الإجمالي">
      <td colspan="3" style="text-align:right; padding-right:15px;">الإجمالي</td>
      <td style="font-weight:800;">${(Number(grandTotal) || 0).toLocaleString()}</td>
      <td colspan="2"></td>
    </tr>
  </tbody>
</table>
` : variant === "no-account" ? `
<!-- Items Table (NO PRICES — products only) -->
<table class="items-table${numClass}" data-section="items" data-section-label="المنتجات">
  <thead>
    <tr>
      <th style="width:50px;">#</th>
      <th>اسم الصنف</th>
      <th style="width:120px;">الكمية</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="product-name">${esc(it.product_name)}</td>
        <td class="col-qty">${it.quantity}</td>
      </tr>
    `).join("")}
  </tbody>
</table>
` : `
<!-- Items Table -->
<table class="items-table${numClass}" data-section="items" data-section-label="المنتجات">
  <thead>
    <tr>
      <th style="width:35px;">#</th>
      <th>اسم الصنف</th>
      <th style="width:80px;">الكمية</th>
      <th style="width:100px;">السعر</th>
      <th style="width:110px;">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="product-name">${esc(it.product_name)}</td>
        <td class="col-qty">${it.quantity}</td>
        <td class="col-price">${it.unit_price.toLocaleString()}</td>
        <td style="font-weight:700;">${it.total.toLocaleString()}</td>
      </tr>
    `).join("")}
  </tbody>
</table>
<div class="grand-band" data-section="grand-total" data-section-label="الجملة">
  <span class="grand-band-label">جملة ${type === "invoice" ? "الفاتورة" : type === "quote" ? "عرض السعر" : "المشتريات"}</span>
  <span class="grand-band-value">${(Number(subtotal) || (grandTotal + (Number(discountTotal) || 0))).toLocaleString()}</span>
</div>
`) : ""}

${(() => {
const accountBox = !showAccount ? "" : (() => {
  const prevNet = (Number(previousDebt) || 0) - (Number(previousCredit) || 0);
  const hasPrev = Math.abs(prevNet) > 0.01;
  const generalDiscount = balSum.hasDiscount ? balSum.discount : 0;
  /**
   * ## عرض السعر لا يدخل حساب العميل
   *
   * كان الملخّص واحداً للفاتورة وعرض السعر، فيُجمع إجمالي العرض على الرصيد
   * السابق ويُعرض الناتج «رصيد العميل الحالي». فيقرأ العميل أن عرضاً لم
   * يُقبل بعد قد صار ديناً عليه — والعرض ليس مطالبةً أصلاً، ولا يُكتب في كشف
   * الحساب ولا في `customers.balance`.
   *
   * فالورقة هنا تعرض أرقام العرض وحدها، ورصيدَ العميل كما هو **قبل العرض
   * وبعده** — لا فرق بينهما — ولا صفَّ «مدفوع» لمستندٍ لا يُدفع.
   */
  const isQuote = type === "quote";
  const invoiceValue = Math.max(
    (Number(grandTotal) || 0) + generalDiscount,
    (Number(subtotal) || 0) + (Number(shipping) || 0),
    Number(grandTotal) || 0,
  ); // قيمة الفاتورة قبل الخصم
  const netInvoiceValue = Number(grandTotal) || 0; // صافي الفاتورة بعد الخصم
  // جملة الحساب — وفي عرض السعر لا حساب: إجماليه لا يُضمّ إلى رصيد العميل.
  const jomlaHesab = isQuote ? netInvoiceValue : netInvoiceValue + prevNet;
  /**
   * ## «المدفوع» يُشتقّ من الرصيد الفعلي لا من `paid_amount` الفاتورة
   *
   * دفعةُ 600,000 على فاتورة 500,000 وحسابٍ قديمٍ 200,000 كانت تُقسَّم:
   * 500,000 تُكتب على الفاتورة و100,000 على الدَّين القديم. فيقرأ المستخدم
   * «المدفوع 500,000» وقد دفع العميل 600,000، ويرى «الحساب القديم 100,000»
   * وهو 200,000 — رقمان لا يعرفهما أحد، وصندوقٌ لا يقفل حسابه:
   *     700,000 − 500,000 = 200,000  ≠  المستحق فعلاً 100,000
   *
   * المخرج ألّا يُقرأ التوزيع أصلاً. الرصيد الحالي حقيقةٌ مستقلّة عن كيفية
   * تفتيت الدفعة، فيُؤخذ كما هو ويُشتقّ «المدفوع» منه:
   *     المدفوع = جملة الحساب − الرصيد الحالي  =  700,000 − 100,000 = 600,000
   * فيقفل الصندوق دائماً، ويظهر «القديم» كاملاً و«المدفوع» كما أُدخل —
   * وهي نفس آلية «شحن الرصيد»: يُسجَّل على الحساب ولا يُوزَّع على بنوده.
   */
  const netProvided = currentNet != null && !Number.isNaN(Number(currentNet));
  // رصيد العميل في عرض السعر هو رصيده السابق حرفياً — العرض لا يحرّكه.
  const finalNet = isQuote
    ? r2(prevNet)
    : netProvided ? r2(Number(currentNet)) : jomlaHesab - paidAmount; // >0 عليه، <0 له
  const derivedPaid = netProvided ? Math.max(0, r2(jomlaHesab - finalNet)) : paidAmount;
  const hasPaid = !isQuote && !hidePaidBox && derivedPaid > 0.01;
  const paidValue = hasPaid ? derivedPaid : 0;
  // الإشارة بلغة العميل — `signedAmountText` هي المصدر الواحد لها في النظام:
  // `+` أخضر لما في مصلحته، `−` أحمر لما عليه. ولأن دالتها تقرأ الموجبَ لصالح
  // العميل، نمرّر النتيجة معكوسة الإشارة (`finalNet > 0` = عليه).
  const isSettled = Math.abs(finalNet) <= 0.01;
  const finalSigned = signedAmountText(-finalNet);
  const finalDisplay = finalSigned.text;
  const finalBadge = isSettled ? "" : finalNet > 0 ? "عليه" : "له";
  const finalColor = TONE_COLOR[finalSigned.tone];
  /*
   * خلايا بنمط Excel: حدود رفيعة رمادية، خلفية عنوان فاتحة، خط رقمي أحادي
   * المسافات. ومقاساتُها من `ACCOUNT_FONT_PX` وحده — «مربّع تفاصيل الحساب
   * الخط صغير كبّره»، وكان أدناها 9.5px أي **تحت أرضية القراءة** نفسها التي
   * تحرسها الكثافة (`MIN_FONT_PX`). فصارت الأرقامُ تُقرأ بلا عدسة.
   */
  const A = ACCOUNT_FONT_PX;
  const cellR = `padding:4px 7px;text-align:right;font-weight:700;color:#111;background:#f4f6f8;border:1px solid #b8bcc4;line-height:1.5;font-size:${A.label}px;`;
  // أرقامُ المربّع بخطّ الورقة نفسه، واصطفافُ المنازل من tabular-nums لا من
  // خطٍّ أحادي المسافة يخالف ما حوله.
  const cellL = `padding:4px 7px;text-align:left;font-weight:800;color:#111;background:#ffffff;border:1px solid #b8bcc4;line-height:1.5;font-variant-numeric:tabular-nums;font-size:${A.value}px;letter-spacing:0.2px;`;
  /*
   * خليّةُ العلامة: عرضٌ ثابت، وحدودُها كحدود جارتها فتبدو عموداً واحداً من
   * الجدول لا لصاقةً عليه. والرسمُ يرث لونَ الخليّة بـcurrentColor.
   *
   * ولا تُخلّ بالارتفاع المحجوز: عددُ الصفوف واحد، والرسمُ 15px أقصرُ من سطر
   * الخليّة (نحو 19px) فلا يمدّ الصفّ.
   */
  const cellI = `width:26px;padding:3px 0;text-align:center;vertical-align:middle;`
    + `background:#f4f6f8;border:1px solid #b8bcc4;color:${ACCT_ICON_COLOR};line-height:0;`;
  const icon = (svg: string) =>
    `<span style="display:inline-block;width:15px;height:15px;">${svg}</span>`;
  const row = (opts: {
    section: string; label: string; value: string; icon: string;
    valColor?: string; strong?: boolean; sideBadge?: string; badgeColor?: string;
    valueClass?: string;
  }) => `
    <tr data-section="${opts.section}" data-section-label="${opts.label}">
      <td style="${cellI}${opts.strong ? "background:#e8eef7;" : ""}">${icon(opts.icon)}</td>
      <td style="${cellR}${opts.strong ? "background:#e8eef7;" : ""}">${opts.label}</td>
      <td class="${opts.valueClass || "summary-box-value"}" style="${cellL}${opts.valColor ? `color:${opts.valColor};` : ""}${opts.strong ? `background:#eef4fb;font-size:${A.strong}px;` : ""}">${opts.value}</td>
      <td style="border:none;padding:0 4px;text-align:right;font-weight:800;font-size:${A.badge}px;color:${opts.badgeColor || "#111"};white-space:nowrap;">${opts.sideBadge || ""}</td>
    </tr>`;
  const rows = [
    row({ section: "invoice-value", label: isQuote ? "قيمة عرض السعر" : "قيمة الفاتورة", value: fmt(invoiceValue), icon: SVG_FILE }),
    generalDiscount > 0.01 ? row({ section: "discount-row", label: isQuote ? "الخصم على العرض" : "الخصم على الفاتورة", value: `− ${fmt(generalDiscount)}`, valColor: "#c0392b", icon: SVG_TAG }) : "",
    !isQuote && hasPrev ? (() => {
      const prevSigned = signedAmountText(-prevNet);
      return row({
        section: "prev-account-row",
        label: "الحساب القديم",
        value: prevSigned.text,
        valColor: TONE_COLOR[prevSigned.tone],
        sideBadge: prevNet > 0 ? "عليه" : "له",
        badgeColor: TONE_COLOR[prevSigned.tone],
        icon: SVG_CLOCK,
      });
    })() : "",
    row({ section: "majmoo-row", label: isQuote ? "إجمالي عرض السعر" : "جملة الحساب", value: fmt(jomlaHesab), strong: true, icon: SVG_CALC }),
    isQuote ? "" : row({ section: "paid-amount", label: "المدفوع", value: fmt(paidValue), valColor: paidValue > 0 ? "#16a34a" : "#111", icon: SVG_CASH }),
    isQuote && !hasPrev ? "" : `
    <tr data-section="final-status" data-section-label="رصيد العميل الحالي">
      <td style="${cellI}background:#e8eef7;">${icon(SVG_WALLET)}</td>
      <td style="${cellR}background:#e8eef7;">رصيد العميل الحالي</td>
      <td data-section="final-total" data-section-label="رصيد العميل الحالي" class="summary-box-value" style="${cellL}background:#eef4fb;font-size:${A.strong}px;color:${finalColor};">${finalDisplay}</td>
      <td style="border:none;padding:0 4px;text-align:right;font-weight:800;font-size:${A.badge}px;color:${finalColor};white-space:nowrap;">${finalBadge}</td>
    </tr>`,
  ].filter(Boolean);
  /*
   * الارتفاعُ محجوزٌ بعدد الصفوف المرسومة — لا بما يبقى منها بعد الإخفاء.
   * فمن أخفى «الحساب القديم» أو «المدفوع» بزرّ تخصيص الرؤية يجد الفراغَ
   * مكانَه ولا يصعد ما تحته. راجع `.account-box` في الأنماط.
   */
  const reservedH = rows.length * ACCOUNT_ROW_H_PX;
  return `
<!-- ملخّص الحساب على شكل خلايا Excel: أصغر من جدول البنود، مضغوط في الأسفل -->
<table class="account-box" data-section="account-summary" data-section-label="ملخص الحساب" data-acct-rows="${rows.length}" style="border-collapse:collapse;font-size:${A.label}px;--acct-h:${reservedH}px;">
  <tbody>
    ${rows.join("")}
  </tbody>
</table>
`;
})();

  // عنصرُ كتلةٍ لا p للتغليف: هو جدولٌ الآن، والجدول داخل فقرةٍ يخرج منها في
  // المتصفّح فينكسر الترتيب. راجع formatPackaging في printExtras.
  const packagingBox = showPackaging ? `
  <div class="extra-box" data-section="packaging" data-section-label="تفاصيل التغليف">
    <div class="extra-box-title">${SVG_BOX}<span>تفاصيل التغليف</span></div>
    <div class="extra-content">${cleanPackaging || `لا توجد بيانات تغليف ${docNoun}`}</div>
  </div>` : "";
  /*
   * والعنوانُ «تفاصيل الترحيل» لا «معلومات الترحيل»: هي تسميةُ صاحب المستودع
   * في طلبه، وتُطابق جارَها «تفاصيل التغليف» فيقرأ العينُ صندوقين متناظرين.
   * والمعرّفُ الداخلي (transport) لم يتغيّر — فاختياراتُ الإخفاء المحفوظة
   * تبقى على حالها.
   */
  const transportBox = showTransport ? `
  <div class="extra-box extra-box--transport" data-section="transport" data-section-label="تفاصيل الترحيل">
    <div class="extra-box-title">${SVG_TRUCK}<span>تفاصيل الترحيل</span></div>
    <p>${cleanTransport || `لا توجد بيانات ترحيل ${docNoun}`}</p>
  </div>` : "";

  /**
   * ## سطرٌ للترحيل والحساب، وسطرٌ للتغليف تحتهما
   *
   * أرسل صاحب المستودع الشكلَ مقصوصاً مُعاد الترتيب: الترحيلُ والحسابُ
   * متجاوران في سطرٍ واحد، والتغليفُ تحتهما.
   *
   * وله سببٌ في التخطيط لا في الذوق وحده: الترحيلُ سطران والحسابُ أربعةُ
   * صفوف — كلاهما **ثابتُ الطول** مهما كبرت الفاتورة، فيملآن سطراً واحداً
   * تماماً. والتغليفُ وحده هو الذي يمتدّ بعدد بنوده، فإفرادُه بسطرٍ يعطيه
   * عرض الورقة كاملاً: عشرون بنداً تُقرأ في عمودٍ عريضٍ قصير بدل عمودٍ ضيّقٍ
   * يمتدّ صفحتين.
   *
   * وكان الحسابُ وحده في سطر ثم التغليفُ والترحيلُ في سطر — فيقف الترحيلُ
   * القصير إلى جانب التغليف الطويل تاركاً ثلثَ الورقة بياضاً، ويبقى إلى جانب
   * الحساب بياضٌ آخر. سطران فيهما فراغان، صارا سطرين ممتلئين.
   *
   * والترتيب في RTL: أوّلُ عنصرٍ إلى اليمين. فالترحيل يميناً والحساب يساراً،
   * كما في الصورة.
   */
  const headRow = transportBox || accountBox
    ? `<div class="extra-row extra-row--head">${transportBox}${accountBox}</div>`
    : "";
  const pkgRow = packagingBox
    ? `<div class="extra-row extra-row--pkg">${packagingBox}</div>`
    : "";
  return headRow + pkgRow;
})()}

${notes ? `
<div class="notes-section" data-section="notes" data-section-label="الملاحظات">
  <h4>📝 ملاحظات</h4>
  <p>${esc(notes)}</p>
</div>
` : ""}

${showSignatures ? `
<!-- Signatures -->
<div class="signatures" data-section="signatures" data-section-label="التواقيع">
  <div class="sig-box"><div class="sig-line">توقيع المستلم</div></div>
  <div class="sig-box"><div class="sig-line">توقيع المسؤول</div></div>
</div>
` : ""}

${showThanks ? `
<div class="doc-thanks" data-section="thanks" data-section-label="عبارة الشكر">
  <span class="doc-thanks-rule"></span>
  ${SVG_HANDSHAKE}
  <span>${esc(thanksText)}</span>
  <span class="doc-thanks-rule"></span>
</div>
` : ""}

</div>

<!--
  ملاءمة الورقة لعرض الإطار: القالب يقول **كيف** تُصغَّر (بالمتغيّر --lov-fit
  على .page في قاعدة الشاشة)، والمضيف يقول **كم** بعد أن يقيس ما بداخله.

  وكان القياس هنا بسكربتٍ يقرأ عرض النافذة، فأُخرج إلى المضيف لسببين: أنّ
  القياس من الخارج يعمل مع ورقة دالّة الحافة القديمة أيضاً وهي لا تمرّ بهذا
  القالب، وأنّ أزرار التكبير التي يضغطها القارئ تعيش في شريط المضيف — فلا
  يتنازع اثنان على نسبةٍ واحدة.

  وحين تُفتح الورقة في تبويبٍ مستقلّ بلا مضيف، يتكفّل بها وسمُ viewport في
  الترويسة: يعرض المتصفّح الورقة كاملةً مصغَّرة كما يفعل قارئ الـPDF.
-->
<script>${PAGINATION_INLINE_JS}</script>
</body>
</html>`;
}

/**
 * يفتح نافذة معاينة فيها التقرير + شريط أدوات علوي ثابت:
 *   • طباعة      → يفتح حوار الطباعة (المستخدم يختار الطابعة أو حفظ كـ PDF)
 *   • PDF        → ينزّل ملف PDF مباشرة (html2pdf)
 *   • واتساب PDF → يولّد PDF ويُشاركه عبر Web Share API (الجوال)، وإلا يحمّله ويفتح واتساب
 *   • واتساب نص  → يفتح واتساب برسالة ملخّصة
 */
/**
 * يبني الـHTML النهائي = (HTML المستند) + شريط أدوات المعاينة المحقون.
 * يُستخدم في:
 *   • openPrintWindow (نافذة منبثقة — السلوك القديم)
 *   • DocumentPreviewPage داخل iframe (الصفحة الداخلية الجديدة)
 *
 * inline=true: يستبدل زر "إغلاق ✕" برسالة postMessage('lov-preview-close')
 * بدلاً من window.close (المناسب فقط داخل popup).
 */
export function buildPrintWindowHtml(html: string, inline: boolean = false): string {
  // ===== استخراج معرّف المستخدم الحالي ليُستخدم كمفتاح حفظ مستقل لكل مستخدم =====
  let userKey = "anon";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          const uid = parsed?.user?.id || parsed?.currentSession?.user?.id;
          if (uid) { userKey = String(uid); break; }
        }
      }
    }
  } catch { /* ignore */ }
  const userKeyAttr = userKey.replace(/[^a-zA-Z0-9_-]/g, "");

  // نحقن شريط أدوات + script للأزرار قبل </body>
  const toolbarHTML = `
<meta name="lov-print-user" content="${userKeyAttr}">

<style id="__lov_print_toolbar_css">
  #__lov_print_toolbar {
    position: fixed; top: 0; right: 0; left: 0; z-index: 999999;
    background: linear-gradient(135deg, #5b21b6, #7c3aed);
    color: #fff; padding: 8px 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: flex; flex-direction: column; gap: 6px;
    font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
    font-size: 13px;
  }
  #__lov_print_toolbar .row {
    display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; align-items: center;
  }
  #__lov_print_toolbar button {
    background: rgba(255,255,255,0.15);
    color: #fff; border: 1px solid rgba(255,255,255,0.25);
    padding: 6px 12px; border-radius: 6px; cursor: pointer;
    font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
    transition: background 0.15s;
  }
  #__lov_print_toolbar button:hover { background: rgba(255,255,255,0.28); }
  #__lov_print_toolbar button.close { background: rgba(0,0,0,0.25); }
  #__lov_print_toolbar button.toggle-off {
    background: rgba(0,0,0,0.35); opacity: 0.65;
    text-decoration: line-through;
  }
  #__lov_print_toolbar .label { font-weight: 700; margin-inline-end: 8px; opacity: 0.9; }
  #__lov_print_toolbar .divider {
    width: 100%; height: 1px; background: rgba(255,255,255,0.2);
  }
  /* صفّ الرؤية يُطوى — عشرة أزرار أو أكثر لا تليق بشاشة هاتف */
  #__lov_print_toolbar.collapsed .divider,
  #__lov_print_toolbar.collapsed #__lov_visibility_row { display: none; }
  #__btn_toggle_vis[aria-expanded="true"] { background: rgba(255,255,255,0.3); }

  /* الحشو يُضبط من الجافاسكربت على ارتفاع الشريط الفعلي — وهذه قيمة أوّلية
     تمنع القفزة قبل أول قياس. الرقم الثابت كان يخفي المستند خلف الشريط على
     الهاتف حيث يلتفّ إلى عدّة أسطر. */
  body { padding-top: 96px; }

  @media (max-width: 640px) {
    #__lov_print_toolbar { padding: 6px 8px; font-size: 12px; gap: 4px; }
    #__lov_print_toolbar .row { gap: 5px; }
    #__lov_print_toolbar button { padding: 5px 9px; border-radius: 5px; gap: 4px; }
    #__lov_print_toolbar .label { margin-inline-end: 4px; width: 100%; text-align: center; }
  }
  /* hidden via toggle: hide on screen AND when printing/PDF */
  [data-section].__lov_hidden { display: none !important; }
  @media print {
    #__lov_print_toolbar, #__lov_print_toolbar_css { display: none !important; }
    body { padding-top: 0 !important; }
  }
</style>
<div id="__lov_print_toolbar" dir="rtl">
  <div class="row">
    <span class="label">📄 معاينة المستند</span>
    <button id="__btn_print" title="طباعة (Ctrl+P)">🖨️ طباعة</button>
    <button id="__btn_pdf" title="تحميل PDF">⬇️ تحميل PDF</button>
    <button id="__btn_wa_pdf" title="مشاركة PDF عبر واتساب">📱 واتساب PDF</button>
    <button id="__btn_link_online" title="إنشاء رابط معاينة للعميل">🔗 رابط للعميل</button>
    <button id="__btn_wa_text" title="مشاركة نصياً عبر واتساب">💬 واتساب نص</button>
    <button id="__btn_toggle_vis" aria-expanded="false" title="إظهار خيارات تخصيص الرؤية">👁️ تخصيص الرؤية</button>
    <button id="__btn_close" class="close" title="إغلاق">✕</button>
  </div>
  <div class="divider"></div>
  <div class="row" id="__lov_visibility_row">
    <!-- يُملأ ديناميكياً -->
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
(function(){
  function getMeta(name){
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? (m.getAttribute('content') || '') : '';
  }
  function getDocTitle(){
    var t = document.title || "document";
    return t.replace(/[^\\w\\u0600-\\u06FF\\-_. ]+/g, "").trim() || "document";
  }

  // ===== Visibility toggles per section (saved in localStorage per-user & per-doc-kind) =====
  function getUserKey(){
    var m = document.querySelector('meta[name="lov-print-user"]');
    return (m && m.getAttribute('content')) || 'anon';
  }
  function getDocKind(){
    // نستخرج "نوع المستند" من العنوان (قبل أول " - " أو "|")
    var t = (document.title || 'document').split(/\\s+[-|]\\s+/)[0].trim();
    return t.replace(/[^\\w\\u0600-\\u06FF]+/g, '_').slice(0, 40) || 'doc';
  }
  // مفتاح الحفظ خاص بكل مستند على حدة (فاتورة/عرض سعر) حتى لا تتأثر التقارير الأخرى.
  // يسقط إلى مستوى نوع المستند إن لم يتوفر معرّف.
  var DOC_ID = getMeta('lov-doc-id');
  var STORAGE_KEY = '__lov_print_visibility__:' + getUserKey() + ':' + getDocKind()
    + (DOC_ID ? (':' + DOC_ID) : '');
  function loadPrefs(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }
  function savePrefs(p){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch(e){}
  }
  var prefs = loadPrefs();

  function applyHidden(section, hidden){
    var nodes = document.querySelectorAll('[data-section="' + section + '"]');
    nodes.forEach(function(n){
      if (hidden) n.classList.add('__lov_hidden');
      else n.classList.remove('__lov_hidden');
    });
  }

  function buildVisibilityButtons(){
    var row = document.getElementById('__lov_visibility_row');
    if (!row) return;
    var seen = {};
    var seenLabel = {};
    var sections = [];
    document.querySelectorAll('[data-section]').forEach(function(el){
      var key = el.getAttribute('data-section');
      if (!key || seen[key]) return;
      var label = el.getAttribute('data-section-label') || key;
      // قسمان بنفس العنوان زرّان لا يفرّق بينهما أحد — «رصيد العميل الحالي»
      // كان يظهر مرّتين لأن الخلية داخل الصف تحمل عنوانه نفسه. الأوّل يفوز،
      // وهو الأب في كل الحالات القائمة فإخفاؤه يُخفي ما بداخله.
      if (seenLabel[label]) return;
      seen[key] = true;
      seenLabel[label] = true;
      sections.push({ key: key, label: label });
    });
    sections.forEach(function(s){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-toggle-section', s.key);
      var hidden = !!prefs[s.key];
      btn.className = hidden ? 'toggle-off' : '';
      btn.innerHTML = (hidden ? '🚫 ' : '👁️ ') + s.label;
      btn.title = hidden ? 'إظهار: ' + s.label : 'إخفاء: ' + s.label;
      btn.onclick = function(){
        var nowHidden = !btn.classList.contains('toggle-off');
        if (nowHidden) {
          btn.classList.add('toggle-off');
          btn.innerHTML = '🚫 ' + s.label;
          btn.title = 'إظهار: ' + s.label;
          prefs[s.key] = true;
        } else {
          btn.classList.remove('toggle-off');
          btn.innerHTML = '👁️ ' + s.label;
          btn.title = 'إخفاء: ' + s.label;
          delete prefs[s.key];
        }
        applyHidden(s.key, nowHidden);
        savePrefs(prefs);
      };
      row.appendChild(btn);
      applyHidden(s.key, hidden);
    });
  }
  buildVisibilityButtons();

  // ===== الشريط والهاتف =====
  // كان الحشو رقماً ثابتاً (96px) بينما يلتفّ الشريط على الهاتف إلى عدّة
  // أسطر يتجاوز مجموعها نصف الشاشة، فيختفي المستند خلفه تماماً. الحشو الآن
  // يتبع الارتفاع الفعلي، ويُعاد قياسه عند كل تغيّر (طيّ، دوران، تغيّر عرض).
  var toolbarEl = document.getElementById('__lov_print_toolbar');
  var visBtn = document.getElementById('__btn_toggle_vis');

  function syncBarHeight(){
    if (!toolbarEl) return;
    document.body.style.paddingTop = Math.ceil(toolbarEl.getBoundingClientRect().height) + 'px';
  }

  function setVisRowOpen(open){
    if (!toolbarEl || !visBtn) return;
    toolbarEl.classList.toggle('collapsed', !open);
    visBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    visBtn.title = open ? 'إخفاء خيارات تخصيص الرؤية' : 'إظهار خيارات تخصيص الرؤية';
    syncBarHeight();
  }

  // مطويّ على الشاشات الضيّقة، مفتوح على الشاشة الواسعة حيث لا يزاحم شيئاً.
  setVisRowOpen(window.innerWidth > 640);
  if (visBtn) {
    visBtn.onclick = function(){
      setVisRowOpen(toolbarEl.classList.contains('collapsed'));
    };
  }

  syncBarHeight();
  window.addEventListener('resize', syncBarHeight);
  window.addEventListener('orientationchange', syncBarHeight);
  if (window.ResizeObserver && toolbarEl) {
    new ResizeObserver(syncBarHeight).observe(toolbarEl);
  }

  function contentEl(){
    // كل ما عدا شريط الأدوات + استبعاد الأقسام المخفية حالياً
    var clone = document.body.cloneNode(true);
    // حشو الشريط يُزال من النسخة: الشريط نفسه محذوف منها، فبقاء حشوه يفتح
    // فراغاً بارتفاعه في أعلى صفحة الـPDF.
    clone.style.paddingTop = '0';
    // إطارُ الورقة على الشاشة (أرضية رمادية، ظِلّ، هامش 10mm) تنسيقُ عرضٍ لا
    // يدخل الـPDF: html2canvas يصوّر بوسيط screen، فلولا إزالته لخرج الملف
    // بأرضيةٍ رمادية وبهامشٍ مضاعَف — هامش الورقة فوق هامش html2pdf.
    clone.style.background = '#fff';
    clone.style.padding = '0';
    var pg = clone.querySelector('.page');
    if (pg) {
      pg.style.width = 'auto';
      pg.style.maxWidth = 'none';
      pg.style.minHeight = '0';
      pg.style.padding = '0';
      pg.style.boxShadow = 'none';
      // تصغيرُ الملاءمة للشاشة الضيّقة لا يدخل الـPDF: الورقة تُصوَّر بمقاسها
      // كاملاً ثم يقسّمها html2pdf على A4. ولولا هذا لخرج الملف من الهاتف
      // بنصف حجم خطّه — ورقةٌ تُقرأ على الشاشة ولا تُقرأ مطبوعة.
      pg.style.zoom = '1';
    }
    var bar = clone.querySelector('#__lov_print_toolbar');
    if (bar) bar.remove();
    clone.querySelectorAll('.__lov_hidden').forEach(function(n){ n.remove(); });
    /*
     * ترقيمُ المعاينة لا يدخل الـPDF.
     *
     * أشرطةُ «1 من 2» وفواصلُها تنسيقُ **شاشة**: مخفيّةٌ في وسط الطباعة
     * (‎@media print) — وهذا يكفي زرَّ الطباعة ولا يكفي هذا الزرّ. فالمصوِّرُ
     * يرسم بوسيط screen لا print، فتخرج الأشرطةُ مرسومةً في الملفّ ويخرج
     * معها فراغُ الفاصل.
     *
     * وأثرُها مضاعف: html2pdf يقسّم الملفّ على A4 بحدوده هو، فترقيمُ الشاشة
     * يقع في مواضعَ لا تطابق تلك الحدود — «1 من 2» في وسط صفحة، وفراغٌ
     * ثلاثون بكسلاً حيث لا فاصل. قِيس: ورقةُ أربعين بنداً كانت تخرج بشريطين
     * وفاصلٍ مرسومين في ملفّ العميل.
     *
     * فتُنزع من النسخة كما يُنزع الشريطُ والأقسامُ المخفيّة — وصفحاتُ الملفّ
     * حقيقيةٌ يقسّمها html2pdf، فلا يحتاج ترقيمَ الشاشة أصلاً.
     */
    clone.querySelectorAll('.lov-pgbreak, .lov-pgfoot').forEach(function(n){ n.remove(); });
    var wrap = document.createElement('div');
    wrap.appendChild(clone);
    return wrap;
  }
  ${PDF_SCALE_INLINE_JS}
  function genPdfBlob(){
    var el = contentEl();
    var opt = {
      margin: 8,
      filename: buildDocFileName(),
      image: { type: 'jpeg', quality: 0.95 },
      // الدقّة من حجم الورقة لا رقماً ثابتاً: الثابتة تتجاوز سقف لوحة الرسم
      // في المستند الطويل فيخرج الملف فارغاً. راجع pdfCanvasScale.
      html2canvas: { scale: __lovPdfScale(el.scrollWidth, el.scrollHeight), useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    return window.html2pdf().set(opt).from(el).outputPdf('blob');
  }
  function getCustomWaText(){
    var m = document.querySelector('meta[name="lov-wa-text"]');
    var v = m ? (m.getAttribute('content') || '').trim() : '';
    return v || '';
  }
  function getWaPhone(){
    var m = document.querySelector('meta[name="lov-wa-phone"]');
    var v = m ? (m.getAttribute('content') || '').trim() : '';
    if (!v) return '';
    // 1) حوّل الأرقام العربية الشرقية والفارسية إلى لاتينية
    var map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    v = v.replace(/[٠-٩۰-۹]/g, function(d){ return map[d] || d; });
    // 2) احتفظ بالأرقام و '+' فقط
    var hasPlus = v.indexOf('+') !== -1;
    var digits = v.replace(/[^0-9]/g, '');
    if (!digits) return '';
    // 3) صيغة دولية بدون '+': أزل '00' البادئة، وحوّل '0' المحلية لرمز الدولة الافتراضي
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    else if (!hasPlus && digits.charAt(0) === '0') digits = '249' + digits.slice(1);
    return digits;
  }
  function getSummaryText(){
    var custom = getCustomWaText();
    if (custom) return custom;
    var docLabel    = getMeta('lov-doc-label')    || getDocTitle();
    var docNumber   = getMeta('lov-doc-number');
    var customerNm  = getMeta('lov-customer-name');
    var totalEl     = document.querySelector('[data-print-total]');
    var totalTxt    = totalEl ? totalEl.textContent.trim() : '';

    var greeting = customerNm
      ? ('مرحباً ' + customerNm + ' 👋')
      : 'مرحباً 👋';

    var docLine = '📄 ' + docLabel + (docNumber ? (' رقم: ' + docNumber) : '');

    var lines = [greeting, '', docLine];
    if (totalTxt) lines.push('💰 الإجمالي: ' + totalTxt);
    lines.push('', 'شكراً لتعاملكم معنا 🙏');
    return lines.join('\\n');
  }
  function normalizeArabic(s){
    try { return (s || '').normalize('NFC'); } catch(e){ return s || ''; }
  }
  function buildWaDeepLink(text){
    var phone = getWaPhone();
    var t = normalizeArabic(String(text || ''));
    if (phone) return 'whatsapp://send?phone=' + phone + '&text=' + encodeURIComponent(t);
    return 'whatsapp://send?text=' + encodeURIComponent(t);
  }
  function buildWaWebFallback(text){
    var phone = getWaPhone();
    var t = normalizeArabic(String(text || ''));
    if (phone) return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(t);
    return 'https://wa.me/?text=' + encodeURIComponent(t);
  }
  function openWa(text){
    var deep = buildWaDeepLink(text);
    var web = buildWaWebFallback(text);
    var fellBack = false;
    function onHide(){ fellBack = true; }
    document.addEventListener('visibilitychange', onHide, { once: true });
    window.addEventListener('pagehide', onHide, { once: true });
    window.addEventListener('blur', onHide, { once: true });
    try { window.location.href = deep; } catch(e){}
    setTimeout(function(){
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onHide);
      if (!fellBack && document.visibilityState === 'visible') {
        window.open(web, '_blank');
      }
    }, 1500);
  }
  // Backwards compat (kept in case templates reference it)
  function buildWaUrl(text){ return buildWaDeepLink(text); }

  document.getElementById('__btn_print').onclick = function(){ window.print(); };

  document.getElementById('__btn_pdf').onclick = async function(){
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ جاري...';
    try {
      var blob = await genPdfBlob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = buildDocFileName();
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch(e){ alert('فشل توليد PDF: ' + e.message); }
    btn.disabled = false; btn.textContent = old;
  };

  // اسم ملف موحّد لكل مخارج الـPDF (تنزيل + واتساب): «اسم العميل - المبلغ».
  // نفس قاعدة buildDocumentFileName في documentFileName.ts — ولهذا التطابق
  // اختبارٌ يقارن المسارين، فهما نسختان لا مفرّ منهما: هذه تعيش داخل الورقة.
  function buildDocFileName(){
    // حوّل الأرقام العربية/الفارسية إلى لاتينية
    var digitMap = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                     '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    function clean(s){
      s = (s || '').trim();
      // اعتبر القيم النائبة فارغة
      if (!s || s === '-' || s === '—' || s === '_' || s === 'undefined' || s === 'null') return '';
      // تحويل أرقام
      s = s.replace(/[٠-٩۰-۹]/g, function(d){ return digitMap[d] || d; });
      // إزالة الأحرف غير المسموحة في أسماء الملفات (Windows/Mac/Linux)
      s = s.replace(/[\\\\/:*?"<>|\\r\\n\\t]+/g, ' ').replace(/\\s+/g, ' ').trim();
      return s;
    }
    var docLabel   = clean(getMeta('lov-doc-label'));
    var customerNm = clean(getMeta('lov-customer-name'));
    // مبلغ المستند بفواصل الآلاف — يصل الملف للعميل باسمه ومبلغه
    var docTotal   = clean(getMeta('lov-doc-total'));
    if (docTotal) {
      var n = Number(docTotal);
      docTotal = isFinite(n) && n > 0 ? n.toLocaleString('en-US') : '';
    }

    // النوع والرقم يبقيان في الورقة وفي meta — ولا يدخلان اسم الملف.
    // فالمطلوب: «إسم العميل ومبلغ الفاتورة فقط».
    if (!docLabel) docLabel = clean(getDocTitle()) || 'مستند';

    var parts = [];
    if (customerNm) parts.push(customerNm);
    if (docTotal) parts.push(docTotal);
    var name = parts.join(' - ').trim();
    // بلا عميلٍ ولا مبلغ: نوع المستند خيرٌ من اسمٍ عامّ لا يدلّ على شيء
    if (!name) name = docLabel;
    if (!name) name = 'document';

    // تقليم الطول لتجنّب حدود نظام الملفات (~120 محرف للاسم)
    if (name.length > 120) name = name.slice(0, 120).trim();

    return name + '.pdf';
  }
  function buildDocFileNameExt(ext){
    var n = buildDocFileName();
    // استبدل امتداد .pdf الافتراضي بالامتداد المطلوب
    n = n.replace(/\\.pdf$/i, '');
    return n + '.' + ext;
  }
  function loadHtml2CanvasIfNeeded(){
    // 1) موجود على window (تحميل مسبق)
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    // 2) موجود ضمن html2pdf.bundle
    if (window.html2pdf && window.html2pdf.html2canvas) {
      window.html2canvas = window.html2pdf.html2canvas;
      return Promise.resolve(window.html2canvas);
    }
    // 3) حمّل html2canvas مستقلاً من CDN
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function(){
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error('html2canvas لم يتحمَّل بشكل صحيح'));
      };
      s.onerror = function(){ reject(new Error('فشل تحميل مكتبة الصور')); };
      document.head.appendChild(s);
    });
  }
  function genImgBlob(){
    return loadHtml2CanvasIfNeeded().then(function(){
      var el = contentEl();
      // ارفقه مؤقتاً خارج الشاشة حتى يُرسم
      el.style.position = 'fixed';
      el.style.left = '-99999px';
      el.style.top = '0';
      el.style.background = '#fff';
      document.body.appendChild(el);
      return window.html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
        .then(function(canvas){
          document.body.removeChild(el);
          return new Promise(function(res){ canvas.toBlob(function(b){ res(b); }, 'image/png', 0.95); });
        }).catch(function(e){
          if (el.parentNode) el.parentNode.removeChild(el);
          throw e;
        });
    });
  }
  function genHtmlBlob(){
    // ابنِ مستند HTML مستقل قابل للفتح في أي متصفح
    var clone = document.documentElement.cloneNode(true);
    var bar = clone.querySelector('#__lov_print_toolbar');
    if (bar) bar.remove();
    clone.querySelectorAll('.__lov_hidden').forEach(function(n){ n.remove(); });
    // وترقيمُ المعاينة كذلك: السكربتُ منزوعٌ أدناه فلا يُعاد حسابُه، فتبقى
    // الأشرطةُ مجمَّدةً على مقاسِ شاشةٍ واحدة. راجع contentEl.
    clone.querySelectorAll('.lov-pgbreak, .lov-pgfoot').forEach(function(n){ n.remove(); });
    // أزل السكربتات لأنها غير لازمة للعرض الثابت
    clone.querySelectorAll('script').forEach(function(n){ n.remove(); });
    var html = '<!doctype html>\\n' + clone.outerHTML;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }
  async function shareBlobOnly(blob, fileName, mime){
    var file = new File([blob], fileName, { type: mime });
    var canShareFiles = false;
    try {
      canShareFiles = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    } catch(e){ canShareFiles = false; }
    if (canShareFiles) {
      try { await navigator.share({ files: [file] }); return true; }
      catch(e){ if (e && e.name === 'AbortError') return true; }
    }
    // مسار احتياطي: نزّل الملف + افتح واتساب بدون نص
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
    openWa('');
    return true;
  }

  document.getElementById('__btn_wa_pdf').onclick = async function(){
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ جاري...';
    try {
      var blob = await genPdfBlob();
      var fileName = buildDocFileName();
      var file = new File([blob], fileName, { type: 'application/pdf' });

      // مشاركة الملف فقط بدون أي نص — المستخدم يختار جهة الاتصال
      var canShareFiles = false;
      try {
        canShareFiles = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
      } catch(e){ canShareFiles = false; }

      if (canShareFiles) {
        try {
          await navigator.share({ files: [file] });
          btn.disabled = false; btn.textContent = old;
          return;
        } catch(e){
          if (e && e.name === 'AbortError') {
            btn.disabled = false; btn.textContent = old;
            return;
          }
        }
      }

      // مسار احتياطي (متصفح قديم بلا Web Share): نزّل الملف + افتح واتساب بدون نص
      var url2 = URL.createObjectURL(blob);
      var a2 = document.createElement('a');
      a2.href = url2; a2.download = fileName;
      document.body.appendChild(a2); a2.click();
      setTimeout(function(){ URL.revokeObjectURL(url2); a2.remove(); }, 1000);
      openWa('');
    } catch(e){
      if (e && e.name !== 'AbortError') alert('فشل مشاركة PDF: ' + (e.message || e));
    }
    btn.disabled = false; btn.textContent = old;
  };


  document.getElementById('__btn_link_online').onclick = async function(){
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ جاري...';
    try {
      var docId   = getMeta('lov-doc-id');
      var docKind = getMeta('lov-doc-share-type');
      if (!docId || !docKind) throw new Error('لا يمكن إنشاء رابط لهذا المستند');

      var phone = getWaPhone();
      var customerNm = getMeta('lov-customer-name');

      // اطلب من النافذة الأم (React) أن تنشئ التوكن وتفتح واتساب
      // (الـ iframe بـ srcDoc له origin="null" ولا يستطيع الـ fetch مباشرة)
      var reqId = 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);

      // اجمع قائمة الأقسام المخفية حالياً (من إعدادات الرؤية في شريط الأدوات)
      // لكي تنتقل نفس الإعدادات إلى صفحة معاينة العميل عند فتح الرابط.
      var hiddenSections = [];
      try {
        Object.keys(prefs).forEach(function(k){
          if (prefs[k]) hiddenSections.push(k);
        });
      } catch(e) {}

      var done = false;
      var onResp = function(ev){
        var d = ev.data;
        if (!d || d.type !== 'lov-link-online-result' || d.reqId !== reqId) return;
        done = true;
        window.removeEventListener('message', onResp);
        if (!d.ok) {
          alert('فشل إنشاء الرابط: ' + (d.error || 'خطأ غير معروف'));
        }
        btn.disabled = false; btn.textContent = old;
      };
      window.addEventListener('message', onResp);
      window.parent.postMessage({
        type: 'lov-link-online-request',
        reqId: reqId,
        docType: docKind,
        docId: docId,
        phone: phone,
        customerName: customerNm,
        hiddenSections: hiddenSections
      }, '*');

      // مهلة 20 ثانية
      setTimeout(function(){
        if (done) return;
        window.removeEventListener('message', onResp);
        alert('فشل إنشاء الرابط: انتهت المهلة');
        btn.disabled = false; btn.textContent = old;
      }, 20000);
    } catch(e){
      alert('فشل إنشاء الرابط: ' + (e.message || e));
      btn.disabled = false; btn.textContent = old;
    }
  };

  document.getElementById('__btn_wa_text').onclick = function(){
    openWa(getSummaryText());
  };

  document.getElementById('__btn_close').onclick = function(){
    if (${inline ? "true" : "false"}) {
      try { window.parent.postMessage({ type: 'lov-preview-close' }, '*'); } catch(e){}
    } else {
      window.close();
    }
  };
})();
</script>
`;

  // نحقن قبل </body>
  const finalHtml = html.includes("</body>")
    ? html.replace("</body>", toolbarHTML + "</body>")
    : html + toolbarHTML;

  return finalHtml;
}

/**
 * يفتح نافذة منبثقة بالمستند + شريط أدوات المعاينة. (السلوك القديم — يبقى للتوافق.)
 */
export function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const finalHtml = buildPrintWindowHtml(html, false);
  win.document.write(finalHtml);
  win.document.close();
}

