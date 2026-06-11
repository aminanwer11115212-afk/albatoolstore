import { Navigate } from "react-router-dom";

/**
 * الصفحة القديمة كانت تعرض عملات افتراضية مزيفة لا تُحفظ في قاعدة البيانات.
 * تم توحيد إدارة العملات في صفحة /finance/currencies التي تعتمد على
 * جدولي currencies و exchange_rates مباشرةً.
 */
export default function CurrencySettingsPage() {
  return <Navigate to="/finance/currencies" replace />;
}
