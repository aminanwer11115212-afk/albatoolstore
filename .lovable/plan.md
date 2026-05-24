# تعديل سلوك زر X في القوائم المنسدلة لخلايا الفئة والماركة

## السلوك المطلوب
عند الضغط على X بجانب خيار (فئة أو ماركة) داخل قائمة الخيارات في خلية جدول المنتجات:
- إن لم يكن هناك أي منتج آخر مرتبط بهذه الفئة/الماركة → تُحذف نهائياً من النظام (من جدول `product_categories` أو `product_companies`).
- إن وُجدت منتجات أخرى تستخدمها → لا تُحذف، ويظهر تنبيه يعرض أسماء المنتجات (أو أول عدد منها + الإجمالي) التي تستخدمها مع رفض الحذف.

ينطبق ذلك على خليتي **الفئة** و**الماركة** في جدول إدارة المنتجات فقط (`src/pages/ProductsPage.tsx`).

## التغييرات

### 1) دالة جديدة `deleteCategoryFromSystem(categoryId)`
- تجلب من `product_category_links` كل المنتجات المرتبطة بـ `categoryId`.
- إن كانت > 0:
  - تجلب أسماء المنتجات من قائمة `products` المحلية.
  - `toast.error` يعرض: «لا يمكن حذف الفئة، مستخدمة في: منتج1، منتج2، ...» (نقتطع بعد 5 ونضيف «و N آخرون»).
  - return false.
- إن كانت = 0:
  - تحذف من `product_categories`.
  - تُبطل الكاش (`product_categories`, `products-with-details`).
  - `toast.success("تم حذف الفئة")` و return true.

### 2) دالة جديدة `deleteBrandFromSystem(brandId)`
- نفس المنطق لكن على `product_brand_links` و`product_companies`، مع تحقق إضافي من `products.company_id = brandId` (للتوافق مع المنتجات القديمة).
- تُبطل كاش `product_companies`.

### 3) ربط الدوال بالقائمتين
- خلية الفئة (سطر ~1693): استبدال `onDelete={(opt) => deleteProductCategory(p.id, opt.value)}` بـ `onDelete={(opt) => deleteCategoryFromSystem(opt.value)}`.
- خلية الماركة (سطر ~1717): استبدال `onDelete={(opt) => deleteProductBrand(p.id, opt.value)}` بـ `onDelete={(opt) => deleteBrandFromSystem(opt.value)}`.
- إبقاء `showDeleteButton` كما هو.

### 4) ما لا يتغير
- لا تتغير خلية المستودع/المورد.
- لا تتغير دوال `deleteProductCategory` / `deleteProductBrand` (تبقى للاستخدامات الأخرى إن وُجدت)، أو تُحذف لاحقاً إن لم يعد أحد يستدعيها.
- لا تغييرات في `InlineSearchSelect` ولا في الـ schema.
