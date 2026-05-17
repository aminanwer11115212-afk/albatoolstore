import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

/**
 * Small "reset columns to defaults" button.
 *
 * Pass the `reset` callback from `useColumnWidths(...)` and the same
 * `storageKey` for the toast/aria label. Renders an icon-only button by
 * default; pass `label` to show text.
 */
export function ColumnsResetButton({
  reset,
  storageKey,
  label,
  className,
}: {
  reset: () => void;
  storageKey: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        reset();
        toast.success("تم إعادة أعرض الأعمدة إلى الافتراضي");
      }}
      title={`إعادة الأعمدة إلى الافتراضي · ${storageKey}`}
      aria-label="إعادة الأعمدة إلى الافتراضي"
      className={
        className ??
        "inline-flex items-center gap-1 rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground px-2 py-1 text-xs text-muted-foreground transition-colors"
      }
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {label ?? "إعادة افتراضي"}
    </button>
  );
}
