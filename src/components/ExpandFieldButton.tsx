/**
 * ExpandFieldButton — drag handle for resizing header fields.
 *
 * Extracted into its own file to keep `useQuickRowWidths.tsx` as a pure
 * hook module (required for Vite Fast Refresh compatibility).
 *
 * - MouseDown + horizontal drag → live-resize the field.
 * - Double-click                 → reset to base width.
 * Parent must be `position: relative`.
 */
import { MoveHorizontal } from "lucide-react";

export function ExpandFieldButton({
  onDrag,
  onReset,
  currentExtra = 0,
  onExpand,
  title,
}: {
  onDrag?: (nextExtra: number) => void;
  onReset: () => void;
  currentExtra?: number;
  onExpand?: () => void;
  title?: string;
}) {
  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onDrag) {
      onExpand?.();
      return;
    }
    const startX = e.clientX;
    const startExtra = currentExtra;
    const isRtl =
      (typeof document !== "undefined" && document.dir === "rtl") ||
      getComputedStyle(e.currentTarget).direction === "rtl";
    const sign = isRtl ? -1 : 1;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) * sign;
      if (Math.abs(delta) > 2) moved = true;
      onDrag(Math.max(0, startExtra + delta));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      if (!moved) onExpand?.();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <button
      type="button"
      className="field-expand-btn"
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      title={title ?? "اسحب لتغيير عرض الحقل · نقرة مزدوجة لإعادة الضبط"}
      tabIndex={-1}
      style={{ cursor: "ew-resize" }}
    >
      <MoveHorizontal size={10} />
    </button>
  );
}
