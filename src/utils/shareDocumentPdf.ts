/**
 * توليد PDF من HTML الطباعة ومشاركته عبر واتساب — من أي شاشة، محفوظاً كان
 * المستند أو لا.
 *
 * ## لماذا ثلاثة مسارات
 * لا يوجد مسار واحد يعمل على كل الأجهزة:
 *   1. **جوال يدعم مشاركة الملفات** (`navigator.canShare({files})`): يُرسل الملف
 *      نفسه إلى واتساب — أفضل تجربة، والاسم يأتي من `File.name`.
 *   2. **جوال/متصفّح بلا دعم مشاركة الملفات**: يُنزَّل الملف ثم يُفتح واتساب
 *      بالنص، ويُرفق المستخدم الملف بنفسه. الاسم يأتي من `a.download`.
 *   3. **سطح المكتب**: تنزيل + فتح واتساب ويب.
 *
 * **الاسم واحد في المسارات الثلاثة** لأنه يُبنى مرّة من `buildDocumentFileName`
 * ويُمرَّر إلى `File.name` و`a.download` معاً. لو بُني في كل فرع على حدة
 * لاختلف بين جهاز وآخر — وهو ما يجعل العميل يستقبل ملفاً باسم مختلف حسب هاتف
 * المُرسِل. اختبار في `shareDocumentPdf.test.ts` يقارن الفروع الثلاثة.
 */
import { buildDocumentFileName } from "@/utils/documentFileName";
import { pdfScaleForElement } from "@/utils/pdfCanvasScale";
import {
  neutralizeSheetFrame,
  stripScreenOnlyCss,
  onlySheetStyles,
  SHEET_WIDTH_PX,
  SHEET_STYLE_ATTR,
} from "@/utils/pdfSheetFrame";
import { planPages, pageHeights, A4_MM } from "@/utils/sheetPagePlan";
import { buildWhatsAppDeepLink } from "@/utils/whatsapp";

export interface SharePdfInput {
  /** HTML كامل من `generatePrintHTML` */
  html: string;
  docLabel: string;
  customerName?: string | null;
  docNumber?: string | null;
  total?: number | null;
  /** نصّ الرسالة المرافقة */
  message?: string;
  /** رقم واتساب العميل — يُفتح بلا مُرسَل إن غاب */
  phone?: string | null;
}

export type ShareOutcome =
  | { via: "web-share"; fileName: string }
  | { via: "download"; fileName: string };

/** يبني اسم الملف — نقطة واحدة يقرأ منها كل فرع. */
export function pdfNameFor(input: SharePdfInput): string {
  return buildDocumentFileName({
    docLabel: input.docLabel,
    customerName: input.customerName,
    docNumber: input.docNumber,
    total: input.total,
  });
}

/**
 * حاوية مخفية خارج الشاشة — html2pdf يحتاج عنصراً مُلحقاً بالمستند فعلاً.
 *
 * ## غلافان لا غلافٌ واحد: الإزاحةُ خارجاً والورقةُ داخلاً
 *
 * كان الغلافُ واحداً يحمل الإزاحة والورقة معاً:
 *
 *     position: fixed; left: -10000px; ...
 *
 * ويُسلَّم إلى html2pdf كما هو. و`toContainer` في html2pdf يستنسخ ما يُعطى
 * ثمّ يفرض عليه سطراً واحداً:
 *
 *     container.firstChild.style.position = 'relative';
 *
 * فيبطل `fixed` ويبقى `left: -10000px` — و`left` تحت `relative` **إزاحةٌ
 * فعلية** لا تموضعٌ مطلق. فتنزاح الورقةُ المرسومة عشرةَ آلاف بكسلٍ يساراً
 * خارج الحاوية التي يصوّرها html2canvas، فيخرج الملفُّ **صفحةً بيضاء**:
 * صفحةٌ واحدة بلا صورةٍ أصلاً — لا `/Subtype /Image` فيها ولا علامةُ JPEG.
 *
 * وأثرُه لا يظهر في المعاينة لأن شريط الأدوات داخل الورقة يُسلّم html2pdf
 * غلافاً ساكناً (`contentEl`) لا مزاحاً.
 *
 * فصار الغلافُ الخارجيُّ يحمل الإزاحة وحدها، والداخليُّ ساكنٌ يحمل الورقة —
 * وهو ما يُسلَّم إلى html2pdf. فلا إزاحةَ تنجو إلى الاستنساخ.
 *
 * وقيس الفرق: 3,058 بايت بلا صورة ← 382,783 بايت بصورةٍ مُضمَّنة.
 */
