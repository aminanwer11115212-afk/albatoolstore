import { useCallback, useEffect, useRef, useState } from "react";
import { useFormFactorScopedLegacyKey } from "@/lib/formFactorKey";

const MIN = 24;
const MAX = 240;

/**
 * ارتفاع موحّد لكل صفوف الجدول. السحب من أي صف يغيّر ارتفاع كل الصفوف معاً.
 * يحفظ القيمة في localStorage تحت `${storageKey}:global` وحالة القفل تحت `${storageKey}:locked`.
 *
 * المفتاح مفصول لكل (مستخدم × صيغة عرض) — تخصيص الهاتف لا يصل إلى سطح المكتب.
 */
export function useRowHeights(rawStorageKey: string, defaultHeight = 32) {
  const storageKey = useFormFactorScopedLegacyKey(rawStorageKey, [":global", ":locked"]);
  const globalKey = `${storageKey}:global`;
  const lockKey = `${storageKey}:locked`;

  const [height, setHeightState] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(globalKey);
      if (raw === null) return null;
      const n = Number(raw);
      return isFinite(n) && n >= MIN && n <= MAX ? n : null;
    } catch { return null; }
  });
  const [locked, setLockedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(lockKey);
    return raw === null ? true : raw === "1";
  });
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    try {
      if (height === null) localStorage.removeItem(globalKey);
      else localStorage.setItem(globalKey, String(height));
    } catch {}
  }, [height, globalKey]);

  useEffect(() => {
    try { localStorage.setItem(lockKey, locked ? "1" : "0"); } catch {}
  }, [locked, lockKey]);

  const setLocked = useCallback((v: boolean | ((p: boolean) => boolean)) => {
    setLockedState(v as any);
  }, []);

  const getHeight = useCallback((_id?: string): number | undefined => {
    return height ?? undefined;
  }, [height]);

  const resetHeight = useCallback((_id?: string) => {
    setHeightState(null);
  }, []);

  const startDrag = useCallback((_id: string | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const tr = (e.currentTarget as HTMLElement).closest("tr") as HTMLTableRowElement | null;
    const startH = heightRef.current ?? (tr?.offsetHeight ?? defaultHeight);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      const next = Math.min(MAX, Math.max(MIN, startH + dy));
      setHeightState(next);
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [defaultHeight]);

  return { height, getHeight, resetHeight, startDrag, locked, setLocked };
}

interface HandleProps {
  rowId?: string;
  startDrag: (id: string | undefined, e: React.MouseEvent) => void;
  resetHeight: (id?: string) => void;
  visible: boolean;
}

export function RowResizeHandle({ rowId, startDrag, resetHeight, visible }: HandleProps) {
  if (!visible) return null;
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      title="اسحب لتغيير ارتفاع كل الصفوف — انقر مزدوجاً لإعادة الضبط"
      onMouseDown={(e) => startDrag(rowId, e)}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); resetHeight(rowId); }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: -2,
        height: 5,
        cursor: "row-resize",
        zIndex: 4,
        background: "transparent",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "hsl(var(--primary) / 0.35)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    />
  );
}
