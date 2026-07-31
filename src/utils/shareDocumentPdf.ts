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

/** حاوية مخفية خارج الشاشة — html2pdf يحتاج عنصراً مُلحقاً بالمستند فعلاً. */
function mountOffscreen(html: string): HTMLElement {
  const host = document.createElement("div");
  // بعيداً عن الشاشة لا `display:none`: المخفي بلا أبعاد يُنتج صفحة فارغة
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;";
  const doc = new DOMParser().parseFromString(html, "text/html");
  host.innerHTML = doc.body.innerHTML;
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    host.appendChild(style.cloneNode(true));
  }
  document.body.appendChild(host);
  return host;
}

/** ينتظر تحميل الصور حتى لا يخرج الشعار فارغاً في PDF. */
async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = img.onerror = () => res();
          }),
    ),
  );
}

export async function buildPdfBlob(html: string): Promise<Blob> {
  const host = mountOffscreen(html);
  try {
    await waitForImages(host);
    const html2pdf = (await import("html2pdf.js")).default;
    return await html2pdf()
      .set({
        margin: 8,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      } as any)
      .from(host)
      .outputPdf("blob");
  } finally {
    host.remove();
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
