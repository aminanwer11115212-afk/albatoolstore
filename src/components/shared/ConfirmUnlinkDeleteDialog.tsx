import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";

export interface ConfirmUnlinkDeleteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** e.g. "الفئة" / "الماركة" / "المستودع" / "المجموعة" */
  entityLabel: string;
  /** e.g. "اكس 100" */
  entityName: string;
  /** e.g. "منتج" / "عميل" */
  usageLabel: string;
  /** أسماء أول 5-10 من العناصر المرتبطة */
  usageNames: string[];
  /** إجمالي عدد العناصر المرتبطة (قد يفوق usageNames.length) */
  usageCount: number;
  /** نص تحذيري إضافي أعلى الأزرار (اختياري) */
  warning?: string;
  /** يُنفذ عند التأكيد. يرجع true إذا نجح الحذف. */
  onConfirm: () => Promise<boolean>;
  onDone?: () => void;
}

export default function ConfirmUnlinkDeleteDialog(props: ConfirmUnlinkDeleteDialogProps) {
  const {
    open, onOpenChange, entityLabel, entityName,
    usageLabel, usageNames, usageCount, warning,
    onConfirm, onDone,
  } = props;
  const [busy, setBusy] = useState(false);

  const shown = usageNames.slice(0, 8);
  const extra = Math.max(0, usageCount - shown.length);

  const run = async () => {
    setBusy(true);
    try {
      const ok = await onConfirm();
      if (ok) {
        onOpenChange(false);
        onDone?.();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle size={18} />
            حذف {entityLabel}: {entityName}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm space-y-3">
          <p className="text-foreground leading-relaxed">
            {entityLabel} مرتبط بـ <span className="font-bold text-foreground">{usageCount}</span> {usageLabel}.
            سيتم فكّ الربط تلقائياً ثم حذف {entityLabel}.
          </p>

          {shown.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs max-h-40 overflow-auto">
              <div className="text-muted-foreground mb-1">
                أمثلة على {usageLabel} المرتبطين:
              </div>
              <ul className="space-y-0.5">
                {shown.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
              {extra > 0 && (
                <div className="mt-1 text-muted-foreground">
                  و {extra} آخرون...
                </div>
              )}
            </div>
          )}

          {warning && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {warning}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
          <button
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm bg-muted text-foreground disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm bg-destructive text-destructive-foreground disabled:opacity-50 inline-flex items-center gap-2 justify-center"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "جارٍ الحذف..." : `حذف مع فكّ الربط`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
