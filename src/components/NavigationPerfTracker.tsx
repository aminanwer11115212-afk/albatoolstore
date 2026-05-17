import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { markNavStart, markNavEnd } from "@/lib/perfMonitor";

/**
 * يتتبّع كل تغيير في المسار ويُسجّل المدة بين بداية الانتقال ونهايته
 * (نهاية الانتقال = بعد render الصفحة الجديدة).
 */
export default function NavigationPerfTracker() {
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);

  // قبل الـ commit: نُعلِم المراقب أن انتقالاً بدأ
  if (prevPath.current !== pathname) {
    markNavStart(pathname);
  }

  useEffect(() => {
    if (prevPath.current !== pathname) {
      // بعد render: نسجّل المدة
      requestAnimationFrame(() => markNavEnd(pathname));
      prevPath.current = pathname;
    }
  }, [pathname]);

  return null;
}
