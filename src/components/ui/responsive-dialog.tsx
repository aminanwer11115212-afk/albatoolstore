import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Wrapper موحّد: يستخدم Sheet سفلي على الموبايل (≤640px)
 * وDialog مركزي على الديسكتوب. واجهة موحّدة لتقليل إعادة الكتابة في كل dialog.
 *
 * ملاحظات:
 * - لا يغيّر أي منطق أعمال — مجرد wrapper تقديمي.
 * - يحترم RTL تلقائياً عبر `dir="rtl"` على المحتوى.
 */
export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** يفرض استخدام Dialog حتى على الموبايل (مثلاً لـ confirm سريع). */
  forceDialog?: boolean;
  /** صنف إضافي للمحتوى. */
  contentClassName?: string;
  /** ارتفاع أقصى للـ Sheet على الموبايل (افتراضي 90vh). */
  mobileMaxHeight?: string;
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  forceDialog,
  contentClassName,
  mobileMaxHeight = "90vh",
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile && !forceDialog) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          dir="rtl"
          className={cn(
            "rounded-t-2xl border-t border-border bg-card p-0 flex flex-col",
            contentClassName,
          )}
          style={{ maxHeight: mobileMaxHeight }}
        >
          {(title || description) && (
            <SheetHeader className="px-4 pt-4 pb-2 text-right border-b border-border">
              {title && <SheetTitle className="text-base">{title}</SheetTitle>}
              {description && <SheetDescription className="text-xs">{description}</SheetDescription>}
            </SheetHeader>
          )}
          <div className="overflow-y-auto px-4 py-3 flex-1">{children}</div>
          {footer && (
            <SheetFooter className="px-4 py-3 border-t border-border bg-card flex-col gap-2 sm:flex-row sm:gap-2">
              {footer}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className={contentClassName}>
        {(title || description) && (
          <DialogHeader className="text-right">
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <div>{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export default ResponsiveDialog;
