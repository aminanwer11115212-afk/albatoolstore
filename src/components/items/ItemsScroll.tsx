import { forwardRef, CSSProperties, ReactNode, useEffect, useRef, useImperativeHandle } from "react";

/**
 * حاوية تمرير موحّدة لجدول البنود في صفحات الإدخال.
 * - flex: 1 1 auto → تتمدد لملء المساحة في form-column
 * - overflowY ديناميكي: hidden افتراضياً، يتحوّل إلى auto فقط عند تجاوز
 *   المحتوى للارتفاع المتاح (يمنع ظهور scrollbar في الحالة الفارغة).
 * - sticky thead/tfoot
 * تُستخدم مع TableFiller لملء الصفوف الفارغة بصرياً.
 */
/**
 * طبقات z-index لجدول البنود (مرجع موحّد لمنع التعارضات):
 *   - tbody td (الصفوف العادية): z-index: 0  (السياق الافتراضي)
 *   - tfoot (sticky سفلي):       z-index: 20
 *   - thead th (sticky علوي):    z-index: 30  (يجب أن يعلو tfoot عند التداخل)
 *   - حاوية التمرير نفسها:       isolation: isolate  → تنشئ stacking context
 *     مستقلاً يمنع تسرّب z-index من/إلى بقية الصفحة (toolbars, sidebars).
 */
const BASE_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  overflowX: "auto",
  boxSizing: "border-box",
  isolation: "isolate",
  position: "relative",
};

// ملاحظة: لا نضع overflowY في BASE_STYLE حتى لا يطغى الـ inline على class toggle.
// نضبط overflowY عبر JS مباشرةً (style prop)، فيعمل الـ toggle فعليًا.
const STICKY_CSS = `
.items-scroll { overflow-y: hidden; }
.items-scroll thead { position: sticky; top: 0; z-index: 30; background: hsl(var(--background)); }
.items-scroll thead tr { background: hsl(var(--background)); }
.items-scroll thead th { position: sticky; top: 0; z-index: 30; background: hsl(var(--background)); }
.items-scroll tbody tr { position: relative; z-index: 0; }
.items-scroll tfoot { position: sticky; bottom: 0; z-index: 20; background: hsl(var(--background)); }
.items-scroll tfoot td, .items-scroll tfoot th { position: sticky; bottom: 0; z-index: 20; background: hsl(var(--background)); }
.items-scroll.is-overflowing { overflow-y: auto !important; }
`;

interface ItemsScrollProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export const ItemsScroll = forwardRef<HTMLDivElement, ItemsScrollProps>(
  ({ children, className, style }, ref) => {
    const innerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;

      const update = () => {
        // هامش 4px لمنع ظهور scrollbar بسبب فروق sub-pixel / حدود thead/tfoot.
        const overflowing = el.scrollHeight > el.clientHeight + 4;
        el.classList.toggle("is-overflowing", overflowing);
        // اجعل scrollIntoView يحترم ارتفاع الـ sticky header/footer
        // حتى لا تختفي الصفوف خلفهما عند التمرير التلقائي.
        const thead = el.querySelector("thead") as HTMLElement | null;
        const tfoot = el.querySelector("tfoot") as HTMLElement | null;
        const headH = thead?.getBoundingClientRect().height || 0;
        const footH = tfoot?.getBoundingClientRect().height || 0;
        el.style.scrollPaddingTop = `${Math.ceil(headH)}px`;
        el.style.scrollPaddingBottom = `${Math.ceil(footH)}px`;
      };

      update();

      const ROType = typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
      const MOType = typeof MutationObserver !== "undefined" ? MutationObserver : null;
      const ro = ROType ? new ROType(update) : null;
      if (ro) {
        ro.observe(el);
        Array.from(el.children).forEach((c) => ro.observe(c));
      }

      const mo = MOType
        ? new MOType(() => {
            if (ro) {
              ro.disconnect();
              ro.observe(el);
              Array.from(el.children).forEach((c) => ro.observe(c));
            }
            requestAnimationFrame(update);
          })
        : null;
      if (mo) mo.observe(el, { childList: true, subtree: true });

      window.addEventListener("resize", update);
      return () => {
        ro?.disconnect();
        mo?.disconnect();
        window.removeEventListener("resize", update);
      };
    }, []);

    return (
      <>
        <style>{STICKY_CSS}</style>
        <div
          ref={innerRef}
          className={["items-scroll", className].filter(Boolean).join(" ")}
          style={{ ...BASE_STYLE, ...style }}
        >
          {children}
        </div>
      </>
    );
  }
);
ItemsScroll.displayName = "ItemsScroll";
