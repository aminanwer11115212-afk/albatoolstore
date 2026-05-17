import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Persisted width (in pixels) for the product-search suggestions dropdown.
 * Returns the current width and a `startDrag` handler to bind to a handle.
 *
 * Width = 0 means "use natural width" (left:0;right:0). Once the user drags,
 * we set an explicit pixel width.
 */
export function useSuggestionsWidth(storageKey: string, defaultWidth = 0, min = 160, max = 900) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaultWidth;
      const n = Number(raw);
      if (!isFinite(n)) return defaultWidth;
      if (n === 0) return 0;
      return Math.max(min, Math.min(max, n));
    } catch {
      return defaultWidth;
    }
  });

  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* noop */
    }
  }, [width, storageKey]);

  const startDrag = useCallback(
    (e: React.MouseEvent, getCurrentPx?: () => number) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = widthRef.current > 0 ? widthRef.current : (getCurrentPx?.() ?? 280);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const isRtl = document.documentElement.dir === "rtl" || document.body.dir === "rtl";

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        // Handle is on the LEFT edge of the popup. In LTR, dragging left grows
        // the box (negative dx -> +width). In RTL, dragging left shrinks
        // (handle is the "outer" edge on the left of an RTL panel anchored to
        // the right). We mirror so the user's intuitive direction always grows.
        const grow = isRtl ? dx : -dx;
        const next = Math.max(min, Math.min(max, Math.round(startW + grow)));
        setWidth(next);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [min, max],
  );

  const reset = useCallback(() => setWidth(0), []);

  return { width, startDrag, reset };
}

/**
 * Visual handle to render INSIDE the suggestions popup, anchored to its
 * outer edge (logical-start in RTL = left). Drag horizontally to resize.
 */
export function SuggestionsResizeHandle({
  onMouseDown,
  title,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
  title?: string;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      title={title ?? "اسحب لتغيير عرض قائمة الاقتراحات"}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        // anchor to the logical START edge (left in RTL → outer left edge)
        insetInlineStart: -3,
        width: 6,
        cursor: "col-resize",
        zIndex: 10,
        userSelect: "none",
      }}
      className="suggestions-resize-handle"
    />
  );
}
