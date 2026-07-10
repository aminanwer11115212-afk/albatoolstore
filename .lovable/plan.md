# خطة: خصم موحّد + زر «سجّل دفعة» في المعاينة + تصحيح حالة الفاتورة

## المشاكل المطروحة
1. **الخصم غير موحّد** بين إنشاء الفاتورة، إنشاء عرض السعر، تعديل الفاتورة، وتسجيل الدفعة — يجب أن يظهر كمربع خصم في الجانب على كل هذه الشاشات.
2. **حالة الفاتورة عند تسجيل الدفع** تنتقل مباشرة إلى "done" في workflow، بينما `status` قد لا يُحدَّث لـ `partial` أو `paid` تلقائيًا حسب `paid_amount` مقابل `total`.
3. **زر «سجّل دفعة»** غير موجود داخل معاينة الفاتورة — يجب إضافته لتسريع التحصيل.
4. **TS2305** لدالة `filterAllowedBankAccounts` — تم إصلاحه (alias مُصدَّر).

## المخرجات المتوقعة
- مربع خصم موحّد (نسبة % أو مبلغ مقطوع) في: إنشاء/تعديل الفاتورة، فاتورة الكاش، عرض السعر، حوار تسجيل الدفعة.
- عند تسجيل دفعة → إعادة حساب `status`: `paid` إن `paid >= total`، `partial` إن `paid > 0 && paid < total`، وإلا `pending`.
- زر «💳 سجّل دفعة» ضمن شريط أدوات `DocumentPreviewPage` (يظهر فقط للفواتير ذات متبقّي > 0 ولعميل مسجّل، ويحترم عزلة POS).
- Trigger DB اختياري يعيد حساب `status` تلقائيًا عند تحديث `paid_amount` (احتياطي).

---

## توزيع العمل على Sub-Agents

### 🤖 SUBAGENT #1 — مركّب خصم موحّد (Reusable Discount Box)
**مكان التنفيذ:**
- إنشاء: `src/components/shared/DiscountInput.tsx`
- إنشاء: `src/test/discountInput.test.tsx`

**المهمة:** بناء مكوّن `<DiscountInput value onChange grandBeforeDiscount />` يعرض حقلين: **نسبة %** و **مبلغ مقطوع**، متزامنَين تلقائيًا. يستخدم design tokens فقط. يمرَّر لاحقًا لصفحات الإنشاء والتعديل والدفع.

---

### 🤖 SUBAGENT #2 — تركيب مربع الخصم في صفحات الفواتير وعروض الأسعار
**مكان التنفيذ:**
- تعديل: `src/pages/InvoiceCreatePage.tsx`
- تعديل: `src/pages/QuoteCreatePage.tsx`
- تعديل: أي `InvoiceCashCreatePage` / `InvoiceEditPage` موجود (بحث عبر rg)
- تعديل: `src/components/purchase/SupplierPaymentDialog.tsx` (وحوار دفع العميل إن وُجد)

**المهمة:**
1. استبدال حقل الخصم الحالي (أو إضافته إن غاب) بمكوّن `DiscountInput` في الشريط الجانبي/بطاقة الإجماليات.
2. تمرير القيمة الموحّدة لحقل `discount` في الحفظ.
3. تأكيد ظهورها في `printTemplate` تلقائيًا (تم في الجولة السابقة).

---

### 🤖 SUBAGENT #3 — تصحيح حالة الفاتورة تلقائيًا + Trigger DB احتياطي
**مكان التنفيذ:**
- إنشاء: `src/utils/computeInvoiceStatus.ts` (دالة نقية + اختبار)
- تعديل: أي مكان يُحدّث `paid_amount` أو ينشئ دفعة عميل — استدعاء `updateInvoiceStatusAfterPayment(invoiceId)`
- **DB migration** (عبر supabase--migration): trigger `trg_invoice_recompute_status` على `invoices` عند تغيّر `paid_amount` أو `total` يعيد حساب `status` (مع احترام `cancelled`).

**المنطق:**
```
if status='cancelled' → keep
else if paid >= total-0.01 → 'paid'
else if paid > 0.01 → 'partial'
else if due_date && due_date < today → 'overdue'
else → 'pending'
```

---

### 🤖 SUBAGENT #4 — زر «سجّل دفعة» في معاينة الفاتورة
**مكان التنفيذ:**
- إنشاء: `src/components/invoice/CustomerPaymentDialog.tsx` (على غرار SupplierPaymentDialog، بالاتجاه المعاكس: `income` / `customer_payment`).
- تعديل: `src/pages/DocumentPreviewPage.tsx` (إضافة الزر في شريط الأدوات)
- تعديل: `src/pages/InvoiceViewPage.tsx` (إن كان يريده هنا أيضًا)

**السلوك:**
- الزر يظهر فقط إذا `docType==="invoice"` و `remaining > 0` و للفاتورة عميل مسجّل (احترام عزلة POS: للفواتير `source='pos'` استخدم مسار الكاش).
- بعد الحفظ: إعادة تحميل المعاينة (`react-query invalidate` لمفاتيح `invoices`, `customers`, `transactions`).

---

### 🤖 SUBAGENT #5 — تحقّق شامل (Playwright + vitest)
**مكان التنفيذ:** `/tmp/browser/`

**المهمة:**
1. سيناريو: إنشاء فاتورة بخصم 10% → التحقق أنها محفوظة، ثم معاينة تُظهر سطر الخصم.
2. تسجيل دفعة جزئية من زر المعاينة → التحقق أن `status='partial'` وأن السطر النهائي أحمر بعلامة −.
3. تسجيل دفعة كاملة → `status='paid'` و "✓ مسددة بالكامل".
4. دفع زائد → `status='paid'` و "أُضيفت لحسابه" أخضر.
5. تشغيل `bunx vitest run discountInput computeInvoiceStatus documentBalanceSummary printTemplate`.

---

## الترتيب
- SUBAGENT #1 (المكوّن) و #3 (منطق الحالة + Trigger) بالتوازي أولًا.
- SUBAGENT #2 (تركيب) و #4 (زر الدفع) بالتوازي بعد #1.
- SUBAGENT #5 آخر خطوة.

## قواعد يجب احترامها
- **عزلة POS**: زر «سجّل دفعة» يجب ألا يُنشئ `transaction` مرتبطة بعميل حقيقي لفاتورة `source='pos'` (skill: albatool-cash-payment-isolation).
- Design tokens فقط، RTL/Cairo، لا ألوان hex في مكوّنات React.
- استخدم `duplicateDocGuard` عند حفظ التعديلات (mem://features/duplicate-save-guard).
- Trigger DB يجب أن يحترم `SECURITY DEFINER SET search_path = public`.
