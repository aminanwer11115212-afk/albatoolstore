/**
 * useFormFactor — يرجع صيغة العرض الحالية ('mobile' | 'desktop') تفاعلياً.
 *
 * - `mobile`: viewport ≤ 640px (نفس عتبة `useDialogSize` الموجودة).
 * - `desktop`: غير ذلك (يشمل tablet — لا نفصل tablet حالياً).
 *
 * يُستخدم لبناء مفاتيح تفضيلات منفصلة لكل صيغة عرض، حتى لا يتسرب تخصيص
 * شاشة الهاتف إلى شاشة سطح المكتب لنفس المستخدم.
 *
 * Sync helper: لا يجب استخدام الـ window.innerWidth داخل تأثيرات بدون
 * matchMedia، لذا الهوك يعتمد على media query listener موحَّد.
 */
import { useEffect, useState } from "react";

export type FormFactor = "mobile" | "desktop";

const MOBILE_MAX = 640; // px — مطابق لقاعدة `useDialogSize` و global CSS الحالي.
const MQL = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia(`(max-width: ${MOBILE_MAX}px)`)
  : null;

export function getFormFactorSync(): FormFactor {
  if (MQL) return MQL.matches ? "mobile" : "desktop";
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth <= MOBILE_MAX ? "mobile" : "desktop";
}

export function useFormFactor(): FormFactor {
  const [ff, setFf] = useState<FormFactor>(() => getFormFactorSync());

  useEffect(() => {
    if (!MQL) return;
    const onChange = () => setFf(MQL.matches ? "mobile" : "desktop");
    // الـMQL.addEventListener أحدث؛ نضيف fallback لـ addListener.
    if (typeof MQL.addEventListener === "function") {
      MQL.addEventListener("change", onChange);
      return () => MQL.removeEventListener("change", onChange);
    }
    const legacy = MQL as unknown as {
      addListener: (cb: () => void) => void;
      removeListener: (cb: () => void) => void;
    };
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }, []);

  return ff;
}
