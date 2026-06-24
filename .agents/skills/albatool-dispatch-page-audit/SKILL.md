---
name: albatool-dispatch-page-audit
description: Audit checklist for the Albatool dispatch management page (إدارة الترحيلات) — verifies filtering by transporter and by customer, checkbox selection, invoice rows showing invoice numbers (not customer name), Quick-Add flows, and overall behavior on desktop and mobile.
---

# Albatool — فحص صفحة إدارة الترحيلات (Dispatch)

تُستعمل هذه المهارة عندما يطلب المستخدم التأكد من أن صفحة إدارة الترحيلات «تعمل بشكل صحيح»، أو بعد أي تغيير على ملفات `DispatchPage` / `ReadyToShipPanel` / `DispatchPrintPreview` / `QuickAdd*Dialog`.

## الملفات الأساسية

- `src/pages/DispatchPage.tsx` — الـ orchestrator (grid + Sheet للموبايل + overlay للمعاينة).
- `src/components/dispatch/ReadyToShipPanel.tsx` — اللوحة اليمنى (التابات + الجدول + RPC الترحيل).
- `src/components/dispatch/DispatchPrintPreview.tsx` — لوحة المعاينة اليسرى / Sheet الموبايل.
- `src/components/dispatch/QuickAddTransporterDialog.tsx` + `QuickAddDestinationDialog.tsx`.
- `src/utils/dispatchReportPrint.ts` — توليد HTML الطباعة + الـ liveOverlay.

## قائمة الفحص الموحّدة

نفّذها بهذا الترتيب وأبلِغ المستخدم بأي مخالفة مع `file:line` و fix-hint.

### 1) التابات والفلاتر الأعلى

- [ ] التابات الثلاث ظاهرة وعاملة: **الكل / حسب الترحيلات (transporter) / حسب الزبون (customer)**.
- [ ] حقل البحث/الفلتر فوق الجدول موجود في كلا تابي «حسب الترحيلات» و«حسب الزبون»، ويفلتر فوراً (بدون زر).
- [ ] الفلتر يبحث بـ:
  - تاب الترحيلات: اسم الناقل أو رقم هاتفه.
  - تاب الزبون: اسم الزبون أو رقم هاتفه.
- [ ] الفلتر يحترم RTL ولا يتلاحم مع التابات على الموبايل.

### 2) سلوك التابات

- [ ] **تاب «حسب الترحيلات»**: اختيار ناقل من القائمة الفوقية يعرض الفواتير الجاهزة المرتبطة بهذا الناقل فقط (سواء كناقل افتراضي للزبون أو مُختار يدوياً للصف).
- [ ] **تاب «حسب الزبون»**: اختيار زبون يعرض فواتيره الجاهزة فقط — تُعرض في الجدول **بأرقام الفواتير** وليس باسم الزبون (لأن الاسم معروف من الفلتر العلوي).
- [ ] في كل تاب، الصفوف تحمل checkbox مستقل + عمود تسلسل # + ناقل + وجهة + زر تثبيت/معتاد.
- [ ] الـ checkbox في رأس الجدول يحدّد/يلغي تحديد كل الصفوف الظاهرة (بعد الفلترة).

### 3) إخفاء/إظهار «اختر زبون أولاً»

- [ ] لا يوجد نص ثقيل «يرجى اختيار زبون…» يأخذ نصف الشاشة — يجب أن يكون شريطاً صغيراً أو رسالة inline أعلى الجدول.

### 4) Quick-Add (ناقل / وجهة)

- [ ] زر «+ ناقل» و«+ وجهة» موجودان كزرين صغيرين في **أسفل** الصفحة أو ضمن toolbar الجدول — وليس بلوكاً كبيراً فوق.
- [ ] الضغط يفتح Dialog صغيراً يحفظ بنقرة، ثم يُغلق ويُحدّث القوائم فوراً (Toast نجاح + ظهور العنصر الجديد دون refresh يدوي).
- [ ] مفاتيح React Query المستخدمة للـ invalidate هي:
  - الناقلون: `["transporters"]`
  - الوجهات: `["destinations"]`
  - تفضيلات الزبون: `["customer_transporters"]` / `["customer_destinations"]` / `["customer_preferred_transporter"]`
