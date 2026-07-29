
# خطة: توحيد ونشر تعديل الدفعات وشحن الرصيد

## الوضع الحالي
- `RevisePaymentDialog` (statement) موجود ويعمل مع تبويبَي: تعديل / استرجاع إلى الرصيد الدائن — يُستدعى فقط من صفحة كشف حساب العميل.
- `CustomerChargeHistory` يوفّر «إلغاء الشحنة» فقط — لا يوجد تعديل حقيقي (مبلغ/طريقة/حساب/تاريخ/رقم عملية/ملاحظة).
- لا توجد أزرار تعديل في: `InvoicePaymentHistory`، صفحة الفاتورة، شاشة الفواتير، سجل حركات العميل داخل الفاتورة، بروفايل العميل، تقارير المعاملات، صفحة شحن الرصيد داخل بطاقة العميل.

## الهدف
واجهة موحّدة `EditFinancialEntryDialog` تُستدعى من أي مكان يعرض دفعة فاتورة أو شحنة رصيد، مع صلاحيات وتحقّق تناسق موحّد.

## المكوّنات الجديدة
1. `src/components/finance/EditPaymentDialog.tsx` — يحلّ محلّ `RevisePaymentDialog` القديم ويوسّعه:
   - تبويبات: **تعديل** · **استرجاع للرصيد الدائن** · **إلغاء كامل**.
   - حقول قابلة للتعديل: المبلغ، طريقة الدفع، الحساب المستلم، التاريخ، رقم العملية، ملاحظة.
   - يعرض قبل/بعد على الفاتورة + على رصيد العميل.
2. `src/components/finance/EditChargeDialog.tsx` — لتعديل شحن رصيد العميل:
   - تبويبات: **تعديل** · **إلغاء الشحنة**.
   - نفس الحقول أعلاه + سبب التعديل.
   - يعرض تأثير التعديل على الرصيد الدائن ومصير أي فواتير استُهلك عليها الرصيد (يمنع التعديل إن كان الرصيد قد اُستُهلك ويطلب إلغاء الاستهلاك أولاً).
3. Wrapper مشترك `FinancialEntryActionsMenu` (زر ⋯) لعرضه بجانب أي صف دفعة/شحنة في القوائم.

## RPCs الخلفية
- `revise_invoice_payment` موجود → توسيعه ليقبل: `_method`, `_account_id`, `_date`, `_reference_no`, `_note` (كلها اختيارية؛ يحدّث المعاملة والفاتورة ذرّيًا).
- `refund_payment_to_customer_credit` موجود — يبقى كما هو.
- جديد: `cancel_invoice_payment(_tx_id, _reason)` — يعكس الدفعة كلياً ويعيد المبلغ للرصيد الدائن أو يحذف السجل حسب الخيار.
- جديد: `revise_customer_charge(_charge_group, _new_amount, _method, _account_id, _date, _reference_no, _note, _reason)` — يحدّث كل معاملات نفس مجموعة الشحن ذرّيًا مع فحص عدم استهلاك الرصيد.
- كلها تسجّل في `invoice_revisions` أو `activity_log` + تستدعي `assert_invoice_payment_consistency` بعد التنفيذ.

## نقاط الاستدعاء (Wiring)
- `CustomerStatementPage` — استبدال الاستدعاء القديم بالحوار الموحّد.
- `InvoicePaymentHistory` (داخل الفاتورة) — إضافة زر تعديل/إلغاء لكل دفعة.
- `CustomerChargeHistory` — استبدال زر «إلغاء الشحنة» بقائمة (تعديل/إلغاء).
- `InvoiceViewPage` و `InvoiceEditPage` — قائمة الإجراءات في جدول الدفعات.
- `FilteredTransactionsPage` و `/reports/account-statement` — زر تعديل عند تحديد صف من نوع payment/charge (للـ admin فقط).
- `CustomerProfile` (إن وُجد سجل حركات) — نفس الأزرار.

## الصلاحيات والحماية
- التعديل والإلغاء: `has_role(auth.uid(),'admin')` فقط في RPC.
- Guard في الواجهة يخفي الأزرار لغير الأدمن.
- كل RPC ملفوف بـ `savingRef` + `disabled` + `invalidateQueries(['transactions','accounts','customers','invoices','activity-log'])`.
- بعد كل تنفيذ: تشغيل `assert_invoice_payment_consistency` ضمنيًا؛ الفشل يُرجع الحوار للحالة السابقة.

## التوثيق والتدقيق
- كل تعديل/إلغاء يُسجَّل في `invoice_revisions` (إن كان مربوطًا بفاتورة) وفي `activity_log` بالسبب و snapshot قبل/بعد.
- ظهور «معدَّلة/ملغاة» كـ Badge بجانب الدفعة في الجداول.

## اختبارات Playwright
1. تعديل دفعة → التحقق أن رصيد العميل والفاتورة يتغيّران بنفس الفرق.
2. إلغاء شحنة رصيد غير مستهلكة → الرصيد الدائن يعود لصفر.
3. محاولة تعديل شحنة استُهلك جزء منها → رفض واضح مع الإرشاد.
4. غير الأدمن لا يرى أزرار التعديل.

## Rollout
- الدفعة 1: RPCs + الحوار الموحّد + استبدال `RevisePaymentDialog` القديم.
- الدفعة 2: نشر الأزرار في `InvoicePaymentHistory` و `CustomerChargeHistory`.
- الدفعة 3: نشر في صفحات الفاتورة والتقارير.
- الدفعة 4: اختبارات Playwright + تشغيل Safety Bot للتحقق.

هل أبدأ بالدفعة 1؟
