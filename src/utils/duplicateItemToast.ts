import { toast } from "sonner";

/**
 * تنبيه موحّد عند محاولة إضافة منتج موجود مسبقاً في جدول البنود.
 *
 * - position: top-center → يلفت الانتباه دون أن يحجب الجدول كرسالة modal.
 * - duration: 4500ms → كافٍ ليلاحظه المستخدم وقت إدخال البنود.
 * - أيقونة + لون تحذيري واضح (أصفر/برتقالي) متمايز عن toasts الأخطاء العادية.
 *
 * يُستعمل في جميع شاشات إنشاء/تحرير الوثائق:
 * Invoice / Quote / Purchase / StockReturn.
 */
export function notifyDuplicateItem(productName: string) {
  toast.warning(`الصنف "${productName}" مُضاف مسبقاً في الجدول`, {
    position: "top-center",
    duration: 4500,
    style: {
      background: "hsl(38 92% 50%)",
      color: "#ffffff",
      fontWeight: 700,
      fontSize: "14px",
      border: "2px solid hsl(38 92% 35%)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    },
  });
}
