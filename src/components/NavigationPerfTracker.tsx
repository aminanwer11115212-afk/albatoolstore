import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { markNavStart, markNavEnd } from "@/lib/perfMonitor";

/**
 * يتتبّع كل تغيير في المسار ويُسجّل المدة بين بداية الانتقال ونهايته.
 * تم نقل كل التأثيرات الجانبية خارج جسم render (كانت تُنفَّذ مرتين في
 * StrictMode وتُسبّب قياسات خاطئة وعملاً زائداً).
 */
export default function NavigationPerfTracker() {
  const { pathname } = useLocation();
  const prevPath = useRef(pathname);

  useLayoutEffect(() => {
    if (prevPath.current !== pathname) {
      markNavStart(pathname);
      requestAnimationFrame(() => markNavEnd(pathname));
      prevPath.current = pathname;
    }
  }, [pathname]);

  return null;
}
