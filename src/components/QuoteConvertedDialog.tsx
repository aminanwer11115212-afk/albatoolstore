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
  onOpenQuote,
  onOpenInvoice,
  onStay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  alreadyConverted: boolean;
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
