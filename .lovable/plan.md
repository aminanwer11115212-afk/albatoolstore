
## 1) حذف كامل للناقلين والترحيلات وربطهم بالعملاء (لمرة واحدة عبر insert)

سيتم تنفيذ هذه العمليات دفعة واحدة (DELETE فقط، بدون تغيير في المخطط):

- `customer_preferred_transporter` — كل الصفوف
- `customer_transporters` — كل الصفوف
- `destination_transporters` — كل الصفوف
- `locality_transporters` — كل الصفوف
- `invoice_transports` + `invoices_transports_items` — كل الصفوف
- `quote_transports` — كل الصفوف
- `transporters` — كل الصفوف

جدول العملاء نفسه لن يُمس (فقط أعمدة الربط الخارجية تُنظَّف تلقائياً بحذف المرجع). عمود `customers.preferred_transporter_id` سيُصبح NULL في كل الصفوف.

## 2) نقل «منطقة الخطر» إلى اختصار المطوّر Ctrl+Shift+9

الوضع الحالي:
- `HiddenDevResetDialog` (Ctrl+Shift+9) يحتوي حالياً: تصفير كميات المنتجات + تصفير كشوف العملاء.
- `CompanySettingsPage → /settings/danger` يحتوي: تصفير الفواتير/العروض/المشتريات/البنك/العملاء.

التنفيذ:
- توسعة `HiddenDevResetDialog` ليضم كل خيارات «منطقة الخطر» الحالية (invoices/quotes/purchases/bank/customers) عبر `admin_reset_transactional_data`، بالإضافة للخيارين الحاليين (stock/ledger) عبر `admin_reset_stock_and_ledgers`.
- إضافة خيار جديد داخله: «تصفير الناقلين والترحيلات» (يستدعي نفس عمليات الحذف في الخطوة 1) لأي عملية مستقبلية.
- إزالة تبويب «منطقة الخطر» من `CompanySettingsPage` والرابط في القائمة الجانبية للإعدادات + إزالة `/settings/danger` من `App.tsx`.
- إبقاء نفس شرط الأمان: `admin` فقط + كلمة تأكيد «تصفير».

## 3) صفحة إدارة العملاء — إخفاء العنوان + إعادة ترتيب الأعمدة

- إضافة خاصية «إخفاء عمود» لكل الأعمدة (عبر قائمة إعدادات أعمدة صغيرة أعلى الجدول، مع التركيز على «العنوان»). الحالة تُحفظ بمفتاح لكل مستخدم × form-factor:
  `lov:u:{uid}:ff:{mobile|desktop}:customers:hiddenCols`
- إضافة خاصية «إعادة ترتيب الأعمدة» بالسحب والإفلات (drag-and-drop على رأس الجدول) — أي عمود يمكن نقله لأي موضع، بما فيه جعل «العنوان» آخر عمود. يُحفظ بمفتاح:
  `lov:u:{uid}:ff:{mobile|desktop}:customers:colOrder`
- زر «إعادة للافتراضي» يستعيد الترتيب والإظهار الأصليين.
- الفلاتر والبحث تظل تعمل حتى لو أُخفي العمود (البحث بالعنوان لا ينكسر).

## تفاصيل تقنية

- سيُستخدم `@dnd-kit/core` + `@dnd-kit/sortable` (مثبت أصلاً في المشروع إذا وُجد؛ وإلا سيُثبَّت).
- تخصيصات الأعمدة لا تتشارك بين الموبايل والديسكتوب (حسب قاعدة `albatool-user-prefs`).
- عرض الأعمدة (`useColumnWidths`) يبقى كما هو — الترتيب طبقة منفصلة فوقه.

## الملفات المتأثرة

- `src/components/HiddenDevResetDialog.tsx` — توسعة كاملة
- `src/pages/CompanySettingsPage.tsx` — حذف قسم «منطقة الخطر» والتبويب
- `src/App.tsx` — حذف route `/settings/danger` + `HiddenDevResetDialog` يبقى
- `src/pages/CustomersPage.tsx` — إضافة hidden columns + drag-reorder
- (احتمالاً) `src/hooks/useColumnOrder.ts` — hook جديد صغير
- عمليات DELETE عبر `supabase--insert` (لا migration)

## غير مشمول

- لا تعديل على schema DB.
- لا حذف من جدول `customers`.
- لا لمس لصفحات Dispatch/Transports UI (ستُصبح فارغة تلقائياً بعد الحذف).

بعد الموافقة أنفّذ الأجزاء بالتوازي حيثما أمكن.
