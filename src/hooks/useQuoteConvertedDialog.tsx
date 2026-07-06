import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QuoteConvertedDialog } from "@/components/QuoteConvertedDialog";

type ConvertedInfo = {
  invoiceId: string;
  invoiceNumber: string;
  alreadyConverted: boolean;
  quoteId?: string;
  stockDeducted?: boolean;
  deductedLineCount?: number;
};

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
      stockDeducted={info.stockDeducted}
      deductedLineCount={info.deductedLineCount}
      onOpenQuote={() => {
        if (info.quoteId) {
          navigate(`/quotes/edit/${info.quoteId}`);
        } else {
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
