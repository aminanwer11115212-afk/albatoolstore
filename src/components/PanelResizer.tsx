import { useEffect, useRef, useState, useCallback } from "react";
import { Lock, Unlock } from "lucide-react";
import { userScopedLegacyKey } from "@/lib/userScopedKey";

/**
 * Vertical splitter that controls the width of a sibling sidebar via a CSS
 * custom property `--sidebar-width` set on the closest scope element.
 *
 * - Drag with mouse to resize; size persists in localStorage per `storageKey`.
 * - Lock button (top of handle) disables dragging — prevents accidental
 *   resize while typing data. Lock state persisted under `${storageKey}:locked`.
 * - Default: locked (so users aren't disturbed during data entry).
 *
 * RTL note: in our pages the sidebar is on the RIGHT (RTL layout), so dragging
 * the handle to the LEFT increases sidebar width, to the RIGHT decreases it.
 */
interface Props {
  /** Unique localStorage key per page, e.g. "panels:quote-create". */
  storageKey: string;
  /** CSS selector of the scope element holding the CSS var. */
  scopeSelector: string;
  /** Default sidebar width in px. */
  defaultWidth?: number;
  min?: number;
  max?: number;
}

export default function PanelResizer({
  storageKey,
  scopeSelector,
  defaultWidth = 260,
  min = 180,
  max = 520,
}: Props) {
  storageKey = userScopedLegacyKey(storageKey);
  const lockKey = userScopedLegacyKey(`${storageKey}:locked`);
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    const raw = localStorage.getItem(storageKey);
    const n = raw ? Number(raw) : defaultWidth;
    return isFinite(n) && n >= min && n <= max ? n : defaultWidth;
  });
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(lockKey);
    return raw === null ? true : raw === "1";
  });
  const draggingRef = useRef(false);

  const apply = useCallback((px: number) => {
    const el = document.querySelector(scopeSelector) as HTMLElement | null;
    if (el) el.style.setProperty("--sidebar-width", `${px}px`);
  }, [scopeSelector]);

  useEffect(() => {
    apply(width);
    localStorage.setItem(storageKey, String(width));
  }, [width, apply, storageKey]);

  useEffect(() => {
    localStorage.setItem(lockKey, locked ? "1" : "0");
  }, [locked, lockKey]);

  // Reset on unmount so other pages aren't affected.
  useEffect(() => {
    return () => {
      const el = document.querySelector(scopeSelector) as HTMLElement | null;
      if (el) el.style.removeProperty("--sidebar-width");
    };
  }, [scopeSelector]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (locked) return;
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startW = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = ev.clientX - startX;
      const next = Math.min(max, Math.max(min, startW - dx));
      setWidth(next);
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
    setWidth(defaultWidth);
  };

  return (
    <div
      style={{
        width: 14,
        alignSelf: "stretch",
        position: "relative",
        flexShrink: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Lock toggle */}
      <button
        type="button"
        onClick={() => setLocked((v) => !v)}
        title={locked ? "اضغط لتفعيل تغيير الحجم" : "اضغط لقفل الحجم"}
        style={{
          marginTop: 4,
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

      {/* Drag handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-disabled={locked}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        title={locked ? "الحجم مقفول — افتح القفل أعلاه للتغيير" : "اسحب لتغيير عرض اللوحة — انقر مزدوجاً لإعادة الضبط"}
        style={{
          flex: 1,
          width: "100%",
          cursor: locked ? "default" : "col-resize",
          background: "transparent",
          position: "relative",
          pointerEvents: locked ? "none" : "auto",
          opacity: locked ? 0.4 : 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0, bottom: 0, left: "50%",
            transform: "translateX(-50%)",
            width: 2,
            background: "hsl(var(--border))",
            transition: "background .15s, width .15s",
          }}
          className="panel-resizer-bar"
        />
        {!locked && (
          <div
            style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 4, height: 28,
              borderRadius: 2,
              background: "hsl(var(--muted-foreground) / 0.5)",
            }}
          />
        )}
        <style>{`
          div[role="separator"]:not([aria-disabled="true"]):hover .panel-resizer-bar { background: hsl(var(--primary) / 0.6); width: 3px; }
        `}</style>
      </div>
    </div>
  );
}
