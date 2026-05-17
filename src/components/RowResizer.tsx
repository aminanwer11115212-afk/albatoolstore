import { useEffect, useRef, useState, useCallback } from "react";
import { Lock, Unlock } from "lucide-react";
import { userScopedLegacyKey } from "@/lib/userScopedKey";

/**
 * Horizontal splitter (vertical drag) that controls the height of a sibling
 * element above it via a CSS custom property set on the closest scope element.
 *
 * Mirrors PanelResizer's UX: drag to resize, lock toggle, persisted state.
 * Default: locked (so users aren't disturbed during data entry).
 */
interface Props {
  storageKey: string;
  scopeSelector: string;
  /** CSS variable name to set (without `--`). Default: "row-height". */
  cssVar?: string;
  defaultHeight?: number;
  min?: number;
  max?: number;
  /**
   * "height" (default): writes `${px}px` to the CSS var, drag = pixels.
   * "scale": writes a unit-less decimal multiplier to the CSS var, drag is
   * desensitized so ~40px of vertical drag = ±0.1.
   */
  mode?: "height" | "scale";
}

export default function RowResizer({
  storageKey,
  scopeSelector,
  cssVar = "row-height",
  defaultHeight = 60,
  min = 30,
  max = 400,
  mode = "height",
}: Props) {
  storageKey = userScopedLegacyKey(storageKey);
  const lockKey = userScopedLegacyKey(`${storageKey}:locked`);
  const [height, setHeight] = useState<number>(() => {
    if (typeof window === "undefined") return defaultHeight;
    const raw = localStorage.getItem(storageKey);
    const n = raw ? Number(raw) : defaultHeight;
    return isFinite(n) && n >= min && n <= max ? n : defaultHeight;
  });
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(lockKey);
    return raw === null ? true : raw === "1";
  });
  const draggingRef = useRef(false);

  const apply = useCallback((v: number) => {
    const el = document.querySelector(scopeSelector) as HTMLElement | null;
    if (el) el.style.setProperty(`--${cssVar}`, mode === "scale" ? String(v) : `${v}px`);
  }, [scopeSelector, cssVar, mode]);

  useEffect(() => {
    apply(height);
    localStorage.setItem(storageKey, String(height));
  }, [height, apply, storageKey]);

  useEffect(() => {
    localStorage.setItem(lockKey, locked ? "1" : "0");
  }, [locked, lockKey]);

  useEffect(() => {
    return () => {
      const el = document.querySelector(scopeSelector) as HTMLElement | null;
      if (el) el.style.removeProperty(`--${cssVar}`);
    };
  }, [scopeSelector, cssVar]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (locked) return;
    e.preventDefault();
    draggingRef.current = true;
    const startY = e.clientY;
    const startH = height;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const dy = ev.clientY - startY;
      // In scale mode, desensitize: 40px = ±0.1; otherwise 1:1 px.
      const delta = mode === "scale" ? dy / 400 : dy;
      const raw = startH + delta;
      const next = Math.min(max, Math.max(min, raw));
      // In scale mode, snap to 0.05 increments for cleaner persistence.
      setHeight(mode === "scale" ? Math.round(next * 20) / 20 : next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onDoubleClick = () => {
    if (locked) return;
    setHeight(defaultHeight);
  };

  return (
    <div
      style={{
        height: 14,
        width: "100%",
        position: "relative",
        flexShrink: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={() => setLocked((v) => !v)}
        title={locked ? "اضغط لتفعيل تغيير الارتفاع" : "اضغط لقفل الارتفاع"}
        style={{
          marginInlineStart: 4,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 4,
          border: "1px solid hsl(var(--border))",
          background: locked ? "hsl(var(--muted))" : "hsl(var(--primary) / 0.15)",
          color: locked ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      >
        {locked ? <Lock size={10} /> : <Unlock size={10} />}
      </button>

      <div
        role="separator"
        aria-orientation="horizontal"
        aria-disabled={locked}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        title={locked ? "الارتفاع مقفول — افتح القفل بجانبه للتغيير" : "اسحب لتغيير الارتفاع — انقر مزدوجاً لإعادة الضبط"}
        style={{
          flex: 1,
          height: "100%",
          cursor: locked ? "default" : "row-resize",
          background: "transparent",
          position: "relative",
          pointerEvents: locked ? "none" : "auto",
          opacity: locked ? 0.4 : 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0, right: 0, top: "50%",
            transform: "translateY(-50%)",
            height: 2,
            background: "hsl(var(--border))",
            transition: "background .15s, height .15s",
          }}
          className="row-resizer-bar"
        />
        {!locked && (
          <div
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              height: 4, width: 28,
              borderRadius: 2,
              background: "hsl(var(--muted-foreground) / 0.5)",
            }}
          />
        )}
        <style>{`
          div[role="separator"][aria-orientation="horizontal"]:not([aria-disabled="true"]):hover .row-resizer-bar { background: hsl(var(--primary) / 0.6); height: 3px; }
        `}</style>
      </div>
    </div>
  );
}
