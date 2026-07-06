import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Dialog shown after a quote was converted to an invoice
 * (whether just now, or already converted previously).
 *
 * Three choices:
 *  - فتح عرض السعر للتعديل: opens /quotes/edit/:quoteId (same data, register payment, packaging...).
 *  - فتح الفاتورة للتعديل: opens /invoices/edit/:invoiceId (the converted invoice itself).
 *  - البقاء هنا: close, so the user can write another quote.
 */
export function QuoteConvertedDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  alreadyConverted,
  stockDeducted = false,
  deductedLineCount = 0,
  onOpenQuote,
  onOpenInvoice,
  onStay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  alreadyConverted: boolean;
  stockDeducted?: boolean;
  deductedLineCount?: number;
  onOpenQuote: () => void;
  onOpenInvoice: () => void;
  onStay?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {alreadyConverted ? "محوّل مسبقاً إلى فاتورة" : "تم تحويل عرض السعر إلى فاتورة"}
          </DialogTitle>
          <DialogDescription>
            رقم الفاتورة: <strong>{invoiceNumber}</strong>
            <br />
            {stockDeducted ? (
              <span
                className="inline-block mt-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm text-primary"
                role="status"
              >
                ✅ تم خصم المخزون تلقائيًا لـ <strong>{deductedLineCount}</strong> صنف
              </span>
            ) : !alreadyConverted ? (
              <span
                className="inline-block mt-2 rounded-md border border-muted-foreground/30 bg-muted px-3 py-1.5 text-sm text-muted-foreground"
                role="status"
              >
                ℹ️ لم يُخصم مخزون (لا توجد أصناف مربوطة بالمخزن في هذا العرض).
              </span>
            ) : null}
            <br />
            ماذا تريد أن تفعل الآن؟
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 flex-row-reverse flex-wrap">
          <Button
            onClick={() => {
              onOpenChange(false);
              onOpenQuote();
            }}
          >
            فتح عرض السعر للتعديل
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
              onOpenInvoice();
            }}
          >
            فتح الفاتورة للتعديل
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onStay?.();
            }}
          >
            البقاء هنا (عرض سعر آخر)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
