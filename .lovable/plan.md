## الهدف

1. شاشتا **إدارة العملاء** و**إدارة المنتجات** يجب أن تعرض على الجوال **نفس** أعمدة الديسكتوب وأزرار شريط الأدوات وأزرار الإجراءات في كل صف، تماماً كما يراها المستخدم على لابتوب/PC.
2. كل نافذة منبثقة في النظام (Dialog / Sheet / Drawer / AlertDialog) عند فتحها يجب أن **يظهر الكيبورد تلقائياً** على أول حقل قابل للكتابة، وكل حقل آخر داخلها يستقبل الكيبورد بشكل سليم عند النقر.

## نطاق التغيير

### الجزء الأول — أعمدة العملاء/المنتجات على الجوال

التشخيص الحالي:

- شاشة العملاء: الكود يحتوي `<MobileDocCard>` للجوال + جدول للديسكتوب. هنالك CSS داخل الصفحة يُلغي بطاقات الجوال (`.mobile-customers-list { display: none }`) ويُظهر الجدول، لكن لا يزال هنالك قواعد عامة في `src/index.css` تكسر التجربة على الموبايل:
  - `.legacy-dt-toolbar { flex-direction: column }` → شريط الأدوات يصبح عمودياً.
  - `.legacy-actions { flex-wrap: wrap }` → أزرار الإجراءات في كل صف تلتف لأسطر متعددة.
  - `.recent-items-sidebar, .desktop-only { display: none }` → أزرار/لوحات مخفية.
  - `.legacy-table { min-width: 720px }` فقط، فالأعمدة لا تأخذ عرضها الكامل كالديسكتوب.
- شاشة المنتجات: مماثلة، وقسم بطاقات الجوال معطّل بالفعل (`{false && isMobile && …}`).

التغييرات:

1. إضافة كلاس مشترك جديد `desktop-on-mobile` نضعه على حاوية صفحتي العملاء والمنتجات.
2. تجاوز موضعي داخل هذا الكلاس (في `src/index.css` ضمن `@media (max-width: 767px)`) يجعل:
   - شريط الأدوات يعود **أفقياً** مع تمرير أفقي عند الحاجة بدل التكدّس العمودي.
   - أزرار الإجراءات داخل الصفوف تبقى في سطر واحد (no-wrap) مع `min-width` ثابت لكل زر.
   - الجدول يُعرض بعرضه الكامل (يساوي مجموع عرض الأعمدة على الديسكتوب) مع تمرير أفقي ناعم باللمس.
   - الـ sidebar الجانبي للعناصر الأخيرة يبقى مخفياً (هذا منطقي على الجوال)، أمّا أزرار التولبار الرئيسية فتظهر كما هي.
   - حذف نهائي لقسم `<MobileDocCard>` من شاشة العملاء (في المنتجات معطّل أصلاً) لتقليل الكود.

نتيجة الزووم: المستخدم سيستخدم zoom/تمرير أفقي ليرى نفس الأعمدة، وهذا هو السلوك المطلوب.

### الجزء الثاني — autofocus الكيبورد في كل النوافذ

الوضع الحالي بعد جرد سريع لـ 35 ملف يحتوي `DialogContent`/`SheetContent`:

- بعض النوافذ فيها `autoFocus` يدوي على حقل واحد (QuickAddProductDialog، ItemNoteDialog، MessageImportDialog).
- **معظم** النوافذ لا تعتمد autoFocus على أول حقل (CustomerFormDialog، TransportDialog، PackagingDialog، ShippingDispatchDialog، ExchangeRateDialog، ChargeBalanceDialog، AccountsOpeningBalanceDialog، InvoiceRevisionsDialog، DeletedItemsTrayDialog، PrintTilesDialog، QuoteConvertedDialog، InstallPwaDialog، UnsavedChangesDialog، InvoiceAttachmentsDialog، QuoteAttachmentsDialog، PurchaseAttachmentsDialog، CurrenciesPage dialog، PackagingTypesPage dialog، إلخ).
- Radix افتراضياً يُركّز على أول عنصر قابل للتركيز عند فتح Dialog، لكن غالباً يكون زر إغلاق أو زر Save بدل أول input، فلا يظهر الكيبورد.

الحل (طبقة موحّدة بدل تعديل 35 ملف يدوياً):

