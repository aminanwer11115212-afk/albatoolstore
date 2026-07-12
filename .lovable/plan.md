## الهدف
توثيق كل عملية خصم وأثرها على رصيد العميل (له/عليه)، تأكيد بصري للمستخدم أن الأرقام تحدّثت، وتغطية اختبارية شاملة تمنع ظهور قيم سالبة أو حسابات خاطئة.

---

## 1) سجل تدقيق الخصومات (Discount Audit Log)

### قاعدة البيانات
- جدول جديد `public.discount_audit_log` عبر migration:
  - `id uuid pk`, `created_at timestamptz`
  - `entity_type text` ('invoice' | 'payment' | 'purchase_order')
  - `entity_id uuid`, `entity_number text`
  - `customer_id uuid null`, `supplier_id uuid null`
  - `discount_before numeric`, `discount_added numeric`, `discount_after numeric`
  - `total_before numeric`, `total_after numeric`
  - `balance_before numeric`, `balance_after numeric` (رصيد العميل/المورد الصافي وقت التسجيل)
  - `source text` ('customer_payment_dialog' | 'invoice_edit' | 'supplier_payment_dialog' | ...)
  - `note text`, `created_by uuid`
- GRANT للـ authenticated + service_role + RLS (authenticated select/insert).

### واجهة السجل
- صفحة جديدة `src/pages/DiscountAuditPage.tsx` على المسار `/reports/discount-audit`:
  - جدول RTL بأعمدة: التاريخ، النوع، الرقم، العميل/المورد، الخصم المضاف، الإجمالي قبل/بعد، الرصيد قبل/بعد، المصدر، رابط الفاتورة/الدفعة.
  - فلترة بالتاريخ + بحث بالعميل/الرقم عبر `startsWithMatch`.
  - كل صف يحتوي لينك يفتح `/invoices/:id` أو `/purchases/:id`.
- تبويب "سجل الخصومات" داخل `CustomerDetailView.tsx` و `SupplierDetailView.tsx` يعرض السجلات المرتبطة فقط.
- ربط من `InvoiceViewPage.tsx`: زر صغير "سجل الخصم" يفتح Sheet فيه سجلات هذه الفاتورة.

### كتابة السجل
- ملف helper `src/utils/discountAuditLogger.ts` بدالة `logDiscountEvent({...})` تُستدعى بعد كل تحديث خصم ناجح داخل:
  - `CustomerPaymentDialog.handleSave` (عند `disc > 0`)
  - `SupplierPaymentDialog.handleSave`
  - أي مكان يعدّل `invoices.discount` أو `purchase_orders.discount` (نتحقق من `InvoiceCreatePage`, `QuoteCreatePage`, `PurchaseCreatePage`).

---

## 2) توست تأكيد بعد إعادة الجلب

- توسيع `CustomerPaymentDialog` و `SupplierPaymentDialog` و `ChargeBalanceDialog`:
  - بعد `invalidateQueries`، انتظار `refetchQueries` للعميل/المورد المتأثر.
  - قراءة الرصيد الجديد وعرض `toast.success("تم تحديث رصيد العميل: ${label} ${amount}")` مع الفارق (قبل/بعد).
- helper مشترك `src/utils/balanceRefreshToast.ts` يُصدر التوست بنمط موحّد.
- يعتمد على `netBalanceOf` لضمان أن العرض مطابق لبقية الصفحات.

---

## 3) اختبارات وحدة/تكامل

- `src/test/discountBalanceRecompute.test.ts`:
  - محاكاة `recompute_customer_balance` عبر `GREATEST(total - paid, 0)` — تحقق من أن `balance >= 0` دائماً حتى مع خصم أكبر من المتبقي.
  - حالات: خصم جزئي، خصم يساوي المتبقي (balance→0)، خصم أكبر (لا سالب)، خصم مع فائض دفعة.
- `src/test/netBalanceOfDiscountCases.test.ts`:
  - إضافة سيناريوهات: بعد خصم كامل الدين → net=−credit، بعد خصم جزئي → net يقل بمقدار الخصم، لا سالب في balance وحده.
- `src/test/discountAuditLogger.test.ts`:
  - يتأكد أن الـ helper يبني payload صحيح ويستدعي supabase.insert بالحقول المتوقعة.

---

## 4) اختبار E2E

- `e2e/discount-updates-balance.e2e.py`:
  1. فتح فاتورة لعميل معلوم رصيده.
  2. فتح شاشة تسجيل دفعة، إدخال خصم إضافي دون مبلغ.
  3. الحفظ، انتظار التوست، التقاط screenshot.
  4. التحقق أن قيمة `عليه` في نفس الحوار (customer balance card) تنخفض بمقدار الخصم.
  5. فتح `/customers/:id` في تبويب ثانٍ والتأكد أن الرصيد الصافي محدّث دون F5.
  6. فتح `/reports/discount-audit` والتحقق من وجود سطر جديد بنفس القيم.

---

## تفاصيل تقنية

| ملف | تعديل |
|---|---|
| migration جديد | جدول `discount_audit_log` + RLS + GRANT |
| `src/utils/discountAuditLogger.ts` | جديد |
| `src/utils/balanceRefreshToast.ts` | جديد |
| `src/pages/DiscountAuditPage.tsx` | جديد + route في `App.tsx` |
| `src/components/invoice/CustomerPaymentDialog.tsx` | استدعاء logger + toast تأكيد |
| `src/components/purchase/SupplierPaymentDialog.tsx` | نفس الشيء |
| `src/components/dashboard/ChargeBalanceDialog.tsx` | toast تأكيد بعد refetch |
| `src/components/CustomerDetailView.tsx` | تبويب سجل الخصم |
| `src/components/SupplierDetailView.tsx` | تبويب سجل الخصم |
| `src/pages/InvoiceViewPage.tsx` | زر سجل الخصم |
| 3 اختبارات وحدة + 1 E2E | جديد |

## نقاط التحقق النهائية
- Build نظيف + `tsgo` بدون أخطاء.
- Migration ينفّذ بترتيب: CREATE → GRANT → ENABLE RLS → POLICY.
- لا تُكتب سجلات إذا `disc == 0`.
- كل التسميات عربية RTL، ألوان من design tokens فقط.
- لا رصيد سالب في أي مسار.
