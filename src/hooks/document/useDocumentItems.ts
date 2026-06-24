import { useState } from "react";
import { newRow, type InvRow } from "@/utils/invoiceCreateHelpers";

/**
 * useDocumentItems — يدير صف الإضافة السريعة + صفوف الجدول لصفحات الفواتير/العروض.
 * استخراج آمن من InvoiceCreatePage: نفس الأسماء، نفس قيم الـ initial state.
 * تم إبقاء كل منطق التحديث/البحث/الحذف في الصفحة لأنه مرتبط بـ state أخرى (products/defaultRate).
 *
 *  - `quickRow` / `setQuickRow` : صف الإضافة السريعة.
 *  - `rows` / `setRows`         : صفوف جدول البنود.
 *  - `resetQuickRow(rate)`      : إعادة `quickRow` لصف فارغ بسعر تحويل افتراضي.
 *  - `clearAllRows()`           : تفريغ الجدول.
 */
export function useDocumentItems() {
  const [quickRow, setQuickRow] = useState<InvRow>(newRow());
  const [rows, setRows] = useState<InvRow[]>([]);

  const resetQuickRow = (rate: number = 1) => setQuickRow(newRow(rate));
  const clearAllRows = () => setRows([]);

  return {
    quickRow,
    setQuickRow,
    rows,
    setRows,
    resetQuickRow,
    clearAllRows,
  };
}
