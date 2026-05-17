import { toast } from "sonner";

/**
 * Unified toast for quote → invoice conversion results.
 * Shows the new invoice number and an action button to open it.
 *
 * Used by: QuotesPage, QuoteViewPage, QuoteCreatePage,
 *          RecentItemsSidebar, DashboardRecentQuotes.
 */
export function notifyQuoteConverted(opts: {
  invoiceId: string;
  invoiceNumber: string;
  alreadyConverted: boolean;
  navigate: (path: string) => void;
}) {
  const { invoiceId, invoiceNumber, alreadyConverted, navigate } = opts;
  const message = alreadyConverted
    ? `محوّل مسبقاً إلى فاتورة ${invoiceNumber}`
    : `تم التحويل إلى فاتورة ${invoiceNumber} (حالة: عرض سعر)`;
  toast.success(message, {
    duration: 8000,
    action: {
      label: "فتح الفاتورة",
      onClick: () => navigate(`/invoices/view/${invoiceId}`),
    },
  });
}
