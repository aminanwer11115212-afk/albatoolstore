// utils/errorReporter.ts
// نظام موحّد للإبلاغ عن الأخطاء الحرجة:
//  - toast قصير للأخطاء العابرة (تحقق/شبكة).
//  - Dialog مفصّل قابل للنسخ للفشل الحرج الذي يوقف تدفق العمل.
//
// الاستخدام:
//   reportCriticalError({ title: "فشل حفظ الفاتورة", error, context: "InvoiceCreatePage.saveInvoice" });
//   await runCritical("حفظ الفاتورة", async () => { ... });

import { toast } from "sonner";

export type CriticalErrorPayload = {
  title: string;
  message: string;
  details?: string;
  context?: string;
  timestamp: number;
};

export type ReportCriticalErrorInput = {
  title: string;
  error: unknown;
  context?: string;
  /** رسالة عربية بديلة إذا لم يستطع النظام استخراج رسالة مفهومة */
  fallbackMessage?: string;
};

const CRITICAL_EVENT = "lov:critical-error";

/** استخراج أفضل رسالة قابلة للعرض من أي خطأ (Supabase / Error / string). */
export function extractErrorMessage(error: unknown, fallback = "خطأ غير معروف"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  const anyErr = error as any;
  return (
    anyErr?.message ||
    anyErr?.error_description ||
    anyErr?.hint ||
    anyErr?.details ||
    anyErr?.error?.message ||
    fallback
  );
}

/** تنسيق تفاصيل تقنية للنسخ داخل الـ dialog. */
export function formatErrorDetails(error: unknown, context?: string): string {
  const anyErr = (error as any) ?? {};
  const parts: string[] = [];
  if (context) parts.push(`السياق: ${context}`);
  parts.push(`الوقت: ${new Date().toLocaleString("ar-EG")}`);
  if (anyErr.code) parts.push(`code: ${anyErr.code}`);
  if (anyErr.status) parts.push(`status: ${anyErr.status}`);
  if (anyErr.hint) parts.push(`hint: ${anyErr.hint}`);
  if (anyErr.details) parts.push(`details: ${anyErr.details}`);
  if (anyErr.stack) parts.push(`stack:\n${String(anyErr.stack).split("\n").slice(0, 6).join("\n")}`);
  else {
    try { parts.push(`raw: ${JSON.stringify(error, null, 2).slice(0, 2000)}`); } catch { /* noop */ }
  }
  return parts.join("\n");
}

/** يعرض Dialog مركزي + toast قصير. آمن للاستدعاء من أي مكان. */
export function reportCriticalError(input: ReportCriticalErrorInput): void {
  const message = extractErrorMessage(input.error, input.fallbackMessage || "فشل غير متوقع");
  const details = formatErrorDetails(input.error, input.context);
  const payload: CriticalErrorPayload = {
    title: input.title,
    message,
    details,
    context: input.context,
    timestamp: Date.now(),
  };

  // سجل في console دائماً لتشخيص المطوّر
  // eslint-disable-next-line no-console
  console.error(`[critical] ${input.title}`, input.error);

  // toast قصير — يبقى الـ dialog هو المصدر الرئيسي للتفاصيل
  try {
    toast.error(input.title, { description: message, duration: 6000 });
  } catch { /* sonner قد لا يكون جاهزاً في SSR/الاختبارات */ }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CRITICAL_EVENT, { detail: payload }));
  }
}

export function subscribeCriticalError(cb: (p: CriticalErrorPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<CriticalErrorPayload>).detail);
  window.addEventListener(CRITICAL_EVENT, handler as EventListener);
  return () => window.removeEventListener(CRITICAL_EVENT, handler as EventListener);
}

/**
 * غلاف عام: يشغّل عملية غير متزامنة ويُبلّغ عن الفشل تلقائياً كخطأ حرج.
 * يعيد النتيجة عند النجاح أو undefined عند الفشل.
 */
export async function runCritical<T>(
  title: string,
  fn: () => Promise<T>,
  opts: { context?: string; fallbackMessage?: string; rethrow?: boolean } = {}
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    reportCriticalError({
      title,
      error,
      context: opts.context,
      fallbackMessage: opts.fallbackMessage,
    });
    if (opts.rethrow) throw error;
    return undefined;
  }
}
