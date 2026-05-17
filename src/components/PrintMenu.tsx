import React, { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import PrintTilesDialog from "./PrintTilesDialog";

export type PrintVariant = "full" | "no-account" | "account-only" | "no-details" | "stocktake";

interface PrintMenuProps {
  /** Called when the user picks a final option. */
  onPrint: (variant: PrintVariant, noHeader: boolean) => void;
  /** Document type — controls labels only. */
  docType?: "invoice" | "quote" | "purchase" | "return";
  /** Render a compact icon-only trigger (used inside list-page action cells). */
  compact?: boolean;
  /** Optional custom trigger label. */
  label?: string;
  /** Optional className for trigger. */
  triggerClassName?: string;
  /** Optional inline style for trigger. */
  triggerStyle?: React.CSSProperties;
  /** Optional title/tooltip for trigger. */
  title?: string;
}

/**
 * Print trigger: opens a tiled dialog with all print variants.
 */
function PrintMenuImpl({
  onPrint,
  docType = "invoice",
  compact = false,
  label = "طباعة",
  triggerClassName,
  triggerStyle,
  title = "طباعة",
}: PrintMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "F9" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setOpen((prev) => (prev ? prev : true));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        type="button"
        title={title}
        onClick={() => setOpen(true)}
        className={triggerClassName}
        style={triggerStyle}
      >
        {compact ? "⬇" : (<><Printer size={14} /> {label}</>)}
      </button>

      <PrintTilesDialog
        open={open}
        onOpenChange={setOpen}
        onPick={onPrint}
        docType={docType}
      />
    </>
  );
}

export default React.memo(PrintMenuImpl);