- [ ] لا توجد مفاتيح `["table", "..."]` (مفاتيح خاطئة لا تطابق `useTable`).

### 5) اختيار الناقل/الوجهة داخل الصف

- [ ] كل صف يحوي خليتين قابلتين للفتح (combobox مع بحث) لاختيار ناقل/وجهة.
- [ ] الاختيار محفوظ في `rowChoice` (state في `DispatchPage`)، ويظهر فوراً في معاينة الطباعة اليسرى مع وسم «معاينة — لم يُثبَّت بعد».
- [ ] زر «تثبيت» يحفظ الاختيار كافتراضي للزبون (RPC أو insert إلى `customer_preferred_transporter` / `customer_destinations`)، ويُحدّث قائمة الزبائن.
- [ ] أيقونة 📌 صغيرة بجانب «تثبيت» تشير إلى الحالة المعتادة الحالية للزبون.

### 6) الطباعة + الترحيل (Print & Dispatch)

- [ ] زر «طباعة وتحويل إلى ترحيلات» يفتح `AlertDialog` للتأكيد قبل أي إجراء.
- [ ] عند التأكيد:
  1. تُفتح نافذة الطباعة بكشف الترحيلات بكل الفواتير المحددة.
  2. تُستدعى `supabase.rpc("advance_invoice_workflow", { _target: "in_transit", _reason: "ترحيل الفواتير الجاهزة من شاشة الترحيلات" })` لكل فاتورة.
  3. تختفي الفواتير المحوّلة من الجدول فوراً (لأن الاستعلام مفلتر بـ `ready_to_ship`).
  4. يُبث `window.dispatchEvent(new Event("invoices:changed"))`.
  5. تُستدعى `invalidateWorkflowAutoCache(id)` لكل فاتورة.
  6. يظهر toast: «تم تحويل N فاتورة إلى في الطريق للترحيلات».

### 7) معاينة الطباعة (يمين الشاشة + Sheet الموبايل)

- [ ] لوحة المعاينة sticky على الديسكتوب (≥860px) وتعرض المختار فعلياً.
- [ ] على الموبايل: زر عائم سفلي يفتح Sheet بمعاينة كاملة (95vw) مع نفس `liveOverlay`.
- [ ] الناقل/الوجهة المختاران في الصف يظهران في المعاينة قبل التثبيت (overlay).

### 8) الموبايل (≤640px)

- [ ] لا overflow أفقي على عرض 375px.
- [ ] الـ comboboxes داخل الخلية تُفتح كـ Sheet أو dropdown كامل العرض — لا تتقصّ.
- [ ] حجم خط الـ inputs ≥16px (تجنّب iOS zoom).
- [ ] أزرار التابات / Quick-Add / تثبيت ≥40px ارتفاعاً.
- [ ] جدول Excel-like يحافظ على الحدود وعمود # بدون كسر.

### 9) Realtime + التحديث

- [ ] الاشتراكات في `transporters` / `destinations` / `invoices` تُحدّث الكاش بمفاتيح `useTable` الصحيحة.
- [ ] بعد إضافة/تثبيت/ترحيل، لا يحتاج المستخدم لـ refresh يدوي إطلاقاً.

### 10) RTL + التوكنز

- [ ] الصفحة `dir="rtl"` على الجذر، خط Cairo bold.
- [ ] لا hardcoded colors (`text-white`, `bg-[#...]`) في JSX — فقط tokens من `index.css`.

## بروتوكول الإخراج

أعد للمستخدم تقريراً عربياً مختصراً:

```
✅ ما يعمل: ...
⚠️ مخالفات: <severity> — <file:line> — <ما المشكلة> — <اقتراح إصلاح>
🧪 يحتاج فحص فعلي في الـ preview: ...
```

لا تعدّل ملفات من تلقاء نفسك بعد الفحص؛ اعرض الجدول واسأل المستخدم أي البنود يريد إصلاحها.

## القواعد المرتبطة

- تكامل مع `albatool-workflow-automation` (نفس قواعد RPC).
- مفاتيح UI customization تتبع `albatool-user-prefs` (`lov:u:{uid}:ff:{mobile|desktop}:dispatch:*`).
- لا تذكر "Supabase" للمستخدم — استخدم «Lovable Cloud».
