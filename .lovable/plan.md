## الوضع الحالي (ما اكتشفته في الكود)

نظام الأتمتة موجود جزئياً وفيه **خلل جوهري**:

- ملف الـ DB: `supabase/migrations/20260507213710_*.sql` فيه الدالة المركزية `public.advance_invoice_workflow(invoice_id, target, reason)` ودالة الترتيب `workflow_rank(status)` و4 triggers.
- **العطل الأهم**: `workflow_rank` يعرف 4 حالات فقط (`new=0, preparing=1, in_transit=2, done=3`) ولا يعرف `ready_to_ship` إطلاقاً. لذلك كل استدعاء بهدف `ready_to_ship` لا يفعل شيئاً (rank=0 لا يتقدّم عن preparing).
- زر حالة التجهيز في `InvoiceCreatePage` يستخدم `WORKFLOW_STATUS_OPTIONS` من `StatusButton.tsx` وفيه **4 حالات فقط** بدون "جاهز للرفع" والاسم "جديد" بدلاً من "مقبول".
- شارة `WorkflowStatusBadge` تعرض الـ 5 حالات الصحيحة بالأسماء المطلوبة. (مصدران منفصلان للحقيقة → نوحّدهما.)
- `quoteToInvoice.ts` ينشئ الفاتورة المحوّلة بحالة `new` بدل ما طلبت (`preparing`/"قيد التجهيز").
- الأتمتات الموجودة وتعمل: `markQuoteAsSent` عند الواتساب/الطباعة لعرض السعر؛ إدراج بند → `preparing`؛ إدراج ترحيل → `in_transit`؛ سداد كامل → `done`؛ رفع إيصال (تبويب receipt) → `done`؛ طباعة كشف ترحيلات الجاهز للرفع → `in_transit`.
- **مفقود من الأتمتة**: طباعة الفاتورة → `ready_to_ship`، طباعة كشف الجرد → `preparing` (مؤكَّد)، حفظ تغليف → `ready_to_ship` (مكتوب لكن لا يعمل بسبب عطل rank).

## الحالات الموحّدة (5 حالات نهائية)


| القيمة          | التسمية             | اللون   |
| --------------- | ------------------- | ------- |
| `new`           | مقبول               | رمادي   |
| `preparing`     | قيد التجهيز         | أصفر    |
| `ready_to_ship` | جاهزة للرفع         | برتقالي |
| `in_transit`    | في الطريق للترحيلات | بنفسجي  |
| `done`          | تم                  | أخضر    |


هذا يطابق `WorkflowStatusBadge.WORKFLOW_STATUSES` (المرجع الوحيد بعد التوحيد).

## خريطة الأتمتة الكاملة (بعد التنفيذ)

```text
حدث المستخدم                          →  الحالة الجديدة         الجهة المسؤولة
────────────────────────────────────────────────────────────────────────────
فتح فاتورة جديدة                       →  new (مقبول)            افتراضي
تحويل عرض سعر إلى فاتورة               →  preparing              quoteToInvoice
طباعة كشف الجرد (stocktake)            →  preparing              handlePrint           handlePrint
إضافة/حفظ تغليف                        →  ready_to_ship          PackagingDialog + trigger
فتح حوار "إضافة ترحيل" وطباعة من داخله →  in_transit             TransportDialog (طباعة)
إدراج صف في invoice_transports         →  in_transit             trigger
طباعة كشف الترحيلات في صفحة الترحيلات   →  in_transit (للكل)     ShippingDispatchDialog ✓
رفع مستند في تبويب "إيصال"             →  done                   InvoiceAttachmentsDialog ✓
سداد كامل (paid_amount >= total)        →  done                   trigger
إرسال عرض سعر واتساب/طباعته             →  quote.status='sent'    markQuoteAsSent ✓
```

ملاحظة على زر "إضافة ترحيل" داخل الفاتورة: التعليق هو أن الحوار يعرض الفاتورة الحالية فقط مع ترحيلاتها ووجهتها (إن وُجدت من بيانات العميل في `customer_destinations`/`customer_preferred_transporter`)، وفيه زر "طباعة هذا الكشف" يطبع الفاتورة الواحدة، والطباعة هي الحدث الذي ينقل الحالة إلى `in_transit` (وليس مجرد الفتح).

## خطة التنفيذ — على 4 دفعات

### الدفعة 1 — إصلاح الأساس (DB + توحيد الحالات في الواجهة)

1. Migration واحدة:
  - تحديث `workflow_rank` ليصبح: `new=0, preparing=1, ready_to_ship=2, in_transit=3, done=4`.
  - تعديل شرط "لا تتجاوز preparing على فاتورة فارغة" ليشمل `ready_to_ship` أيضاً.
2. توحيد المصدر: حذف `WORKFLOW_STATUS_OPTIONS` من `StatusButton.tsx` واستيراد قائمة موحّدة مشتقّة من `WORKFLOW_STATUSES` (5 حالات) في `InvoiceCreatePage` و`InvoiceViewPage`.
3. تغيير `quoteToInvoice.ts` ليفتح الفاتورة المحوّلة بـ `workflow_status: "preparing"` بدل `new`.

