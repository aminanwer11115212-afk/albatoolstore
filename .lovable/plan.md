# خطة: تحديث فوري (Optimistic) لكل التعديلات في صفحتي العملاء والمنتجات

## الهدف
أي تعديل/إضافة/ربط (عمود، فئة، ماركة، مستودع، مورد، وجهة، ترحيل… إلخ) يظهر **فوراً** في الواجهة دون انتظار الخادم، والحفظ والربط يجري في الخلفية بصمت، مع تراجع تلقائي (rollback) إن فشل، وبدون منع المستخدم من متابعة العمل.

## النطاق
- `src/pages/ProductsPage.tsx`
- `src/pages/CustomersPage.tsx`
- `src/components/EditableCell.tsx` (موجود فيه Optimistic بالفعل — نتحقق فقط)
- `src/components/InlineSearchSelect.tsx` (سنضيف دعم Optimistic للقيمة المختارة)

## المبادئ المطبَّقة
1. **Optimistic local state**: كل خلية/قائمة منسدلة تعرض القيمة الجديدة فوراً بعد التفاعل.
2. **React Query optimistic mutations**: استخدام `onMutate` لكتابة الكاش مسبقاً، `onError` لاسترجاع الـ snapshot، `onSettled` لإبطال الكاش (مع `refetchType: "active"` فقط).
3. **عدم انتظار `await`** في معالجات النقر — إطلاق mutation و المتابعة.
4. **لا spinners حاجبة** — مؤشر خفيف فقط (مثل ما يفعله `EditableCell` الآن بـ `opacity: 0.75`).
5. **Rollback صامت** عند الفشل + Toast خطأ بسيط.
6. **التطبيق على كل العمليات**: ليس فقط الحقول النصية بل أيضاً:
   - تغيير الفئة/الماركة الأساسية + روابط M2M
   - إضافة/إزالة مستودع، مورد، وجهة، ترحيل
   - رفع/حذف الصورة
   - تغيير السعر/الكمية/الباركود
   - التعديلات المماثلة في صفحة العملاء (المنطقة، الهاتف، النوع، إلخ)

## التنفيذ

### 1) ProductsPage.tsx
- توحيد كل `update.mutateAsync` داخل دوال خلايا الجدول لتستخدم نمط `optimistic update` على كاش `["products-with-details"]` و`["products"]`:
  - في `onMutate`: حفظ snapshot ثم `setQueryData` للقيمة الجديدة.
  - في `onError`: إرجاع الـ snapshot + toast.
  - في `onSettled`: invalidate.
- معالجات الخلايا (Category, Brand, Warehouse, Supplier) تستدعي mutate **بدون await** وتغلق القائمة فوراً.
- دوال الـ M2M (`syncProductCategoryLinks` / `syncProductBrandLinks`): تشغيل في الخلفية مع تحديث متفائل لقائمة الروابط محلياً.
- `createXInline` (فئة/ماركة/مستودع/مورد): إضافة العنصر للكاش فوراً بـ id مؤقت ثم استبداله بعد الرد.
- رفع الصورة: عرض blob URL محلي فوراً ثم استبداله بالـ URL النهائي.

### 2) CustomersPage.tsx
- نفس النمط: تعديل خلايا (الاسم، الهاتف، المنطقة، النوع، الملاحظات…) عبر mutation متفائل على كاش `["customers"]`.
- إضافة عميل: insert فوري في الكاش بـ id مؤقت.

### 3) InlineSearchSelect
- إضافة prop اختياري `optimisticValue` ليعرض القيمة الجديدة فوراً بعد الاختيار قبل أن يصل التحديث من الأب عبر الكاش.

### 4) سلوك موحَّد للأخطاء
- toast واحد عند الفشل + استرجاع تلقائي للقيمة القديمة.
- لا يتم قفل الصف أو الصفحة أثناء الحفظ.

## ما لن يتغيّر
- مخطط قاعدة البيانات أو RLS.
- منطق التحقق (validation) الحالي.
- الأعمدة المعروضة وترتيبها.
- صفحات أخرى غير المذكورة.

## ترتيب التنفيذ
1. ProductsPage: خلايا الحقول البسيطة (نص/رقم) — توحيد نمط Optimistic.
2. ProductsPage: خلايا العلاقات (فئة/ماركة/مستودع/مورد) + M2M.
3. ProductsPage: `createXInline` + رفع الصورة.
4. CustomersPage: نفس الترتيب.
5. تحسين `InlineSearchSelect` بـ optimisticValue.
6. اختبار يدوي سريع لكل نوع تعديل في الصفحتين.
