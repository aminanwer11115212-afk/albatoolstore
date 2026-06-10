## الوضع الحالي
الكود في `InvoiceAttachmentsDialog.tsx` ينادي بالفعل RPC `advance_invoice_workflow(target='done', reason='رفع إيصال الدفع')` بعد رفع ملف في تبويب **"صور الإيصال"**. لكن:

1. **`InvoiceCreatePage`** لا تمرّر `onWorkflowAdvanced`، فلا تتحدّث الشارة في الصفحة بعد الرفع.
2. لا يوجد `window.dispatchEvent("invoices:changed")` ولا إبطال لـ workflow cache، فالقوائم الأخرى (قائمة الفواتير / الترحيلات) لا ترى التغيير فوراً.
3. شرط الـ RPC `done` يتطلب أن تحتوي الفاتورة على بنود و `total > 0` — إن لم يتحقق سيتم تجاهل الترقية بصمت.

## الخطة

1. في `src/components/invoice/InvoiceAttachmentsDialog.tsx` بعد نجاح RPC للإيصال:
   - استيراد `invalidateWorkflowAutoCache` من `WorkflowStatusBadge` واستدعاؤها.
   - `window.dispatchEvent(new Event("invoices:changed"))`.
   - عرض toast "تم تحديث حالة الفاتورة إلى: تم" عند نجاح الترقية فقط، وtoast تحذيري لطيف إذا لم تتحقق (لا بنود/المبلغ صفر).
   - لتأكيد الترقية فعلاً، قراءة `workflow_status` بعد الـ RPC والمقارنة.

2. في `src/pages/InvoiceCreatePage.tsx`: تمرير `onWorkflowAdvanced={() => { /* reload invoice header */ }}` كما هو مفعّل في `InvoiceViewPage`.

3. لا تغييرات على قاعدة البيانات — الـ RPC والمنطق صحيحان حسب skill workflow-automation.

النتيجة: عند رفع صورة الإيصال، تنتقل الحالة فوراً إلى **"تم"** وتنعكس في كل الشاشات (إنشاء/عرض/قائمة/ترحيلات) دون الحاجة لإعادة تحميل.
