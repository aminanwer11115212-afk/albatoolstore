import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QuoteConvertedDialog } from "@/components/QuoteConvertedDialog";

type ConvertedInfo = {
  invoiceId: string;
  invoiceNumber: string;
  alreadyConverted: boolean;
  quoteId?: string;
};

/**
 * Reusable hook that opens a confirmation dialog after a quote is
 * converted to an invoice. Three choices:
 *   - فتح عرض السعر للتعديل: navigates to /quotes/edit/:quoteId.
 *   - فتح الفاتورة للتعديل: navigates to /invoices/edit/:invoiceId (the converted invoice).
 *   - البقاء هنا: stays so the user can create another quote.
 */
export function useQuoteConvertedDialog(opts?: { onStay?: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<(ConvertedInfo & { quoteId?: string }) | null>(null);

  const showConverted = useCallback((next: ConvertedInfo) => {
    setInfo(next);
    setOpen(true);
  }, []);

  const ConvertedDialog = info ? (
    <QuoteConvertedDialog
      open={open}
      onOpenChange={setOpen}
      invoiceId={info.invoiceId}
      invoiceNumber={info.invoiceNumber}
      alreadyConverted={info.alreadyConverted}
      onOpenQuote={() => {
        if (info.quoteId) {
          navigate(`/quotes/edit/${info.quoteId}`);
        } else {
          // Fallback: no quoteId available, open the invoice instead.
          navigate(`/invoices/edit/${info.invoiceId}`);
        }
      }}
      onOpenInvoice={() => {
        navigate(`/invoices/edit/${info.invoiceId}`);
      }}
      onStay={opts?.onStay}
    />
  ) : null;

  return { showConverted, ConvertedDialog };
}
