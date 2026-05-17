import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  /** CSS selector to locate the anchor input (e.g. `[data-row-search="uid-1"]`). */
  anchorSelector: string;
  open: boolean;
  /** Custom width in px. 0/undefined means "match anchor width". */
  width?: number;
  children: ReactNode;
}

interface Pos {
  top: number;
  left?: number;
  right?: number;
  width: number;
}

/**
 * Renders children in a fixed-position portal anchored to the bottom edge of
 * the input matched by `anchorSelector`. RTL-aware: anchors to the right side
 * of the input so it can grow leftwards when the user resizes.
 *
 * The portal lives in document.body, so it cannot be clipped by the
 * surrounding table cell / overflow:hidden / table-layout:fixed.
 */
export function SuggestionsPortal({ anchorSelector, open, width, children }: Props) {
  const [pos, setPos] = useState<Pos | null>(null);
  const rafRef = useRef<number | null>(null);

  const recompute = () => {
    const el = document.querySelector<HTMLElement>(anchorSelector);
    if (!el) {
      setPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const isRtl =
      document.documentElement.dir === "rtl" || document.body.dir === "rtl";
    const w = width && width > 0 ? width : rect.width;
    if (isRtl) {
      // pin to the right edge; grow leftwards
      setPos({
        top: rect.bottom,
        right: window.innerWidth - rect.right,
        width: w,
      });
    } else {
      setPos({
        top: rect.bottom,
        left: rect.left,
        width: w,
      });
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width, anchorSelector]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(recompute);
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width, anchorSelector]);

  if (!open || !pos) return null;

  const style: React.CSSProperties = {
    position: "fixed",
    top: pos.top,
    width: pos.width,
    zIndex: 1000,
  };
  if (pos.right !== undefined) style.right = pos.right;
  if (pos.left !== undefined) style.left = pos.left;

  return createPortal(<div style={style}>{children}</div>, document.body);
}
