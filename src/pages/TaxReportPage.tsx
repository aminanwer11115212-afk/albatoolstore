import { Navigate } from "react-router-dom";

// تم حذف تقرير الضريبة بناءً على طلب المستخدم.
// نُبقي ملف stub ليتم استبداله بإعادة توجيه إلى لوحة التقارير.
export default function TaxReportPage() {
  return <Navigate to="/dashboard" replace />;
}
