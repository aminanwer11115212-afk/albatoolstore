# خطة: حذف ذكي للفئة/الماركة/المستودع/المورّد مع فك الربط من المنتجات

## المشكلة الحالية
عند محاولة حذف فئة/ماركة مستخدمة في منتجات، يظهر فقط toast خطأ يرفض الحذف. المطلوب: عرض حوار تأكيد يوضح عدد المنتجات المرتبطة، ويسمح بـ **الحذف مع فكّ الربط تلقائياً من كل تلك المنتجات** (مثل ما تم في الجغرافيا).

## المبدأ الموحّد
- **صفر ارتباطات** → confirm بسيط ثم حذف مباشر (كما هو).
- **مرتبط بمنتجات فقط** → حوار ذكي: "مرتبطة بـ N منتج، سيتم فكّ الربط ثم الحذف. تأكيد؟".
- **مرتبط بحركات محاسبية غير قابلة للفك** (فواتير شراء للمورد مثلاً) → رفض واضح مع سرد أول 5 عناصر (كما هو).

## الملفات

### 1) جديد — `src/components/shared/ConfirmUnlinkDeleteDialog.tsx`
حوار عام يعرض:
- اسم العنصر ونوعه ("الفئة: اكس 100").
- قائمة بأول 5-10 منتجات مرتبطة + "و N آخرون".
- زر «حذف مع فكّ الربط» (destructive) + إلغاء.

### 2) تحديث — `src/pages/ProductsPage.tsx`
استبدال `deleteCategoryFromSystem` / `deleteBrandFromSystem` / `deleteWarehouseFromSystem` / `deleteSupplierFromSystem` لتصبح:
1. تحسب الاستخدام (كما الآن).
2. إذا > 0 وقابل للفك → تفتح `ConfirmUnlinkDeleteDialog` بدل toast رفض.
3. عند التأكيد:
   - **فئة**: `DELETE FROM product_category_links WHERE category_id=?` + `UPDATE products SET category_id=NULL WHERE category_id=?` ثم حذف الفئة.
   - **ماركة**: نفس المنطق مع `product_brand_links` + `products.company_id`.
   - **مستودع**: `UPDATE products SET warehouse_id=NULL WHERE warehouse_id=?` ثم حذف. (تحذير: قد يترك منتجات بلا مخزن — نظهرها في الحوار.)
   - **مورّد منتج**: `UPDATE products SET supplier_id=NULL` — لكن **يظل** الرفض إن كانت هناك `purchase_orders` مرتبطة (غير قابل للفك).
4. توست نجاح + invalidate queries.

### 3) تحديث — `src/pages/CustomersPage.tsx`
نفس المبدأ للمجموعات/الترحيلات/الوجهات (الحوار الموحّد بدل toast رفض):
- `deleteGroupFromSystem` / `deleteTransporterFromSystem` / `deleteDestinationFromSystem` تنقل من "رفض" إلى "فكّ الربط بعد التأكيد" — مع الحفاظ على العملاء (فقط nullify الـFK).
- ملاحظة: منطق الجغرافيا (اتجاه/ولاية/مدينة/محلية) موجود بالفعل عبر `DeleteGeoDialog` — لا تغيير.

### 4) تحديث — `src/pages/SuppliersPage.tsx`
حذف المورّد من صفحة الموردين: لا نغيّر الرفض عند وجود فواتير/معاملات (خطر مالي)، لكن نضيف رسالة أوضح تشير للفواتير المرتبطة.

## تفاصيل تقنية

```ts
// آلية فك ربط الفئة قبل حذفها
await supabase.from("product_category_links").delete().eq("category_id", id);
await supabase.from("products").update({ category_id: null }).eq("category_id", id);
await supabase.from("product_categories").delete().eq("id", id);
```

كل العمليات في نفس الدالة، بدون Transaction (Supabase JS لا يدعم) — لكن الترتيب آمن: فك أولاً ثم حذف.

## اختبارات القبول
1. حذف فئة غير مستخدمة → confirm واحد ثم تختفي فوراً.
2. حذف فئة مستخدمة في 235 منتج → يظهر الحوار مع قائمة أول 5-10 أسماء + "و 230 آخرون" + زر أحمر «حذف مع فكّ الربط» → بعد التأكيد تختفي الفئة وتصبح خانة الفئة فارغة في تلك المنتجات.
3. حذف ماركة مستخدمة → نفس التدفّق.
4. حذف مستودع مستخدم → حوار تحذير خاص "سيصبح N منتج بدون مخزن" + تأكيد.
5. حذف مورّد منتج (من قائمة داخل المنتج) مستخدم بفواتير شراء → **رفض** كما هو مع رسالة واضحة.
6. حذف مجموعة/ترحيل/وجهة مستخدمة → حوار «فكّ الربط ثم حذف».

## توزيع Subagents (بالتوازي)

- **Agent A — Dialog + Products page**: إنشاء `ConfirmUnlinkDeleteDialog.tsx` + تعديل `ProductsPage.tsx` (الدوال الأربع).
- **Agent B — Customers page**: تعديل `CustomersPage.tsx` (المجموعات/الترحيلات/الوجهات) لاستخدام نفس الحوار.

يبدأ B بعد أن يكتب A ملف الحوار (بسبب import مشترك). عملياً سنشغّلهما تسلسلياً على مسار قصير أو نتفق على واجهة الـProps أولاً ثم بالتوازي.

## خارج النطاق
- لا تغيير على `SuppliersPage.tsx` منطق الرفض (خطر مالي).
- لا تغيير على DB schema — كل شيء client-side.