interface MountedSheet {
  /** يُزال بعد التوليد */
  outer: HTMLElement;
  /** يُسلَّم إلى html2canvas — ساكنٌ بلا إزاحة */
  sheet: HTMLElement;
}

/**
 * ## ولماذا إطارٌ لا عنصرٌ في صفحة التطبيق
 *
 * html2canvas **يستنسخ المستند كلَّه** لا العنصر وحده: يبني إطاراً ويكتب فيه
 * نسخةً من `documentElement` بأنماطه، ثمّ يرسم منها. فحين تُركَّب الورقة في
 * صفحة التطبيق يُستنسخ التطبيقُ كلُّه معها — شجرتُه وTailwind وما بُني عليه —
 * ثمّ يُنقّى بـ`onclone`، بعد أن دُفع ثمنُ النسخ كاملاً.
 *
 * قِيس على مضيفٍ بأربعمئة عنصر (كصفحةٍ حقيقية):
 *
 *     المستند   في صفحة التطبيق   في إطارٍ معزول
 *     11 بنداً        915ms            269ms
 *     30 بنداً        772ms            370ms
 *     60 بنداً       1024ms            583ms
 *     100 بند       1370ms            863ms
 *
 * فالإطارُ يوفّر بين 40% و60% من زمن التصوير — وهو ثلثا زمن التوليد كلِّه.
 *
 * وربحٌ ثانٍ لا يقلّ: العزلُ يصير **بنيوياً لا تنقيةً**. ثلاثةُ أعطالٍ سابقة
 * خرجت من تسرّب أنماط التطبيق إلى الورقة المصوَّرة؛ وفي مستندٍ لا يحوي إلا
 * الورقة لا يوجد ما يتسرّب.
 *
 * ### والسكربتات تُنزع قبل الكتابة
 * `document.write` **يُشغّل** السكربتات — بخلاف `innerHTML`. وفي الورقة سكربتُ
 * ترقيم الصفحات، فلو عمل لأضاف فواصلَ الصفحات وأطالها: قِيس 2184 ← 3774 من
 * ارتفاع اللوحة. والملفُّ يُقطَّع بحسابه هو، فالفواصلُ فيه ازدواجٌ لا فائدة له.
 */
function mountOffscreen(html: string): MountedSheet {
  // بعيداً عن الشاشة لا `display:none`: المخفي بلا أبعاد يُنتج صفحة فارغة
  const outer = document.createElement("iframe");
  outer.setAttribute("aria-hidden", "true");
  outer.setAttribute("tabindex", "-1");
  outer.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${SHEET_WIDTH_PX}px;height:${SHEET_WIDTH_PX}px;border:0;`;
  document.body.appendChild(outer);

  const fdoc = outer.contentDocument;
  if (!fdoc) {
    outer.remove();
    throw new Error("تعذّر تجهيز إطار التوليد");
  }

  // نزعُ السكربتات قبل الكتابة — راجع أعلاه
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script").forEach((s) => s.remove());
  for (const style of Array.from(parsed.querySelectorAll("style"))) {
    // إطارُ الشاشة لا يدخل الورق. راجع `pdfSheetFrame`.
    style.textContent = stripScreenOnlyCss(style.textContent || "");
    style.setAttribute(SHEET_STYLE_ATTR, "");
  }

  /*
   * الاستيرادُ لا `document.write`: الأخيرةُ تُشغّل السكربتات (وقد نُزعت
   * أصلاً)، ولا يدعمها jsdom فتخرج الورقةُ فارغةً في الاختبار — فلا يبقى
   * حارسٌ يقرأ محتواها. والاستيرادُ يبني نفسَ الشجرة في المستندين معاً.
   */
  fdoc.replaceChild(fdoc.importNode(parsed.documentElement, true), fdoc.documentElement);

  const sheet = fdoc.body;
  sheet.style.cssText = `margin:0;padding:0;width:${SHEET_WIDTH_PX}px;background:#fff;`;
  // بعد الكتابة: الإعلانات السطرية تغلب ما بقي من أنماطٍ في القالب الآخر.
  neutralizeSheetFrame(sheet);
  // الإطارُ بطول محتواه: مستندٌ أقصرُ من ورقته يخطّط بعضَ ما فيه بمقاسٍ آخر
  outer.style.height = `${Math.max(SHEET_WIDTH_PX, Math.ceil(sheet.scrollHeight))}px`;
  return { outer: outer as unknown as HTMLElement, sheet };
}

