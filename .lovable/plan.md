
# إضافة الناقلين والوجهات إلى صفحة إدارة الترحيلات

الهدف: على صفحة `/dispatch`، يقدر المستخدم (1) يضيف ناقل أو وجهة جديدة بدون مغادرة الصفحة، و(2) يختار لكل فاتورة جاهزة للرفع ناقلًا ووجهةً تلقائيًا من بيانات العميل الموجودة في إدارة العملاء، ويحفظها لتظهر في الترحيلات والمعاينة.

## ما الذي سيتغيّر فعليًا

```text
DispatchPage  (صفحة /dispatch)
├── [جديد] شريط علوي: "الناقلون"  +  "الوجهات"
│      └── زر + Dialog → إضافة سريعة (الاسم، الهاتف/الوصف) → حفظ
├── ReadyToShipPanel
│      └── [جديد] لكل صف فاتورة:
│            • قائمة الناقلين (مفلتَرة بناقلين العميل + الافتراضي مُختار)
│            • قائمة الوجهات (مفلتَرة بوجهات العميل + المعلَّمة is_default مُختارة)
│            • زر "تثبيت الترحيل" → INSERT في invoice_transports
└── DispatchPrintPreview  (بدون تغيير وظيفي)
```

## التفاصيل

### 1) شريط الإدارة في أعلى الصفحة
- بطاقتان مدمجتان جنبًا إلى جنب: «الناقلون» و«الوجهات».
- كل بطاقة تعرض عدد السجلات + زر «+ إضافة».
- الإضافة عبر Dialog بسيط (RTL، Cairo، tokens فقط):
  - الناقل: `name` (مطلوب)، `phone`، `vehicle_type`، `vehicle_number`، `notes`.
  - الوجهة: `name` (مطلوب)، `description`.
- بعد الحفظ: toast "تمت الإضافة" + إبطال الكاش (`useTransporters` / `useDestinations`) فتظهر فورًا في قوائم الفواتير أدناه.
- لا حذف من هنا (الحذف يبقى في صفحاته الحالية).

### 2) ربط الفاتورة بناقل ووجهة من بيانات العميل
لكل صف فاتورة في `ReadyToShipPanel` أضيف عمودين جديدين على اليمين بعد عمود العميل:

- **عمود الناقل**: قائمة منسدلة مفلتَرة:
  - أولًا: ناقلو العميل من `customer_transporters`.
  - ثم: ناقلو منطقته من `locality_transporters` (نفس منطق `TransportDialog`).
  - الافتراضي: `customer_preferred_transporter` لو موجود، وإلا أول عنصر.
  - لو ما عند العميل ربط: تعرض كل الناقلين.

- **عمود الوجهة**: قائمة منسدلة مفلتَرة:
  - أولًا: وجهات العميل من `customer_destinations`.
  - الافتراضي: السجل المعلَّم `is_default = true`.
  - لو ما عند العميل ربط: تعرض كل الوجهات.

- **زر «تثبيت الترحيل»**: يُدرج صفًا في `invoice_transports` (الفاتورة + الناقل + الوجهة + تاريخ اليوم). هذا الإدراج يُشغّل التشغيل التلقائي (trigger `auto_workflow_on_transport`) فتنتقل الفاتورة تلقائيًا إلى «في الطريق للترحيلات» — لا UPDATE مباشر.

- مؤشّر بصري بسيط: إذا الفاتورة بها صف ترحيل بالفعل، يظهر بادج «مُرحَّلة» بدل الزر.

### 3) معاينة الطباعة
لا تغيير منطقي — `DispatchPrintPreview` يقرأ من `invoice_transports` فيظهر الناقل/الوجهة الجديدين تلقائيًا في الكشف.

## تفاصيل تقنية (للمراجعة)

- **لا migrations**: الجداول `transporters` و`destinations` و`customer_destinations` و`customer_transporters` و`locality_transporters` و`customer_preferred_transporter` و`invoice_transports` كلها موجودة.
- ملفات جديدة:
  - `src/components/dispatch/DispatchEntitiesBar.tsx` — البطاقتان + Dialogs الإضافة.
  - `src/components/dispatch/QuickAddTransporterDialog.tsx`
  - `src/components/dispatch/QuickAddDestinationDialog.tsx`
- ملفات معدَّلة:
  - `src/pages/DispatchPage.tsx` — تركيب `DispatchEntitiesBar` فوق الـ grid.
  - `src/components/dispatch/ReadyToShipPanel.tsx` — أعمدة الناقل/الوجهة + زر التثبيت + جلب قوائم العميل (يُعاد استخدام نفس استعلامات `TransportDialog`).
- Hooks مستخدمة من `useData.ts`: `useTransporters`, `useDestinations`, `useCustomerTransporters`, `useCustomerDestinations`, `useCustomerPreferredTransporter` — كلها موجودة.
- الحفظ يستخدم `useInvoiceTransports().insert` (موجود) أو `supabase.from("invoice_transports").insert(...)` ثم `qc.invalidateQueries`.
- التزامًا بسكِل **albatool-workflow-automation**: لا UPDATE مباشر لـ `workflow_status` — الترقية تحصل عبر trigger الإدراج في `invoice_transports`.
- RTL + Cairo + design tokens فقط. كل النصوص عربية.

## QA قبل الإغلاق
- [ ] إضافة ناقل من الصفحة تظهر فورًا في قائمة كل صف.
- [ ] فاتورة لزبون له ناقل افتراضي تبدأ بقيمة مُختارة مسبقًا.
- [ ] فاتورة لزبون له وجهة `is_default` تبدأ بها مُختارة.
- [ ] التثبيت يحوّل الحالة تلقائيًا إلى «في الطريق للترحيلات» (عبر trigger).
- [ ] لا أي `bg-white` / hex مباشر / `.includes()` في الكود الجديد.
- [ ] الموبايل ≤640px: الحقول لا تتلاصق، حد لمس ≥40px.
