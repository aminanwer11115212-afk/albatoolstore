# خطة: توحيد سلوك البحث في كل النظام على "يبدأ بـ"

## الهدف
عند كتابة حرف/كلمة في **أي خانة بحث في النظام**، يجب أن تظهر فقط النتائج التي **تبدأ** بهذا الحرف/الكلمة (startsWith) — في الاسم أو رقم المستند أو SKU أو الهاتف أو اسم العميل/المورّد. لا تطابق في وسط الكلمة (لا includes).

سلوك إضافي مهم لكي يبقى البحث طبيعياً بالعربية:
- تطبيع عربي قبل المطابقة: إزالة التشكيل، توحيد (أ/إ/آ → ا)، (ى → ي)، (ة → ه)، تحويل لأحرف صغيرة، تقليص الفراغات.
- **مطابقة على بداية أي كلمة** داخل الحقل (token startsWith) — مثلاً كتابة "اور" تُظهر "بسكويت اوريو" لأن كلمة "اوريو" تبدأ بـ"اور". هذا يحافظ على راحة الاستخدام مع التزام قاعدة "يبدأ بـ".
- بحث فارغ ⇒ يرجع كل العناصر (أو لا اقتراحات في حالة قوائم الإكمال التلقائي).
- إزالة التكرار عبر id حيث يلزم (لقوائم اقتراح المنتجات).

## المخرَجات

### 1) أداة موحَّدة جديدة
ملف جديد: `src/utils/searchMatch.ts` يحتوي:
- `normalizeAr(s)` — التطبيع العربي/الإنجليزي.
- `startsWithMatch(haystack, query)` — true إذا أي كلمة في haystack تبدأ بـ query (بعد التطبيع).
- `startsWithAny(fields[], query)` — تطبيقها على عدة حقول.
- `filterByStartsWith(items, getFields, query)` — مساعد لقوائم.

### 2) تحديث `src/utils/productMatches.ts`
استبدال `includes` بـ `startsWithAny` على `name` و `sku` مع الحفاظ على فلتر المخزن وإزالة التكرار وحد الـ 10.

### 3) تحديث مكوّنات البحث المشتركة
- `src/components/InlineSearchSelect.tsx` — تبديل `includes` بـ `startsWithMatch`.
- `src/components/transport/SearchableSelect.tsx` — يستخدم حالياً `includes` بعد تطبيع؛ سيتحوّل لـ `startsWithMatch` (مع الإبقاء على نفس التطبيع).
- `src/components/MessageImportDialog.tsx` — بحث المنتجات.
- `src/components/packaging/PackagingItemsManager.tsx` و `src/components/transport/TransportItemsManager.tsx` — دالة `filter` في `<Command>`.
- `src/components/customers/GeoStructurePanel.tsx`.
- `src/components/dashboard/ChargeBalanceDialog.tsx` — بحث العملاء.
- `src/components/SupplierDetailView.tsx` — فلترة "دفع/سداد" تبقى كما هي (ليست خانة بحث مستخدم).

### 4) تحديث صفحات القوائم/الجداول (شريط البحث العلوي)
في كل الصفحات أدناه: استبدال كل استخدامات `(...).toLowerCase().includes(s)` على حقول البحث (الاسم/الرقم/الهاتف/الفئة/الحالة/وصف…) بـ `startsWithMatch` عبر الأداة الموحَّدة:

- `src/pages/InvoicesPage.tsx`
- `src/pages/QuotesPage.tsx`
- `src/pages/SideQuotesPage.tsx`
- `src/pages/CustomersPage.tsx` (شريط البحث + فلاتر الأعمدة بقائمة الخيارات)
- `src/pages/SuppliersPage.tsx`
- `src/pages/ProductsPage.tsx` (فلاتر العمود `name`/`sku` + فلتر الخيارات المنسدلة)
- `src/pages/ProductCompaniesPage.tsx`
- `src/pages/PurchasePage.tsx`
- `src/pages/PackagingTypesPage.tsx`
- `src/pages/StockTransferPage.tsx`
- `src/pages/StockReturnPage.tsx`
- `src/pages/TransactionsPage.tsx`
- `src/pages/FilteredTransactionsPage.tsx`
- `src/pages/AccountsPage.tsx`
- `src/pages/AccountStatementPage.tsx`
- `src/pages/CustomerStatementPage.tsx`
- `src/pages/BankTransfersReportPage.tsx`
- `src/pages/DailyInvoicesReportPage.tsx`
- `src/pages/ActivityLogPage.tsx`
- `src/pages/DataHealthPage.tsx`
- `src/pages/NotificationsPage.tsx`
- `src/pages/CloudUsagePage.tsx`
- `src/pages/ProjectsPage.tsx`
- `src/pages/DispatchPage.tsx`
- `src/pages/InvoicePackagingPage.tsx`، `src/pages/InvoiceTransportPage.tsx`، `src/pages/QuotePackagingPage.tsx`
- `src/pages/EmployeesPage.tsx`
- `src/pages/staff/StaffListPage.tsx`, `StaffCustomersPage.tsx`, `StaffMyRecordsPage.tsx`

### 5) تحديث شاشات الإنشاء (منتقي العميل/المورّد/المنتج)
- `src/pages/InvoiceCreatePage.tsx`
- `src/pages/QuoteCreatePage.tsx`
- `src/pages/PurchaseCreatePage.tsx`
- `src/pages/StockReturnCreatePage.tsx`

كلها لمنتقي العميل/المورد (بحث اسم/هاتف) ومنتقي المنتج وفلتر الصفوف داخل الجدول.

### 6) شريط البحث العام في الـ Navbar/Sidebar
- `src/components/layout/AppNavbar.tsx` و `AppSidebar.tsx` — إن وُجد فيهما منطق فلترة محلي، يُحوَّل لـ startsWith.

### 7) الاختبارات
- تحديث `src/test/productSearchFilter.test.ts` و `src/test/productSearchLiveDedup.test.ts` لتوافق قاعدة "يبدأ بـ" مع تطبيع عربي.
- إضافة `src/test/searchMatch.test.ts` يغطّي: التطبيع، startsWith على بداية الكلمة، بحث فارغ، تعدّد الحقول، حساسية الأحرف، علامات الترقيم العربية.

## ملاحظات مهمّة
- لن نمسّ منطق الأعمال (لا تغييرات على قواعد البيانات/الاستعلامات/الـ RLS). كل التغيير في طبقة الفلترة على الواجهة.
- نحافظ على كل خيارات الفلاتر الأخرى (الحالة، التاريخ، المخزن، التجميد، …) كما هي.
- نحافظ على إزالة التكرار وحدود النتائج الحالية (10 اقتراحات للمنتجات، 8 للعملاء…).
- التنفيذ على دفعات لضمان الجودة:
  - **الدفعة 1**: الأداة الموحَّدة + `productMatches` + المكوّنات المشتركة (InlineSearchSelect/SearchableSelect/Command filters) + اختبارات الأداة.
  - **الدفعة 2**: شاشات الإنشاء الأربع (Invoice/Quote/Purchase/StockReturn).
  - **الدفعة 3**: صفحات القوائم (الفواتير، عروض الأسعار، العملاء، الموردين، المنتجات، المشتريات، …).
  - **الدفعة 4**: باقي الصفحات (التقارير، الإشعارات، النشاطات، المخزون، الموظفين، Staff*) + شريط Navbar/Sidebar + تشغيل الاختبارات وفحص شامل.

هل أبدأ بالدفعة 1؟
