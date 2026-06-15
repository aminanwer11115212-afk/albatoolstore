# خطة إصلاح شاملة — قضايا تدقيق Albatool UI

التدقيق السابق رصد 11 قضية موزّعة على 5 حمراء + 6 متوسطة + قضايا منخفضة. الخطة تنفّذها بالترتيب من الأخطر للأقل.

## المرحلة 1 — قضايا حمراء (تؤثر على البيانات والاستخدام)

### 1. `QuotesPage.tsx` — مفتاح cache خاطئ
**المشكلة:** يستدعي `invalidateQueries(['quotes'])` بينما المفتاح الصحيح المُستخدم في `useData` هو `['quotes-full']` → القائمة لا تتحدّث بعد الإرسال/الطباعة/التحويل لفاتورة.
**الحل:** استبدال المفتاح في الأسطر 88, 97, 111 إلى `['quotes-full']`.

### 2. `QuoteViewPage.tsx:184` — نص تأكيد مضلِّل
**المشكلة:** رسالة التأكيد تقول "حذف" بينما العملية فعلياً حفظ كمقبول.
**الحل:** تصحيح النص ليعكس العملية الحقيقية.

### 3. `TodayInvoicesPage.tsx:72` — زر "عرض" أصغر من حد اللمس
**المشكلة:** ارتفاع ~27px لا يلبي الحد الأدنى 44px لشاشات اللمس.
**الحل:** إضافة `min-h-[44px] min-w-[44px]` على الزر.

### 4. `QuoteCreatePage.tsx:279` — `btnStyle height:30`
**المشكلة:** زر غير ملائم للموبايل.
**الحل:** رفع `minHeight` إلى 44.

### 5. `TransactionsPage.tsx` — أزرار Eye/Printer بدون handlers
**المشكلة:** الأزرار معروضة لكن بدون onClick.
**الحل:** ربط زر "عرض" بـ dialog تفاصيل المعاملة، وزر "طباعة" بـ window.print() للسجل الواحد. (أو إخفاؤها مؤقتاً إن قرّر المستخدم).

## المرحلة 2 — قضايا متوسطة (تماسك بيانات و UX)

### 6. `QuoteViewPage.tsx:173` و `InvoiceViewPage.tsx:211` — `handleStatusChange` بدون invalidate
**الحل:** إضافة `queryClient.invalidateQueries(['quotes-full' | 'invoices-full'])` بعد تغيير الحالة.

### 7. `QuoteViewPage.tsx:183` — `handleConvertToInvoice` بدون invalidate
**الحل:** إضافة invalidate لـ `quotes-full` و `invoices-full` بعد التحويل.

### 8. ألوان مُجمّدة في `QuotesPage:233`, `InvoicesPage:248`, `SideQuotes*`
**المشكلة:** `#3b82f6`, `#7c3aed`, gradients غير مطابقة للوضع الداكن.
**الحل:** استبدال بـ semantic tokens (`hsl(var(--primary))`, `bg-primary`, إلخ).

### 9. `IncomeReportPage.tsx` — قطع البيانات بصمت عند 50 سجل
**الحل:** رفع الحد إلى 500 + إظهار رسالة "تم اقتطاع النتائج" + إضافة pagination بسيط.

### 10. `BankTransfersReportPage.tsx` — حد 100/بنك بصمت
**الحل:** نفس النمط — رفع الحد + رسالة تنبيه + pagination.

### 11. `InvoiceCreatePage.tsx:263` — `minHeight:36` على الموبايل
**الحل:** رفع إلى 44.

### 12. `TransferPage.tsx` — لا فحص رصيد قبل التحويل
**الحل:** قبل `insert.mutateAsync`، فحص `from_account.balance >= amount` وإلا toast.error بـ "الرصيد غير كافٍ".

## المرحلة 3 — قضايا منخفضة (تنظيف)

- إضافة `dir="rtl"` في `TodayInvoicesPage` و `SideQuoteDetailPage`.
- استخراج `getUserKey()` و `generatePdfBlob()` المكرّرة بين `FinancialReportPreviewPage` و `StatementPreviewPage` إلى `src/utils/reportPreviewHelpers.ts`.
- تضييق `any` types في صفحات التقارير المالية (يُترك اختيارياً).

## ما لا يتغيّر

- لا تغيير على schema قاعدة البيانات.
- لا تعديل في `src/integrations/supabase/client.ts` أو `types.ts`.
- لا تغيير على القواعد العامة في `index.css` (الموبايل ≥16px input, touch ≥40px).
- لا تغيير على templates الطباعة.

## ترتيب التنفيذ

1. حمراء 1-5 → تشغيل وفحص بصري سريع.
2. متوسطة 6-12 → ثم بناء.
3. منخفضة → دفعة أخيرة.

## التحقّق

- بعد كل مرحلة: قراءة `dev-server` logs للتأكد من عدم وجود أخطاء.
- اختبار يدوي للديسكتوب والموبايل (375×812) على الصفحات المعدّلة.
- تشغيل `bunx vitest run` للاختبارات الموجودة (`quotesPageStatuses.test.ts`, `invoiceStatus.test.ts`, إلخ).

## ملفات ستُعدّل (ملخّص)

```
src/pages/QuotesPage.tsx
src/pages/QuoteViewPage.tsx
src/pages/InvoiceViewPage.tsx
src/pages/QuoteCreatePage.tsx
src/pages/InvoiceCreatePage.tsx
src/pages/TodayInvoicesPage.tsx
src/pages/TransactionsPage.tsx
src/pages/TransferPage.tsx
src/pages/IncomeReportPage.tsx
src/pages/BankTransfersReportPage.tsx
src/pages/InvoicesPage.tsx
src/pages/SideQuoteDetailPage.tsx
src/pages/SideQuotesPage.tsx (إن وُجد)
src/utils/reportPreviewHelpers.ts  (جديد)
```

استخدمت مهارة `albatool-ui-audit` لتجميع قائمة القضايا في هذه الخطة.