/**
 * مهلةُ انتظار الصور — بعدها يُولَّد الملف بما تحمّل.
 *
 * الانتظارُ بلا مهلة يعلّق الزرّ إلى الأبد: طلبٌ لا يُجيب ولا يفشل (شبكةٌ
 * بطيئة، أو شعارٌ من نطاقٍ محجوب) لا يُطلق `load` ولا `error`، فيبقى الوعد
 * معلّقاً ويبقى الزرّ «جاري التجهيز...» بلا نهاية ولا رسالة.
 *
 * وشعارٌ ناقصٌ أهون من زرٍّ لا يستجيب.
 */
export const IMAGE_WAIT_MS = 4000;

/**
 * جودةُ ترميز JPEG لصفحات الملف.
 *
 * تُشارَك هذه الملفّات على الواتساب من الهاتف، فحجمُها زمنُ انتظارٍ للمرسِل
 * وللعميل معاً. وبين 0.95 و0.90 لا فرقَ يُرى في نصٍّ مصوَّرٍ بضعفَي الدقّة —
 * وبينهما في فاتورة الستّين بنداً نحو 15% من حجم الملف.
 *
 * ولا تنزل أكثر: الورقةُ نصٌّ دقيق، والضغطُ الزائد يُهدّب حروفها.
 */
export const JPEG_QUALITY = 0.9;

/** ينتظر تحميل الصور حتى لا يخرج الشعار فارغاً في PDF. */
export async function waitForImages(root: HTMLElement, timeoutMs = IMAGE_WAIT_MS): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  if (imgs.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((res) => {
    timer = setTimeout(res, timeoutMs);
  });
  const all = Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((res) => {
          img.onload = img.onerror = () => res();
        }),
    ),
  ).then(() => undefined);
  try {
    await Promise.race([all, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * العناصرُ التي لا يُشطر جسمُها بين صفحتين — تُجمع مواضعُ رؤوسها حدوداً
 * للقطع. صفُّ بندٍ منشطرٌ نصفين أقبحُ من فراغٍ في ذيل الصفحة.
 *
 * ومربّعُ الحساب فيها **بجملته لا بصفوفه**: هو جدول، فكلُّ `tr` منه حدُّ قطعٍ
 * مستحسن — فوقع القطعُ بين صفوفه، وخرجت الصفحةُ الأولى بأربعةٍ منه وذهب
 * «رصيد العميل الحالي» وحده إلى الثانية. وهو الرقمُ الذي جاء العميل لأجله.
 *
 * فمنعُ القسمة يقع في موضعين: قاعدةٌ في القالب (`page-break-inside: avoid`)
 * لمسار الطباعة، وإسقاطُ حدود صفوفه من قائمة القطع هنا — في `safeBreaks`
 * أسفله — لمسار الـPDF.
 */
const UNSPLITTABLE = "tr, .extra-box, .account-box, .signatures, [data-pkg-rows], [data-pkg-line], .notes-section";

/** عناصرُ لا يُقطع **داخلها** — فتُسقط حدودُ ما بداخلها من قائمة القطع. */
const ATOMIC = ".account-box";

/** مواضعُ القطع المستحسنة داخل الورقة، بالبكسل المصوَّر. */
function safeBreaks(sheet: HTMLElement, scale: number): number[] {
  const top = sheet.getBoundingClientRect().top;
  const out: number[] = [];
  for (const el of Array.from(sheet.querySelectorAll<HTMLElement>(UNSPLITTABLE))) {
    const y = (el.getBoundingClientRect().top - top) * scale;
    if (y > 0) out.push(Math.round(y));
  }
  /*
   * حدودُ ما بداخل العنصر الذرّي تُسقط: رأسُه وحده حدُّ قطع، وما بين صفوفه
   * ليس كذلك. وإلا قُطع المربّعُ من داخله وذهب آخرُ صفوفه إلى صفحةٍ تالية.
   */
  for (const box of Array.from(sheet.querySelectorAll<HTMLElement>(ATOMIC))) {
    const r = box.getBoundingClientRect();
    const from = (r.top - top) * scale;
    const to = (r.bottom - top) * scale;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i] > from + 1 && out[i] < to) out.splice(i, 1);
    }
  }
  return out;
}

