import { useEffect, useRef, useState } from "react";
import { GripHorizontal } from "lucide-react";

interface Props {
  open: boolean;
  pageKey: string;
  onSaveDefault: () => void;
  onReset: () => void;
  onSave: () => void;
}

const STORAGE_PREFIX = "cols-edit-panel-pos:";
const DEFAULT_POS = { x: window.innerWidth / 2 - 120, y: 72 };

function readPos(pageKey: string): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + pageKey);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.x === "number" && typeof p.y === "number") return p;
    }
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export default function ColumnsEditFloatingPanel({ open, pageKey, onSaveDefault, onReset, onSave }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => readPos(pageKey));
  const dragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-read stored position when pageKey changes
  useEffect(() => {
    setPos(readPos(pageKey));
  }, [pageKey]);

  // Save position to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + pageKey, JSON.stringify(pos));
    } catch { /* ignore */ }
  }, [pos, pageKey]);

  function onHeaderMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...pos };

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return;
      const dx = ev.clientX - startMouse.current.x;
      const dy = ev.clientY - startMouse.current.y;
      const panelW = panelRef.current?.offsetWidth ?? 240;
      const panelH = panelRef.current?.offsetHeight ?? 120;
      setPos({
        x: clamp(startPos.current.x + dx, 0, window.innerWidth - panelW),
        y: clamp(startPos.current.y + dy, 0, window.innerHeight - panelH),
      });
    }

    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Touch support
  function onHeaderTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    startMouse.current = { x: touch.clientX, y: touch.clientY };
    startPos.current = { ...pos };

    function onMove(ev: TouchEvent) {
      const t = ev.touches[0];
      const dx = t.clientX - startMouse.current.x;
      const dy = t.clientY - startMouse.current.y;
      const panelW = panelRef.current?.offsetWidth ?? 240;
      const panelH = panelRef.current?.offsetHeight ?? 120;
      setPos({
        x: clamp(startPos.current.x + dx, 0, window.innerWidth - panelW),
        y: clamp(startPos.current.y + dy, 0, window.innerHeight - panelH),
      });
    }

    function onEnd() {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }

    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  }

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      dir="rtl"
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: 50,
        minWidth: 200,
      }}
      className="bg-card border border-border shadow-lg rounded-md text-foreground select-none"
    >
      {/* Drag handle header */}
      <div
        onMouseDown={onHeaderMouseDown}
        onTouchStart={onHeaderTouchStart}
        className="flex items-center gap-2 px-3 py-1.5 border-b border-border cursor-grab active:cursor-grabbing rounded-t-md bg-muted"
        style={{ userSelect: "none" }}
      >
        <GripHorizontal size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">تعديل الأعمدة</span>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-1.5 p-2">
        <button
          type="button"
          title="تعيين عرض الأعمدة الحالي كافتراضي شخصي — يُستعاد عند الضغط على إعادة الضبط"
          onClick={onSaveDefault}
          className="text-xs px-3 py-1.5 rounded border border-border bg-accent text-accent-foreground hover:opacity-90 cursor-pointer w-full text-right"
        >
          ★ افتراضي
        </button>
        <button
          type="button"
          title="إعادة الأعمدة إلى الافتراضي"
          onClick={onReset}
          className="text-xs px-3 py-1.5 rounded border border-border bg-muted text-foreground hover:opacity-90 cursor-pointer w-full text-right"
        >
          ↺ إعادة
        </button>
        <button
          type="button"
          title="حفظ وقفل عرض الأعمدة الحالي"
          onClick={onSave}
          className="text-xs px-3 py-1.5 rounded border border-border bg-primary text-primary-foreground hover:opacity-90 cursor-pointer w-full text-right font-medium"
        >
          حفظ
        </button>
      </div>
    </div>
  );
}
