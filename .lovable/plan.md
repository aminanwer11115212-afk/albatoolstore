## الخطة — تحسينات الترحيلات + توحيد اللوجو الجديد

### 1) عرض الناقل/الوجهة المختارَين فورًا في معاينة كشف الترحيلات
المشكلة: المعاينة على اليسار (`DispatchPrintPreview`) تقرأ فقط الترحيلات المحفوظة في `invoice_transports`. لو اخترت "Amiko System / أم درمان" في صف الفاتورة قبل الضغط على «تثبيت»، لن يظهرا في المعاينة.

الحل:
- رفع `rowChoice` من `ReadyToShipPanel` إلى `DispatchPage` (state مشترك، إلى جانب `selectedIds`).
- إضافة prop جديد `liveChoices: Record<invoiceId, { transporter, destination }>` لـ `DispatchPrintPreview`.
- داخل `DispatchPrintPreview`/`dispatchReportPrint.ts`: إذا كانت الفاتورة بلا `invoice_transports` محفوظة لكن لها `liveChoices`، نُولّد سطر ترحيل "تجريبي" يحوي اسم الناقل واسم الوجهة (نضمّه إلى `doc.transports` قبل توليد HTML)، مع علامة CSS خفيفة (مثلاً خلفية شفافة + وسم «معاينة») لتمييزه عن سجل محفوظ.
- جلب أسماء الناقلين/الوجهات يتم من نفس الـ hooks المستخدمة في `ReadyToShipPanel` (`useTransporters`, `useDestinations`) ويُمرَّر إلى المعاينة كخريطة `id → name`.

### 2) زر «تثبيت كمعتاد» للناقل والوجهة على مستوى العميل
المطلوب: عند الضغط على زر/خيار التثبيت، يُحفظ الناقل + الوجهة كـ«المعتاد» للعميل، ويظهران تلقائيًا في أي صفحة لاحقة (إنشاء فاتورة، صفحة ترحيل الفاتورة، إدارة الترحيلات).

التنفيذ في `src/components/dispatch/ReadyToShipPanel.tsx` ضمن دالة `dispatchRow`:
- بعد `INSERT` في `invoice_transports` بنجاح، وإذا كانت الفاتورة لعميل حقيقي (`customer_id` موجود):
  - **`customer_preferred_transporter`**: `upsert` على `(customer_id)` ليصبح `transporter_id = choice.transporterId`. (إن لم يوجد سطر سابق نُدخل جديدًا.)
  - **`customer_destinations`**: نضمن وجود ربط `(customer_id, destination_id)` ثم نضع `is_default = true` على هذا الربط، ونصفّر `is_default` على باقي الوجهات للعميل (لتبقى وجهة افتراضية واحدة فقط).
  - **`customer_transporters`** (الربط الذي يحدّ القائمة): نضمن وجود سطر `(customer_id, transporter_id)` إن لم يكن.
- إضافة خانة اختيار صغيرة في رأس الصف "📌 ثبّت كمعتاد لهذا العميل" (افتراضيًا مفعّلة لأن المستخدم طلبها كسلوك أساسي). إن أُلغيت، يتم الحفظ في `invoice_transports` فقط دون ترقية المعتاد.
- إبطال كاش `useQueryClient` لمفاتيح:
  `customer_preferred_transporter`, `customer_destinations`, `customer_transporters` حتى تتحدّث جميع الصفحات.

أثر هذا على باقي الصفحات (لا حاجة لتعديل كود إضافي):
- `InvoiceTransportPage` يقرأ بالفعل وجهة العميل الافتراضية ويعبّئها (سيُحمَّل تلقائيًا).
- `ReadyToShipPanel.optionsForInvoice` يستخدم `preferred` و`is_default` كقيم افتراضية للصف الجديد للعميل.
- تحديث `InvoiceTransportPage` ليُحمّل أيضًا الناقل المُفضّل (`customer_preferred_transporter`) كقيمة افتراضية لخانة الناقل عند فتح الصفحة لفاتورة العميل (إضافة بسيطة، 5 أسطر).

