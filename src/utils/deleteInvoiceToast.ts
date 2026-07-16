import { toast } from "sonner";
import type { DeleteInvoiceResult } from "@/utils/deleteInvoice";
import { netBalanceOf } from "@/utils/balanceDisplay";

/**
 * Unified success toast for invoice deletion across every entry point
 * (InvoicesPage, InvoiceViewPage, InvoiceCreatePage, TodayInvoicesPage…).
 *
 * Structure:
 *   line 1 — تم حذف الفاتورة «رقم»
 *   line 2 — إرجاع X بند (Y قطعة) إلى المخزون  [إن وُجد]
 *   line 3 — أُلغيت دفعات بقيمة Z             [إن وُجدت]
 *   line 4 — رصيد العميل الآن: عليه/له/مسدَّد  [للفواتير العادية فقط]
 */
export function showInvoiceDeletedToast(res: DeleteInvoiceResult, opts?: { isPos?: boolean; extraSuffix?: string }) {
  const invLabel = res.invoiceNumber ? `«${res.invoiceNumber}»` : "";
  const title = `تم حذف الفاتورة ${invLabel}`.trim();

  const lines: string[] = [];

  // Stock line
  if (res.restoredStock && res.restoredItems?.length) {
    const totalQty = res.restoredItems.reduce((s, it) => s + Number(it.quantity || 0), 0);
    lines.push(`أُرجع ${res.restoredItems.length} بند (${totalQty.toLocaleString()} قطعة) إلى المخزون`);
  } else if (res.restoredStock) {
    lines.push("تم إرجاع الكميات إلى المخزون");
  }

  // Payments line
  const deletedPayments = Number((res as any).deletedPayments || 0);
  if (deletedPayments > 0.01) {
    lines.push(`أُلغيت دفعات بقيمة ${deletedPayments.toLocaleString()}`);
  } else if (res.convertedToCredit > 0.01) {
    lines.push(`تحويل ${res.convertedToCredit.toLocaleString()} إلى رصيد دائن للعميل`);
  }

  // Balance line (skip for POS — no customer card)
  if (!opts?.isPos && res.customerId) {
    const net = netBalanceOf({
      balance: res.newCustomerBalance ?? 0,
      credit_balance: res.newCustomerCredit ?? 0,
    });
    let balLine: string;
    if (Math.abs(net) < 0.01) balLine = "رصيد العميل الآن: مسدَّد";
    else if (net > 0) balLine = `رصيد العميل الآن: عليه ${net.toLocaleString()}`;
    else balLine = `رصيد العميل الآن: له ${Math.abs(net).toLocaleString()}`;
    lines.push(balLine);
  }

  if (opts?.extraSuffix) lines.push(opts.extraSuffix);

  toast.success(title, {
    duration: 7000,
    description: lines.length ? lines.join(" · ") : undefined,
  });
}
