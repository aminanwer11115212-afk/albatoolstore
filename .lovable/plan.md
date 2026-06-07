# خطة فحص نظام الأوتوميشن وإصلاح الفجوات

سأقوم بمراجعة جميع سلاسل الأتمتة الموجودة في النظام، التحقّق من سلامتها، وإغلاق الفجوات. لن أُعيد كتابة المنطق السليم — فقط أُكمل الناقص وأُوحّد التطبيق.

---

## 1) سلاسل الأتمتة الحالية (موجودة وتعمل)

| السلسلة | الملف | الحالة |
|---|---|---|
| خصم المخزون عند إنشاء/تحويل فاتورة | `stockDeduction.ts` + `InvoiceCreatePage` / `InvoiceViewPage` / `InvoicesPage` | يعمل، محمي بـ `stock_deduction_id` (idempotent) |
| إضافة المخزون عند استلام أمر شراء | `stockReceive.ts` + `PurchasePage` / `PurchaseCreatePage` | يعمل، محمي بالحالة `received` |
| فرق المخزون عند تعديل فاتورة/شراء | `applyStockDeltaForLines` / `applyStockDeltaForPurchaseLines` | يعمل |
| إرجاع المخزون عند حذف فاتورة | `deleteInvoice.ts` | يعمل |
| تقسيم الدفعة الزائدة → سلفة عميل | `overpayment.ts` + `InvoiceViewPage` (transactions: `customer_credit`) | يعمل |
| حساب حالة الفاتورة بعد الدفع | `invoiceStatus.ts` (`paid/partial/pending`) | يعمل |
| تحويل عرض سعر → فاتورة | `quoteToInvoice.ts` | يعمل |
| مزامنة أعمدة `exchange_rates` (legacy/new) | DB trigger `sync_exchange_rate_columns` | يعمل |
| سجلّ المراجعات (Invoice revisions) | `invoiceRevisions.ts` | يعمل |
| Activity log | `activity_log` | يعمل |
| بث `products:changed` لإبطال الكاش | `ProductsCacheSync` | يعمل |

## 2) الفجوات المكتشفة (تحتاج إصلاح)

### أ) رصيد العميل `customers.balance` لا يُحدَّث تلقائياً
- عند إنشاء/تعديل/حذف فاتورة لا يتغيّر `customers.balance` ولا `credit_balance`.
- `CustomerDebtReport` يُظهر فعلياً عدم تطابق بين `balance` و `computed_due`.
- **الحل:** إنشاء **DB trigger** يعيد حساب `balance = SUM(due_amount)` و `credit_balance = SUM(customer_credit transactions)` تلقائياً بعد أي `INSERT/UPDATE/DELETE` على `invoices` أو `transactions`. هذا يُلغي الاعتماد على التحديث اليدوي ويحلّ مشكلة عدم التطابق نهائياً.

### ب) حالة الفاتورة `overdue` لا تُحسب تلقائياً
- `overdue` حالياً تُضبط يدوياً فقط (انظر تعليق `invoiceStatus.ts`).
- **الحل:** trigger خفيف يضع `status='overdue'` للفواتير التي `due_date < now()` وما زالت `pending/partial`، أو دالة دورية بسيطة عند فتح صفحة الفواتير.

### ج) `paid_amount` للمشتريات لا يُربط بدفعات حقيقية
- `purchase_orders.paid_amount` و `due_amount` موجودان لكن لا يوجد منطق دفع مرتبط بـ `transactions` (مدفوعات الموردين).
- **الحل:** نفس آلية الفواتير: تسجيل `supplier_payment` في `transactions` + إعادة حساب `paid_amount`/`due_amount` تلقائياً.

### د) عدم تحديث رصيد المورد `suppliers.balance` تلقائياً
- نفس مشكلة العميل بالضبط.
- **الحل:** trigger مماثل من `purchase_orders` + `transactions`.

### هـ) `quote.workflow_status='converted'` بعد التحويل
- التحويل يُسجّل `converted_to_invoice_id` لكن لا يُغيّر `workflow_status` بشكل موحّد.
- **الحل:** تحديث الحالة ضمن نفس عملية التحويل.

### و) خصم المخزون عند **التحويل المباشر** من عرض سعر إلى فاتورة
- `quoteToInvoice.ts` ينشئ الفاتورة لكن لا يستدعي `deductStockForInvoiceOnce` دائماً (يعتمد على فتح صفحة الفاتورة).
- **الحل:** استدعاء الخصم داخل التحويل فوراً.

### ز) `stock_returns` — التحقق من عدم الخصم المزدوج
- مراجعة سريعة للتأكد أن إرجاع البضاعة لا يُضاعف الإضافة عند تعديل مرتجع موجود.

## 3) خطوات التنفيذ (بالترتيب، على دفعات)

**الدفعة 1 — أرصدة الأطراف (الأعلى أولوية):**
1. Migration: trigger لإعادة حساب `customers.balance` و `credit_balance` من `invoices` + `transactions`.
2. Migration: trigger مماثل لـ `suppliers.balance` من `purchase_orders` + `transactions`.
3. Backfill: تشغيل مرّة واحدة لتصحيح القيم الحالية.

**الدفعة 2 — حالات الفواتير والمشتريات:**
4. Trigger/دالة لتحديث `overdue` تلقائياً.
5. توحيد منطق دفع المورد (تسجيل `supplier_payment` + تحديث `paid_amount/due_amount` للمشتريات).

**الدفعة 3 — تحويل العروض:**
6. ضمان خصم المخزون داخل `quoteToInvoice` مباشرة (مع حماية idempotent).
7. ضبط `quotes.workflow_status='converted'` و `converted_at` و `converted_to_invoice_id` ضمن transaction واحدة.

**الدفعة 4 — تحقق نهائي:**
8. تشغيل `data-anomaly-scanner` بعد التعديلات للتأكد من عدم وجود تباينات.
9. تشغيل اختبارات `stockDeductionWorkflow` و `stockDeductionIdempotency` الموجودة.

## التفاصيل التقنية

- جميع التريغرات: `SECURITY DEFINER`, `SET search_path = public`.
- إعادة حساب الأرصدة تتم بـ `SUM(due_amount) WHERE customer_id = NEW.customer_id` فقط (مستهدف، ليس جدولاً كاملاً).
- لا تعديل على `auth/storage/supabase_functions`.
- لا تغيير على واجهات المستخدم — فقط طبقة البيانات والمنطق.
- اختبار كل دفعة عبر `supabase--read_query` قبل المتابعة للدفعة التالية.

بعد موافقتك سأبدأ بالدفعة 1.
