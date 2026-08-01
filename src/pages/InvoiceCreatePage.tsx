import InvoiceCreateScreen from "@/screens/InvoiceCreateScreen";

/**
 * فاتورة آجلة (على الحساب) — إنشاء وتعديل.
 *
 * صفحة مستقلّة بمسارها الخاصّ، ومنطقها في `InvoiceCreateScreen` المشترك مع
 * فاتورة الكاش. الفصل في الصفحة لا في المنطق: تنفصل الشاشتان في الواجهة
 * والمسار، وتبقى المحاسبة واحدة فلا يُصلَح عطلٌ في إحداهما دون الأخرى.
 */
export default function InvoiceCreatePage() {
  return <InvoiceCreateScreen pos={false} />;
}