تحقق الدفعة 1: زر الحالة في إضافة/تعديل فاتورة يعرض 5 حالات بالأسماء الصحيحة؛ فاتورة محوّلة من عرض سعر تظهر "قيد التجهيز".

### الدفعة 2 — أتمتة الطباعة

4. `InvoiceCreatePage.handlePrint`: بعد فتح صفحة المعاينة، استدعاء `advance_invoice_workflow`:
  - `variant === "stocktake"` → `preparing` (سبب: "طباعة كشف جرد").
  - أي variant آخر (`full|no-account|account-only|no-details`) → `ready_to_ship` (سبب: "طباعة فاتورة").
5. `InvoiceViewPage.handlePrint` نفس المنطق (السطر 230 الحالي يستدعي بالفعل `advance_invoice_workflow` — نراجعه ونضبط الهدف حسب الـ variant).
6. `TransportDialog`: عند زر "طباعة" داخل الحوار للفاتورة الواحدة، استدعاء `advance_invoice_workflow(_, "in_transit", "طباعة كشف ترحيل من الفاتورة")` قبل/بعد الطباعة.

تحقق الدفعة 2: طباعة فاتورة محفوظة في حالة preparing تنقلها إلى ready_to_ship؛ طباعة كشف جرد لفاتورة جديدة تنقلها إلى preparing؛ طباعة من حوار الترحيل تنقلها إلى in_transit.

### الدفعة 3 — Skill مرجعية ثابتة

7. إنشاء skill في `.agents/skills/albatool-workflow-automation/` يحوي:
  - `SKILL.md`: متى يُستخدم (أي طلب يخص حالات الفاتورة، أتمتة، نقل حالة، أحداث طباعة/تحويل/سداد)، القائمة النهائية للحالات الـ5، خريطة الأحداث أعلاه، والقواعد الذهبية (لا تنزّل الحالة تلقائياً، لا تتجاوز preparing لفاتورة فارغة، كل تنقّل أوتوماتيكي يجب أن يسجّل في `invoice_revisions` بـ `action='auto_workflow'`، استخدم RPC `advance_invoice_workflow` لا تحدّث `workflow_status` مباشرة من التطبيق، احترم `workflow_automation_enabled` في `company_settings`).
  - `references/add-automation-step.md`: وصفة لإضافة قاعدة أتمتة جديدة (3 خطوات: حدّد الحدث → اختر الـ target → استدعِ `advance_invoice_workflow` من نقطة الحدث في الكود أو عبر DB trigger).
  - `references/db-pattern.sql`: قالب trigger يستدعي `advance_invoice_workflow`.
  - `references/checklist.md`: ما يجب التحقق منه قبل اعتبار قاعدة الأتمتة جاهزة.
  - تطبيق الـ skill عبر `skills--apply_draft`.

### الدفعة 4 — اختبارات يدوية + تحقق ذاتي

8. تشغيل سيناريو كامل في الـ preview بدون تدخّل المستخدم:
  - إنشاء عرض سعر → إرسال واتساب → التحقق من حالة `sent`.
  - تحويله لفاتورة → التحقق من `preparing`.
  - طباعة كشف الجرد → preparing (يبقى)؛ طباعة الفاتورة → `ready_to_ship`.
  - فتح حوار إضافة ترحيل وطباعته → `in_transit`.
  - رفع إيصال → `done`.
  - عرض سجل `invoice_revisions` للتأكد من تسجيل كل خطوة بـ `action=auto_workflow`.
9. لقطة كونسول/شبكة عند أي خلل + إصلاح فوري.

## تفاصيل تقنية موجزة

- جميع تنقلات الحالة تمر عبر RPC `public.advance_invoice_workflow` (لا `update` مباشر من الواجهة) لضمان: عدم النزول، التسجيل في `invoice_revisions`، احترام مفتاح `workflow_automation_enabled`، ومنع تجاوز preparing على فاتورة فارغة.
- `invalidateWorkflowAutoCache(invoiceId)` (موجود في `WorkflowStatusBadge.tsx`) يُستدعى بعد كل أتمتة لكسر الكاش وتظهر أيقونة ⚡ مع tooltip السبب.
- لا تغييرات على Stock deduction (مرتبط بمغادرة الحالة `new` وهو منطق مستقل وآمن).
- لا حذف ولا تغيير لأي حالة من الـ 5، فقط إضافة `ready_to_ship` للترتيب وللزر.

## ما لن أفعله (إلا إذا طلبت)

- لن أغيّر منطق Stock Deduction.
- لن أمسّ الحالة المالية للفاتورة (`status`: paid/partial/…)، فهي مستقلة عن `workflow_status`.
- لن أضيف triggers جديدة على الطباعة (الطباعة لا تكتب في DB لذا الـ trigger غير ممكن — الأنسب استدعاء RPC من نقطة الطباعة في الكود، وهذا ما سنفعل).
- لن أكتب أي skill قبل اعتماد هذه الخطة.

&nbsp;

&nbsp;

الفي طباعة الفاتورة ان تحول الفاتورة ل جاهزة للرفع بل بعد اضافة تغليف لها