import { useEffect } from "react";

/**
 * useDocPrintShortcuts — اختصارات موحّدة لصفحات إنشاء المستندات:
 *   F9  → افتح صفحة معاينة الطباعة الداخلية
 *   F10 → طباعة مباشرة (تفتح المعاينة بـ autoprint=1)
 *
 * F5 يبقى للمتصفح (reload). لا نلتقطه.
 *
 * على شاشة الفواتير فقط: المستدعي هو من يعالج ترقية workflow إلى "قيد التجهيز"
 * داخل onPreview/onPrint (نمرِّر إليه الاختيار عبر الحقل `advanceWorkflow`).
 */
export function useDocPrintShortcuts(opts: {
  enabled?: boolean;
  onPreview: () => void | Promise<void>;
  onPrint: () => void | Promise<void>;
}) {
  const { enabled = true, onPreview, onPrint } = opts;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F9") {
        e.preventDefault();
        void onPreview();
      } else if (e.key === "F10") {
        e.preventDefault();
        void onPrint();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onPreview, onPrint]);
}