### 3) توحيد شعار البتول الجديد في كل مواضع الطباعة
ملف اللوجو الجديد المرفوع: `user-uploads://native_1782211614496_0.png` (نمر يقفز فوق كلمة «البتول»).

التنفيذ على خطوتين متوازيتين بحيث يستفيد منه كل قالب موجود وكل قالب مستقبلي:

أ. **رفعه إلى CDN عبر lovable-assets** ثم استخدام رابطه الثابت:
   - إنشاء `src/assets/albatool-logo.png.asset.json` يحوي رابط CDN.
   - استبدال ثابت `LOGO_FALLBACK` في كل الملفات التالية برابط الـ CDN الجديد:
     - `src/utils/printTemplate.ts`
     - `src/utils/transportPackagingPrint.ts`
     - `src/utils/dispatchReportPrint.ts`
     - `src/utils/statementPrintTemplate.ts`
     - `src/utils/financialReportPrintTemplate.ts`
     - `src/pages/PublicCustomerStatementPage.tsx`
     - `src/components/transport/TransportDialog.tsx`
   - في الصفحات التي تعتمد فقط على `company.logo_url` ولا تحوي fallback (`InvoiceViewPage.tsx`, `QuoteViewPage.tsx`, `StockReturnViewPage.tsx`): استبدال `"/images/company-logo.png"` بـ نفس رابط الـ CDN، حتى لو لم تحدَّث `company_settings`.

ب. **تحديث `company_settings.logo_url` في قاعدة البيانات** ليصبح هو الرابط الجديد — هذا يجعل كل المكونات التي تقرأ `company.logo_url` (وهي الأغلبية) تستخدمه مباشرة بدون لمس الكود. (تتم عبر `supabase--insert` بتحديث الصف الموجود.)

النتيجة: كل طباعة (فاتورة، عرض سعر، تغليف، ترحيل، كشف ترحيلات، كشف عميل، تقرير مالي، استرجاع مخزون) تظهر باللوجو الجديد في نفس المواقع الحالية بلا تغيير في التصميم.

### 4) ملفات تتعدل/تنشأ
- معدّل: `src/pages/DispatchPage.tsx` — رفع `rowChoice` كحالة مشتركة وتمريرها للمعاينة.
- معدّل: `src/components/dispatch/ReadyToShipPanel.tsx`:
  - قبول `rowChoice` و`setRowChoice` كـ props اختيارية (controlled).
  - خانة «📌 ثبّت كمعتاد» في كل صف.
  - منطق upsert على `customer_preferred_transporter` + `customer_destinations`.
- معدّل: `src/components/dispatch/DispatchPrintPreview.tsx` — استقبال `liveChoices` ودمجها مع الترحيلات قبل بناء HTML.
- معدّل: `src/utils/dispatchReportPrint.ts` — قبول overlay من choices غير محفوظة وعرضها كسطر «معاينة».
- معدّل: `src/pages/InvoiceTransportPage.tsx` — تحميل الناقل المفضل كقيمة افتراضية.
- معدّل: قوالب الطباعة (المذكورة في 3-أ) لاستبدال `LOGO_FALLBACK`.
- جديد: `src/assets/albatool-logo.png.asset.json` (CDN pointer).
- تحديث بيانات: صف واحد في `company_settings` (`logo_url = <CDN URL>`).

### 5) التحقق بعد التنفيذ
- في صفحة إدارة الترحيلات: اختيار ناقل/وجهة لصف فاتورة (بدون ضغط «تثبيت») → يظهران فورًا في كشف المعاينة على اليسار.
- الضغط على «تثبيت» مع خانة 📌 مفعّلة → فتح صفحة العميل أو صفحة ترحيل فاتورة جديدة له يُظهر الناقل/الوجهة جاهزَين.
- طباعة أي مستند (فاتورة/عرض سعر/ترحيل/تغليف/كشف حساب) تُظهر اللوجو الجديد للبتول في نفس المكان.
- لا تغيير في المخطط/RLS/Edge functions.