1. **توسيع `DialogContent` و `SheetContent` في `src/components/ui/dialog.tsx` و `src/components/ui/sheet.tsx`**: عند الفتح، نبحث برمجياً عن أول حقل كتابة قابل للاستخدام داخل النافذة (`input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), [contenteditable=true]`) ونستدعي `.focus()` بعد frame واحد. هذا يفعّل الكيبورد على iOS/Android تلقائياً.
2. علم انسحاب اختياري `data-no-autofocus` على `DialogContent` للنوافذ التي لا نريد فيها هذا السلوك (مثل نوافذ التأكيد فقط أو القوائم المتدرّجة الكبيرة).
3. الحفاظ على وصول لوحة المفاتيح والـ Esc والـ focus trap كما يفعل Radix افتراضياً (لا نلمس آلية التركيز الداخلية لـ Radix، فقط نوجّه أول focus لحقل كتابة).
4. AlertDialog يبقى كما هو (نوافذ تأكيد، لا يوجد حقول).

### الجزء الثالث — فحص شامل لكل النوافذ

بعد التعديل، أمشط 35 ملف يحتوي نوافذ منبثقة وأتأكد من:

- لا يوجد حقل كتابة بـ `readOnly` بطريق الخطأ يمنع ظهور الكيبورد (حالياً جرد سريع لم يُظهر أي `readOnly` في مكونات النوافذ — جيد).
- كل `<Input>` فعلاً `<input>` HTML قياسي (الـ shadcn input يلتزم بذلك).
- النوافذ الكبيرة (CustomerFormDialog، QuickAddProductDialog، TransportDialog، PackagingDialog، InvoiceCreatePage modals، QuoteCreatePage modals، StockReturnCreatePage، PurchaseCreatePage) — أتحقق يدوياً أن أول حقل في كل واحدة منها هو الحقل الصحيح للبدء (الاسم/الرقم/الوصف…).
- على iOS: تكبير-الصفحة-عند-التركيز (zoom) معطّل عالمياً (`font-size: 16px` في الـ media query لكل input داخل dialog) — موجود في `src/index.css` السطر 940-945.

## تحذيرات (يجب مراعاتها)

1. **تجربة الجوال على الجدول الكامل**: مع آلاف العملاء/المنتجات وأعمدة كثيرة، الجدول الكامل على شاشة 360px سيتطلب تمريراً أفقياً واسعاً جداً. هذا ما طلبته بوضوح، لكن يُستحسن إبقاء **عمود الاسم** ثابتاً (sticky-right في RTL) ليبقى مرئياً أثناء التمرير. سأطبّق هذا.
2. **iOS auto-keyboard**: Safari يفتح الكيبورد فقط على focus ناتج عن إيماءة مستخدم. فتح Dialog ناتج عن نقر = إيماءة، لذا التركيز البرمجي بعد فتح Dialog يعمل عادةً. في حالات نادرة (Dialog يُفتح من setTimeout غير ناتج عن نقر) قد لا يفتح الكيبورد — هذا قيد المتصفح وليس قابلاً للحل برمجياً.
3. **نوافذ Command/Popover للبحث** (CommandInput) لها `autoFocus` بالفعل، لكن في بعض المتصفحات لا يفتح الكيبورد إلا بعد نقرة. لن أغيّر سلوكها لأنها تعمل كما هو متوقع داخل combobox.
4. **التولبار الأفقي على شاشة صغيرة** للعملاء/المنتجات سيكون قابلاً للتمرير أفقياً (overflow-x: auto)؛ لن أقلّص الأزرار أو أُخفي منها شيئاً.
5. **اختبار شامل بعد التطبيق**: سأفتح بريفيو الموبايل وأتحقق بصرياً من الشاشتين، ثم أفتح عينة من 5–6 نوافذ منبثقة وأرى الكيبورد ينفتح تلقائياً.

## الملفات التي ستُعدَّل

- `src/components/ui/dialog.tsx` — إضافة auto-focus لأول حقل كتابة.
- `src/components/ui/sheet.tsx` — نفس الشيء.
- `src/index.css` — قواعد `.desktop-on-mobile` تحت `@media (max-width: 767px)` + عمود الاسم sticky.
- `src/pages/CustomersPage.tsx` — إضافة كلاس `desktop-on-mobile` للحاوية وحذف قسم بطاقات الجوال.
- `src/pages/ProductsPage.tsx` — إضافة كلاس `desktop-on-mobile` وحذف بقايا قسم بطاقات الجوال المعطّل.
- (اختياري عند الحاجة) ملف نافذة بمحتوى خاص لا يريد autofocus → نضع له `data-no-autofocus`.

## الذي **لن** يتغير

- شاشات الفواتير وعروض الأسعار على الجوال تبقى ببطاقات `MobileDocCard` (لم يطلب المستخدم تغييرها).
- أزرار/ألوان/أحجام الأزرار في الديسكتوب لا تتغير.
- منطق RLS، triggers، أي شيء في قاعدة البيانات.