/**
 * يبني الـPDF من الورقة — لوحةٌ واحدة ثمّ تقطيعٌ بحسابٍ معلوم.
 *
 * ## لماذا لا html2pdf
 * كان يُستعمل، فأخرج ثلاثةَ أعطالٍ متتالية كلُّها من طبقته الداخلية: يضع
 * المستنسخ في طبقةٍ `left:-100000px; right:0` ويوسّطه بـ`margin:auto`، فموضعُ
 * الحاوية يتبع عرضَ النافذة ويختلف بين المستند ونسخةِ html2canvas. فخرجت
 * صفحةٌ بيضاء، ثمّ ورقةٌ مزاحة، ثمّ ورقةٌ مقصوصةُ الحافّة — عمودُ «الإجمالي»
 * والتاريخُ ورقمُ الفاتورة.
 *
 * وثبت بالقياس أن html2canvas وحده **يصوّر الورقة صحيحةً** (794×1161)، وأن
 * الخلل بعده. فحُذفت الطبقة من المسار: تُصوَّر الورقةُ مرّةً، ثمّ تُقطَّع
 * وتُركَّب في jsPDF مباشرةً.
 *
 * وبهذا يصير الناتجُ **مستقلّاً عن الصفحة المستضيفة**: لا عرضُ الجهاز يغيّره
 * ولا أنماطُ التطبيق — وهو ما يجعله يطابق المعاينة، كما طُلب.
 */
export async function buildPdfBlob(html: string): Promise<Blob> {
  const { outer, sheet } = mountOffscreen(html);
  try {
    // المكتبتان تُجلبان **مع** انتظار الصور لا بعده: كلاهما انتظارُ شبكةٍ،
    // وتسلسلُهما يجمع الزمنين بلا سبب. وأثقلُهما 590KB على أوّل توليد.
    const [, { default: html2canvas }, { jsPDF }] = await Promise.all([
      waitForImages(sheet),
      import("html2canvas"),
      import("jspdf"),
    ]);

    const scale = pdfScaleForElement(sheet);
    const canvas = await html2canvas(sheet, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      // نافذةُ الاستنساخ بعرض الورقة لا بعرض الجهاز — وإلا خُطِّطت في إطارٍ
      // أضيق منها فمالت. وأنماطُ التطبيق تُنزع: الورقة تحمل أنماطها.
      windowWidth: SHEET_WIDTH_PX,
      width: SHEET_WIDTH_PX,
      onclone: onlySheetStyles,
    } as any);

    const { width: pw, height: ph, margin } = A4_MM;
    const usableW = pw - 2 * margin;
    const usableH = ph - 2 * margin;
    // بكسلاتُ اللوحة لكل مليمترٍ على الورق
    const pxPerMm = canvas.width / usableW;
    const starts = planPages(canvas.height, usableH * pxPerMm, safeBreaks(sheet, scale));
    const heights = pageHeights(starts, canvas.height);

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const slice = document.createElement("canvas");
    const ctx = slice.getContext("2d")!;

    for (let i = 0; i < starts.length; i++) {
      const h = heights[i];
      if (h <= 0) continue;
      slice.width = canvas.width;
      slice.height = h;
      // أرضيةٌ بيضاء: الشرائح شفّافةٌ بلا رسمٍ فتخرج سوداء في JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, starts[i], canvas.width, h, 0, 0, canvas.width, h);
      if (i > 0) pdf.addPage();
      pdf.addImage(
        slice.toDataURL("image/jpeg", JPEG_QUALITY),
        "JPEG",
        margin,
        margin,
        usableW,
        h / pxPerMm,
      );
    }
    return pdf.output("blob");
  } finally {
    outer.remove();
  }
}

/** ينزّل الـblob باسمه — الفرع المشترك بين سطح المكتب والجوال بلا مشاركة. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

/**
 * يولّد الـPDF ويشاركه. يُعيد الفرع الذي سلكه واسم الملف — ليعرض المستدعي
 * رسالة مناسبة، وليتمكّن الاختبار من التحقّق من تطابق الاسم بين الفروع.
 */
export async function shareDocumentPdf(input: SharePdfInput): Promise<ShareOutcome> {
  const fileName = pdfNameFor(input);
  const blob = await buildPdfBlob(input.html);
  const file = new File([blob], fileName, { type: "application/pdf" });

  let canShareFiles = false;
  try {
    canShareFiles = !!(
      navigator.canShare &&
      navigator.share &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    canShareFiles = false;
  }

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], text: input.message || "" });
      return { via: "web-share", fileName };
    } catch (e: any) {
      // إلغاء المستخدم ليس فشلاً — لا نُنزّل الملف خلف ظهره
      if (e?.name === "AbortError") return { via: "web-share", fileName };
      // أي خطأ آخر: تابع إلى التنزيل
    }
  }

  downloadBlob(blob, fileName);
  window.open(buildWhatsAppDeepLink(input.phone, input.message || ""), "_blank");
  return { via: "download", fileName };
}
