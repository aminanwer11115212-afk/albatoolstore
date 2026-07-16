# الدفعة 4 — كشف الحساب + سجل الحذف + توست الحذف

## 1) توست الحذف (كل صفحات الحذف)
- `deleteInvoiceWithStockRestore` بالفعل يُرجع `newCustomerBalance` + `newCustomerCredit` + `restoredItems` + `deletedPayments` (عبر `convertedToCredit`/details).
- توحيد التوست عبر util جديد `src/utils/deleteInvoiceToast.ts`:
  - سطر 1: `تم حذف الفاتورة {invoice_number}`.
  - سطر 2: عدد بنود المخزون المُرجَعة + إجمالي الكميات.
  - سطر 3: إن كان هناك `deletedPayments > 0` → `أُلغيت دفعات بقيمة X` (من `paid_amount` قبل الحذف).
  - سطر 4 (للفواتير العادية غير POS): `رصيد العميل الآن: عليه X / له Y / مسدَّد` — عبر `netBalanceOf({balance:newCustomerBalance, credit_balance:newCustomerCredit})` و `describeBalance`.
- استبدال كل نداءات `toast()` بعد الحذف في:
  - `InvoicesPage.tsx`, `TodayInvoicesPage.tsx`, `InvoiceViewPage.tsx`, `InvoiceEditPage.tsx`, `CashInvoicesPage`/`CashInvoiceEditPage`, `CustomerStatementPage` (زر حذف مضمن إن وُجد).

## 2) صفة الرد من util الحذف
- تعديل `DeleteInvoiceResult` لإضافة:
  - `deletedPayments: number` (المبلغ المُلغى فعلياً).
  - `totalRestoredQty: number` (مجموع الكميات المُرجَعة للمخزون).
- تحديث الاختبارات الحالية لإدراج الحقلين (لا كسر).

## 3) كشف حساب العميل يعرض الفواتير المحذوفة
- مصدر البيانات: جدول `activity_log` (موجود) مع `entity_type='invoice' AND action='delete' AND (old_data->>'customer_id')=$1`.
- في `CustomerStatementPage.tsx` و `PublicCustomerStatementPage.tsx`:
  - جلب سجلات الحذف الخاصة بالعميل ضمن نفس نطاق التاريخ.
  - عرضها كصفوف في الجدول برمز 🗑 وخلفية `bg-destructive/5`، مع:
    - رقم الفاتورة (من `old_data.invoice_number`)
    - التاريخ (`old_data.date`)
    - الإجمالي (`old_data.total`) بلون مشطوب
    - المدفوع الذي أُلغي (`details.deleted_payments`)
    - عدد البنود (`details.items_count`) + عبارة "أُرجعت للمخزون" إن `details.restored_stock`.
  - عمود جديد "المصدر" يميّز: فاتورة / سند قبض / **فاتورة محذوفة**.
  - لا تدخل في المجاميع (لأنها فعلياً أُلغيت — الرصيد أعيد حسابه بالفعل).

## 4) توحيد رأس كشف الحساب
- استخدام `CustomerAccountSummary` بحجم `md` في رأس `CustomerStatementPage` و `PublicCustomerStatementPage` بدلاً من الحساب اليدوي الحالي.
- تحديث `statementPrintTemplate.ts` ليطبع سطر "رصيد العميل الحالي" الموحّد (نص واحد: مسدَّد/عليه X/له Y) بدل الحقلين المنفصلين.

## 5) تحديث سريع بعد الحذف
- بعد الحذف نُطلق بالفعل `invoices:changed / customers:changed / transactions:changed / products:changed`.
- إضافة `queryClient.invalidateQueries` صريح لمفاتيح: `["customer-statement", customerId]`, `["activity-log", "invoice-deletions", customerId]`, `["customers"]`, `["dashboard-stats"]`.

## تنفيذ
دفعة واحدة (5 ملفات جديدة/معدّلة + ملف اختبار):
1. `src/utils/deleteInvoice.ts` — يُرجع `deletedPayments` + `totalRestoredQty`.
2. `src/utils/deleteInvoiceToast.ts` — util موحّد.
3. `src/hooks/useDeletedInvoicesForCustomer.ts` — hook للجلب من `activity_log`.
4. `src/pages/CustomerStatementPage.tsx` — دمج الصفوف + رأس موحّد.
5. `src/pages/PublicCustomerStatementPage.tsx` — نفس التعديلات (للقراءة العامة عبر توكن).
6. `src/utils/statementPrintTemplate.ts` — سطر الرصيد الموحّد + تمرير الحذف.
7. استبدال `toast(...)` في `InvoicesPage`, `TodayInvoicesPage`, `InvoiceViewPage`, `InvoiceEditPage`, `CashInvoicesPage`, `CashInvoiceEditPage`.
8. `src/test/deleteInvoiceToast.test.ts` — يغطي الحالات الأربع (خالص/مدين/دائن/POS).

## غير مشمول (خارج النطاق)
- الدفعة 5 (تقارير الديون + Alert المحاسبي) تبقى للجولة التالية.
- حذف الفواتير من `activity_log` بالفعل موجود من التعديل السابق — لا حاجة لـmigration.
