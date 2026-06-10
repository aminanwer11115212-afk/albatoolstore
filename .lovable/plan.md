## السبب
خطأ "Bucket not found" يظهر لأن مشروع التخزين لا يحتوي أي bucket. الكود يحاول الرفع إلى `invoice-attachments` (والمماثلين للعروض والمشتريات) لكنها غير موجودة.

## الخطة

1. **إنشاء 3 buckets خاصة (private):**
   - `invoice-attachments`
   - `quote-attachments`
   - `purchase-attachments`

2. **إضافة سياسات RLS على `storage.objects`** للسماح للمستخدمين المسجلين بـ:
   - قراءة / رفع / تحديث / حذف الملفات داخل هذه الـ buckets الثلاثة.
   - الإبقاء عليها private (نستخدم Signed URLs الموجود في `signedAttachmentUrl.ts`).

3. **عدم تغيير أي كود تطبيق** — الكود الحالي للرفع/المعاينة/الحذف صحيح ويستخدم Signed URLs بالفعل.

بعد التنفيذ ستعمل شاشة إرفاق الفواتير، والعروض، والمشتريات مباشرة.
