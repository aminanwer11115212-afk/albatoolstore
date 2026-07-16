# خطة: توحيد الرصيد + كشف حساب مستقل

## المشكلة (من الصورتين)
- صفحة إنشاء الفاتورة تعرض: **"عليه 924,000"** للعميل "امين انور".
- بطاقة تفاصيل العميل تعرض: صافي **300,000 له** (فائض) — مديونية 200,000 مقابل رصيد دائن 500,000.

السبب: `InvoiceCreatePage` تحسب `net = balance − credit_balance` مباشرةً من الجدول (خام)، بينما بقية النظام تستخدم helper `netBalanceOf` (الذي يفضّل `net_balance` المحسوب من DB). أي مصدر خام ⇒ نتائج متباينة عبر الصفحات.

## المحاور الثلاثة

### 1) توحيد "مصدر الحقيقة" للرصيد
- كل مكان يقرأ `customers.balance` / `credit_balance` مباشرة يجب أن يمرّ عبر `netBalanceOf` من `@/utils/balanceDisplay`.
- تعديل `InvoiceCreatePage.tsx` (سطر ~1727-1757 و 302-305 و 338-344) لجلب `net_balance` أيضًا وتمريره لـ `netBalanceOf`.
- تعديل نفس السلوك في `QuoteCreatePage`, `PurchaseCreatePage`, `StockReturnCreatePage`, `CustomerPaymentDialog` إن وُجد الفارق.
- تشغيل subagent لفحص كامل شامل لكل استخدامات `balance` / `credit_balance` وإرجاع قائمة الملفات التي تحتاج توحيد.

### 2) استخراج كشف حساب العميل كصفحة مستقلة
- المسار الحالي: كشف الحساب يُفتَح كتبويب داخل `CustomerDetailPage` (أو ما شابه).
- المطلوب:
  - إنشاء route جديد: `/customers/:id/statement` (أو `/customer-statement/:id`).
  - نقل محتوى الكشف من `CustomerStatementPage.tsx` (الموجود أصلاً) للتأكد أنه يعمل كصفحة كاملة (header + رجوع + toolbar + طباعة + PDF + فواتير محذوفة + reconciliation).
  - زر "كشف حساب" في:
    * `CustomerDetailPage` (زر موجود أصلاً — يوجّه للـ route الجديد).
    * `CustomersPage` (قائمة العملاء — إضافة زر إجراء).
    * `DebtorsPage` / تقرير المديونين.
    * `InvoiceViewPage` (تحت اسم العميل).
    * `InvoiceCreatePage` (زر بجانب اسم العميل).
- الصفحة الجديدة توسع نفس مكوّن الكشف الحالي — لا تكرار كود.

### 3) اتساق العرض
- بعد التوحيد، تأكيد أن الأرقام في:
  - بطاقة تفاصيل العميل
  - كشف الحساب (banner reconciliation)
  - حقل "تفاصيل العميل" في إنشاء الفاتورة
  - `CustomerPaymentDialog`
  - `InvoiceCustomerCreditBanner`
  
  كلها تعطي نفس الرقم لنفس العميل في نفس اللحظة.

## خطوات التنفيذ (بالترتيب)
1. تشغيل subagent لفحص شامل: قائمة كل نقاط عرض الرصيد + كل نقاط الدخول لكشف الحساب الحالية.
2. توحيد جميع نقاط عرض الرصيد لاستخدام `netBalanceOf` (مع جلب `net_balance` عمود من DB).
3. تسجيل route `/customers/:id/statement` في `App.tsx` وتحويل `CustomerStatementPage` لتقبل `:id` من URL params.
4. إضافة/تحديث أزرار "كشف حساب" في الصفحات الخمس المذكورة أعلاه.
5. تحقق بصري عبر Playwright: فتح الفاتورة + بطاقة العميل + الكشف والتأكد أن الأرقام متطابقة.

## تقنياً
- لا تغييرات على DB / triggers / RLS.
- استخدام `netBalanceOf` الموجود — لا helper جديد.
- الصفحة المستقلة تعيد استخدام مكوّنات الكشف الحالية (لا نسخ).
- عدم لمس أي auto-gen أو logic خارج نطاق العرض.
