# خطة تحسين نظام الرصيد الدائن (customer_credit)

هذه خطة لخمس ميزات مترابطة تلمس قاعدة البيانات، منطق الدفع، صفحات كشف الحساب، وواجهة الفواتير.

## 1) كشف الحساب: تجميع customer_credit حسب المصدر مع فلترة

**الهدف:** المستخدم يرى بوضوح لماذا وُلد كل قيد رصيد دائن (فائض فاتورة / تعديل دفع / شحن يدوي / مرتجع…) ويقدر يفلتر حسب السبب.

**التعديلات:**
- إضافة عمود منطقي `credit_source` مشتق في العرض فقط (بدون تعديل schema) من `transactions.allocation->>'kind'` + `description` + وجود `reference_id`:
  - `overpay_invoice` — فائض من فاتورة (description يحوي رقم فاتورة)
  - `manual_charge` — شحن يدوي (`allocation.kind='surplus'` من allocate_customer_charge)
  - `payment_adjust` — تعديل دفع لاحق
  - `return_credit` — من مرتجع
  - `unknown` — غير محدد
- في `CustomerStatementPage.tsx`:
  - تجميع قابل للطي (Accordion) لصفوف customer_credit حسب المصدر مع مجموع فرعي.
  - شريط فلترة: Checkboxes للمصادر + بحث نصي في الوصف.
  - عمود جديد "المصدر" ببادج ملوّن.
- helper مشترك `src/utils/creditSource.ts` يصنّف الحركة.

## 2) وضع "الكاش" لكشف الحساب

**الهدف:** المستخدم يرى فقط الحركات النقدية (customer_payment) مقابل customer_credit ويميز المرتبط بفاتورة من المستقل.

**التعديلات:**
- تبويب/زر جديد في `CustomerStatementPage` باسم "وضع الكاش":
  - يُخفي أعمدة الفاتورة (رقم/تاريخ/إجمالي).
  - يُبقي فقط: التاريخ، النوع (دفع/رصيد دائن)، المبلغ، الحساب، وبادج "مرتبط بفاتورة #123" أو "مستقل".
  - إجماليات في الأسفل: إجمالي المدفوع، إجمالي الفائض المستقل، إجمالي المستهلَك من الرصيد.
- المنطق نفسه المستخدم في `computeInvoicePaymentAdjustment` لضمان توحّد الأرقام.

## 3) أولوية استخدام الرصيد الدائن (FIFO / LIFO)

**الهدف:** إعداد على مستوى الشركة يحدد أي customer_credit يُستهلك أولاً عند فاتورة جديدة.

**التعديلات:**
- إضافة عمود في `company_settings`: `credit_consumption_order text default 'fifo'` (`fifo` أو `lifo`) — migration.
- في `CustomerPaymentDialog` عند حساب `creditUse`:
  - قراءة الإعداد.
  - جلب صفوف `customer_credit` مرتبة `date asc` (fifo) أو `date desc` (lifo).
  - استهلاك المبلغ عبر إدخال صفوف customer_credit سالبة مطابقة لكل قيد بترتيب الأولوية بدل قيد واحد مجمّع.
- إعداد UI في `/settings` (قسم المحاسبة): راديو FIFO/LIFO مع شرح.

## 4) سجل التدقيق (Audit Trail) للفواتير والدفع والرصيد

**الهدف:** لكل فاتورة تبويب "سجل التدقيق" يُظهر: القيود المستهلكة، الفائض المتولّد، الحذف، مع أرقام القيود.

**التعديلات:**
- استخدام جدول `invoice_revisions` الموجود + `discount_audit_log` + `transactions` (مفلترة بـ reference_id).
- مكوّن جديد `src/components/invoice/InvoiceAuditTab.tsx`:
  - جدول زمني موحّد: تاريخ | فعل | تفاصيل | مرجع القيد (transaction id مختصر) | المبلغ.
  - أفعال: إنشاء، دفع، توليد فائض، استهلاك رصيد دائن، تعديل خصم، حذف.
  - رابط لكل قيد يفتح Dialog بتفاصيل الـ allocation JSON.
- تبويب في `InvoiceViewPage.tsx` بجانب المعاينة/الطباعة.

## 5) تنبيه محاسبي في صفحة الفاتورة

**الهدف:** المستخدم لا يفوته أي فرق بين المدفوع والخصم، ولا أي customer_credit يخص العميل لم يُربَط بمرجع الفاتورة الحالية.

**التعديلات:**
- مكوّن جديد `InvoiceAccountingAlert.tsx` يُعرض داخل `InvoiceViewPage` عند تحقّق أي شرط:
  - `discount + paid != total` → "الخصم المسجل لا يوازي الفارق — راجع الدفعات".
  - وجود صفوف `customer_credit` للعميل بدون `reference_id` → "يوجد رصيد دائن للعميل غير مرتبط بأي فاتورة (X ج.س) — يُستهلك تلقائياً في فاتورة جديدة".
  - عرض جدول مصغّر بالقيود المعنية + رابط لسجل التدقيق (الميزة 4).
- نمط التنبيه: `border-amber-300 bg-amber-50` مع أيقونة، RTL.

## Technical Section

**Migrations:**
```
supabase/migrations/<ts>_credit_consumption_order.sql
  - ALTER TABLE company_settings ADD COLUMN credit_consumption_order text
      NOT NULL DEFAULT 'fifo'
      CHECK (credit_consumption_order IN ('fifo','lifo'));
```
لا نضيف أعمدة على transactions — التصنيف مشتق UI-side لتجنّب backfill معقّد.

**ملفات جديدة:**
- `src/utils/creditSource.ts` — classifier + labels عربية.
- `src/components/statement/CreditSourceFilterBar.tsx`
- `src/components/statement/CashModeToggle.tsx`
- `src/components/invoice/InvoiceAuditTab.tsx`
- `src/components/invoice/InvoiceAccountingAlert.tsx`
- `src/hooks/useCreditConsumptionOrder.ts`
- `src/test/creditSource.test.ts` + `src/test/creditConsumptionOrder.test.ts`
- `e2e/customer-statement-credit-grouping.spec.ts`
- `e2e/credit-consumption-fifo-lifo.spec.ts`

**ملفات معدّلة:**
- `src/pages/CustomerStatementPage.tsx` — تجميع/فلترة/وضع الكاش
- `src/components/invoice/CustomerPaymentDialog.tsx` — منطق FIFO/LIFO عند creditUse
- `src/pages/InvoiceViewPage.tsx` — تكامل التبويب + التنبيه
- `src/pages/SettingsPage.tsx` (أو المكافئ) — إعداد الأولوية

**اعتبارات:**
- كل الاستعلامات تحترم عزل POS (`.neq("source","pos")` أو استبعاد reference_id لفواتير POS).
- كل مفتاح React Query المتأثر يُبطَّل بعد أي تغيير: `["transactions"]`, `["customer-statement", id]`, `["invoice", id]`, `["customers"]`.
- كل نص عربي RTL، وكل الألوان من design tokens (لا hardcoded).
- التنبيه في الفاتورة لا يظهر لفواتير POS.

**نطاق مستبعد الآن (يمكن إضافته لاحقاً):**
- تعديل schema لإضافة `credit_source` عمود حقيقي + backfill.
- إشعارات push/بريد عند توليد رصيد دائن.
- تقرير شامل لجميع العملاء بالفائض المتراكم.

بعد الموافقة سأنفّذ الميزات الخمس دفعة واحدة مع الاختبارات.