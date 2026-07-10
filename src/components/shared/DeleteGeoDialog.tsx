import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export interface DeleteGeoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityLabel: string;      // مثال: "الولاية"
  entityName: string;       // مثال: "دمنهور"
  customers: number;
  children?: number;
  childrenLabel?: string;   // "مدن"، "محليات"...
  allowCascade?: boolean;   // false للمجموعات/الترحيلات/الوجهات
  onDeleteOnly: () => Promise<boolean>;
  onDeleteCascade?: () => Promise<boolean>;
  onDone?: () => void;      // بعد نجاح الحذف
}

export default function DeleteGeoDialog(props: DeleteGeoDialogProps) {
  const {
    open, onOpenChange, entityLabel, entityName,
    customers, children = 0, childrenLabel = "",
    allowCascade = true, onDeleteOnly, onDeleteCascade, onDone,
  } = props;
  const [busy, setBusy] = useState<"" | "only" | "cascade">("");

  const run = async (mode: "only" | "cascade") => {
    setBusy(mode);
    try {
      const fn = mode === "only" ? onDeleteOnly : onDeleteCascade!;
      const ok = await fn();
      if (ok) {
        onOpenChange(false);
        onDone?.();
      }
    } finally {
      setBusy("");
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
          <p className="text-foreground">
            هذا العنصر مرتبط ببيانات أخرى. اختر ما تريد فعله:
          </p>
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-xs">
            {customers > 0 && (
              <div>• عدد العملاء المرتبطين: <span className="font-bold text-foreground">{customers}</span></div>
            )}
            {children > 0 && (
              <div>• عدد {childrenLabel} التابعة: <span className="font-bold text-foreground">{children}</span></div>
            )}
            {customers === 0 && children === 0 && (
              <div className="text-muted-foreground">لا توجد ارتباطات — يمكن الحذف مباشرة.</div>
            )}
          </div>

          {allowCascade ? (
            <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
              <div>
                <span className="font-semibold text-foreground">حذف فقط:</span> يُحذف {entityLabel} و{childrenLabel ? `كل ${childrenLabel} التابعة` : ""}، ويظل العملاء موجودين مع فكّ ربطهم بهذا {entityLabel}.
              </div>
              <div>
                <span className="font-semibold text-destructive">حذف كامل:</span> يُحذف {entityLabel} وكل التوابع <span className="font-bold">وكل العملاء المرتبطين</span> — يُرفض تلقائياً إن كان أحدهم يملك فواتير أو معاملات.
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              سيُحذف {entityLabel} ويُفكّ ربطه عن العملاء (لن يُحذف أي عميل).
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
          <button
            onClick={() => onOpenChange(false)}
            disabled={!!busy}
            className="px-4 py-2 rounded-md text-sm bg-muted text-foreground disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            onClick={() => run("only")}
            disabled={!!busy}
            className="px-4 py-2 rounded-md text-sm bg-secondary text-secondary-foreground border border-border disabled:opacity-50"
          >
            {busy === "only" ? "جاري..." : `حذف ${entityLabel} فقط`}
          </button>
          {allowCascade && onDeleteCascade && (
            <button
              onClick={() => run("cascade")}
              disabled={!!busy}
              className="px-4 py-2 rounded-md text-sm bg-destructive text-destructive-foreground disabled:opacity-50"
            >
              {busy === "cascade" ? "جاري..." : "حذف كامل مع العملاء"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
