/**
 * زر «تخصيص الأعمدة» في صفحة العملاء — غلافٌ فوق اللوحة العامّة.
 * أُبقي بواجهته ومعرّفات اختباره كما هي حين عُمِّمت اللوحة لصفحة المنتجات.
 */
import TableColsControl from "@/components/common/TableColsControl";
import type { useCustomerColsPref } from "@/hooks/useCustomerColsPref";

export default function CustomerColsControl(props: {
  prefs: ReturnType<typeof useCustomerColsPref>;
}) {
  return <TableColsControl prefs={props.prefs} testPrefix="customer" />;
}
