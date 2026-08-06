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
import { neutralizeSheetFrame, stripScreenOnlyCss, SHEET_WIDTH_PX } from "@/utils/pdfSheetFrame";
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
  /** يُسلَّم إلى html2pdf — ساكنٌ بلا إزاحة */
  sheet: HTMLElement;
}

function mountOffscreen(html: string): MountedSheet {
  // بعيداً عن الشاشة لا `display:none`: المخفي بلا أبعاد يُنتج صفحة فارغة
  const outer = document.createElement("div");
  outer.style.cssText = `position:fixed;left:-10000px;top:0;width:${SHEET_WIDTH_PX}px;`;

  const sheet = document.createElement("div");
  sheet.style.cssText = `width:${SHEET_WIDTH_PX}px;background:#fff;`;

  const doc = new DOMParser().parseFromString(html, "text/html");
  sheet.innerHTML = doc.body.innerHTML;
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    const copy = style.cloneNode(true) as HTMLStyleElement;
    // إطارُ الشاشة لا يدخل الورق، ولا يُلبَس لعناصر التطبيق أثناء التوليد.
    // راجع `pdfSheetFrame`.
    copy.textContent = stripScreenOnlyCss(copy.textContent || "");
    sheet.appendChild(copy);
  }
  outer.appendChild(sheet);
  document.body.appendChild(outer);
  // بعد الإلحاق: الإعلانات السطرية تغلب ما بقي من أنماطٍ في القالب الآخر.
  neutralizeSheetFrame(sheet);
  return { outer, sheet };
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

export async function buildPdfBlob(html: string): Promise<Blob> {
  const { outer, sheet } = mountOffscreen(html);
  try {
    await waitForImages(sheet);
    const html2pdf = (await import("html2pdf.js")).default;
    // `sheet` لا `outer`: المزاحُ يخرج مرسومه من الحاوية المصوَّرة. راجع أعلاه.
    return await html2pdf()
      .set({
        margin: 8,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: pdfScaleForElement(sheet),
          useCORS: true,
          logging: false,
          /**
           * نافذةُ الاستنساخ بعرض الورقة لا بعرض شاشة الجهاز.
           *
           * html2canvas يستنسخ المستند في إطارٍ بعرض `window.innerWidth`.
           * فعلى هاتفٍ أضيق من الورقة تُخطَّط الورقةُ في إطارٍ ضيّق فتفيض
           * منه — وفي RTL يكون الفيضان يساراً بإحداثيّاتٍ سالبة خارج المنطقة
           * المصوَّرة، فيخرج عمودُ «الإجمالي» والتاريخُ ورقمُ الفاتورة
           * مقصوصةً. راجع `SHEET_WIDTH_PX`.
           *
           * وهو أسرعُ أيضاً: التخطيطُ يقع مرّةً بمقاسٍ صحيح لا مرّتين.
           */
          windowWidth: SHEET_WIDTH_PX,
          width: SHEET_WIDTH_PX,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      } as any)
      .from(sheet)
      .outputPdf("blob");
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
