
# الهدف
ضمان أن أي منتج أو عميل يُضاف للنظام يظهر فوراً في **جميع** شاشات الإدخال (فاتورة/عرض سعر/مرتجع مخزون/تحويل مخزون/تغليف/ترحيل) بكامل بياناته، بدون فقدان بسبب حد PostgREST الافتراضي (1000 صف) أو بسبب عدم تحديث الكاش.

# تشخيص الوضع الحالي

## 1) ✅ يعمل بشكل صحيح
- **صفحة المنتجات (`ProductsPage`)** تستخدم `useProductsWithDetails()` المبنية على `fetchAllProducts` التي تجلب كل الصفحات (لا حد 1000).
- **صفحات الإنشاء (فاتورة/عرض سعر/مرتجع مخزون)** تستخدم `fetchAllProducts` للمنتجات.
- **حدث `products:changed` و `customers:changed`** يُطلَق من `useTable` ومن `QuickAddProductDialog` و`CustomerFormDialog` وملفات `stockDeduction` / `stockReceive`، وكل صفحة إنشاء تستمع له وتعيد الجلب.

## 2) ⚠️ مشاكل تحدّ من ظهور البيانات

### أ) جلب العملاء محدود بـ 1000 صف
حالياً 307 عميل فقط، فالأمر يعمل، لكن جميع شاشات الإنشاء تستخدم:
```ts
supabase.from("customers").select("id,name,phone,balance,company").order("name")
```
بدون `range()`. سيتوقف عن إظهار العملاء الجدد بعد العميل رقم 1000.
- `InvoiceCreatePage` (سطر 433, 481)
- `QuoteCreatePage` (سطر 420, 466)
- `StockReturnCreatePage` (سطر 317, 354, 390)

### ب) شاشات تستخدم `useProducts()` المحدود بـ 1000 صف
المنتجات الآن 638، لكن مع نمو الكتالوج ستُفقد منتجات في:
- `src/pages/StockTransferPage.tsx` (سطر 37) — صفحة تحويل المخزون
- `src/components/packaging/PackagingItemsManager.tsx` (سطر 32) — مدير عناصر التغليف داخل الفواتير
- `src/components/transport/TransportItemsManager.tsx` (سطر 26) — مدير عناصر الترحيل داخل الفواتير

### ج) صفحة إدارة العملاء (`CustomersPage`) محدودة بـ 1000 صف
تستخدم `useCustomers()` → `useTable("customers").select("*")` بدون pagination.

## 3) ملاحظة عن البيانات الكاملة
- استعلامات شاشات الإنشاء تختار **أعمدة محدودة عمداً** (id, name, phone, balance, company للعميل) لتسريع الفتح. هذا سلوك مقصود — البحث والاختيار يحتاج هذه الحقول فقط، أما التفاصيل الكاملة فتُجلب عند الاختيار. سأبقي هذا السلوك ولن أوسّعه.

# الخطة

## A) ملف مساعد جديد: `src/lib/fetchAllCustomers.ts`
نسخ نمط `fetchAllProducts` (تقسيم بـ `range()` صفحات 1000) ليجلب كل العملاء مع إمكانية تحديد الأعمدة والترتيب.

## B) تحديث شاشات الإنشاء لاستخدام `fetchAllCustomers`
استبدال `supabase.from("customers").select(...).order("name")` بـ `fetchAllCustomers("id,name,phone,balance,company", { column: "name" })` في:
- `InvoiceCreatePage` (الجلب الأولي + `refetchCustomers`)
- `QuoteCreatePage` (الجلب الأولي + `refetchCustomers`)
- `StockReturnCreatePage` (الجلب الأولي + `refetchCustomers` + جلب العميل عند التحرير لن يتغير لأنه `.eq("id", ...)`)

## C) تحديث الشاشات التي تستخدم `useProducts()` لاستخدام `useProductsWithDetails()`
ل-`StockTransferPage`, `PackagingItemsManager`, `TransportItemsManager` (الأخيرتان تحتاج فقط `id, name, unit, stock_quantity` — لكن `useProductsWithDetails` تجلب كل الصفحات وبيانات مخصبة — مقبول لأنها مُكاش 5 دقائق ومشتركة).

## D) صفحة إدارة العملاء — إضافة Hook غير محدود
إضافة `useCustomersAll()` في `src/hooks/useData.ts` تستخدم `fetchAllCustomers`، واستخدامها داخل `CustomersPage` بدل `useCustomers().data`. أبقي `useCustomers()` للاستخدامات الخفيفة (Dispatch, Transactions, Statistics) التي لا تتأثر حالياً.

## E) لا تغييرات على
- مخطط قاعدة البيانات / RLS / الصلاحيات.
- منطق إضافة عميل/منتج جديد (QuickAdd + CustomerFormDialog) — يعمل الآن صحيحاً عبر الأحداث.
- استعلامات تفاصيل العميل/المنتج عند الاختيار (تبقى كما هي).

# الملفات التي ستُلمس
1. **جديد:** `src/lib/fetchAllCustomers.ts`
2. **تعديل:** `src/hooks/useData.ts` — إضافة `useCustomersAll` فقط.
3. **تعديل:** `src/pages/InvoiceCreatePage.tsx`
4. **تعديل:** `src/pages/QuoteCreatePage.tsx`
5. **تعديل:** `src/pages/StockReturnCreatePage.tsx`
6. **تعديل:** `src/pages/StockTransferPage.tsx`
7. **تعديل:** `src/pages/CustomersPage.tsx`
8. **تعديل:** `src/components/packaging/PackagingItemsManager.tsx`
9. **تعديل:** `src/components/transport/TransportItemsManager.tsx`

# الاختبار بعد التنفيذ
1. إضافة عميل جديد عبر QuickAdd داخل صفحة الفاتورة → يظهر فوراً في البحث.
2. إضافة منتج جديد عبر QuickAdd داخل صفحة الفاتورة → يظهر فوراً.
3. فتح صفحة تحويل المخزون والتغليف والترحيل والتأكد من ظهور كل المنتجات.
4. فتح صفحة إدارة العملاء — تظهر كل الـ307 (وستظهر كل ما يُضاف لاحقاً ولو تجاوز 1000).
