# خطة مراجعة وتوحيد مفهوم الحسابات في كامل النظام

الهدف: توحيد "مفهوم رصيد العميل" عبر كل السطوح (الفواتير، حوار الدفع، صفحة العملاء، كشف الحساب، التقارير، الطباعة) بحيث لا يظهر رقمان مختلفان لنفس العميل في أي مكان، وتكون مصادر الحقيقة واضحة ومحددة.

## المشكلة الحالية (تشخيص)

1. **تعدد مصادر الرقم**: بعض الصفحات تقرأ `customers.balance` مباشرة، وأخرى تحسب من `invoices`، وأخرى تستخدم `net_balance = balance − credit_balance`، وأخرى تستخدم helper `netBalanceOf`.
2. **مفهوم "الرصيد الدائن" غير موحّد**: أحياناً يُعرض كعمود مستقل، وأحياناً مطروح من المديونية، وأحياناً كبطاقة ثالثة.
3. **حوار الدفع (`CustomerPaymentDialog`)** يعرض المتبقي على الفاتورة فقط دون سياق رصيد العميل الكلي.
4. **نوافذ المديونية في صفحة العملاء**: البادج/الشريط قد يعرض `balance` الخام بينما كشف الحساب يعرض `net_balance` → فرق ظاهري.
5. **POS Isolation** مطبّق في `recompute_customer_balance` وفي بعض القوائم فقط، لكن ليس في كل بطاقات الملخص.
6. **الطباعة** توحّدت مؤخراً على "رصيد العميل الحالي" لكن كشف الحساب المطبوع (`statementPrintTemplate`) لم يُراجَع بنفس المنهجية.

## المبدأ الحاكم (Single Source of Truth)

```
رصيد العميل الحالي = net_balance (محسوب في DB)
                    = Σ(المتبقي على الفواتير غير الملغاة وغير-POS)
                    − Σ(customer_credit للعميل)

net > 0  → "عليه X" (مدين لنا)   — أحمر
net < 0  → "له X"  (دائن)         — أخضر
net = 0  → "خالص"                 — رمادي
```

كل عرض في النظام يجب أن يمر عبر `netBalanceOf()` + `computeDisplayBalance()` + `CustomerAccountSummary` من `src/utils/balanceDisplay.tsx`. ممنوع أي حساب يدوي في مكوّن جديد.

---

## الخطة على 5 دفعات (Batches)

### الدفعة 1 — تدقيق ومسح شامل (لا كود)
- جرد كل مكان يعرض رقم رصيد/مديونية/دائن للعميل: صفحات، بطاقات، بادجات، قوائم منسدلة، حوارات دفع، طباعة، Share pages، تقارير.
- إنتاج جدول: `[Surface | File:Line | Field used | Should be]` وتحديد الخارجين عن المعيار.
- المخرَج: `.lovable/audit/balance-surfaces.md`.

### الدفعة 2 — توحيد صفحة العملاء (`CustomersPage` + `CustomerDetailView`)
- استبدال أي بادج/رقم مباشر بـ `CustomerAccountSummary` (3 خلايا: مدين | دائن | صافي) أو `BalanceChip` للمساحات الضيقة.
- بطاقة "إجماليات العملاء" أعلى الصفحة تستخدم `get_customer_balance_stats` RPC فقط (موجودة).
- فلاتر "المدينون / الدائنون / الخالصون" تعتمد على `net_balance` وليس `balance`.
- ملف الاختبار: `src/test/customersPageBalanceParity.test.tsx`.

### الدفعة 3 — توحيد حوار الدفع (`CustomerPaymentDialog`) وصفحة الفاتورة
- إضافة رأس ملخص في الحوار: `CustomerAccountSummary` (compact) للعميل قبل بدء الدفع، لكي يرى المستخدم رصيده الحالي.
- توضيح ثلاثة حقول منفصلة: "متبقي الفاتورة"، "رصيد دائن سيُستخدم"، "دفعة نقدية جديدة".
- شريط ناتج مباشر في الأسفل: "بعد الحفظ سيصبح رصيد العميل: X" (محسوب لحظياً).
- في `InvoiceViewPage`: توحيد كل ظهور للرصيد على `computeDisplayBalance` + مسمّى "رصيد العميل الحالي".
- تحديث `InvoiceCustomerCreditBanner` ليتّسق مع نفس التسمية والألوان.
- اختبار E2E: `e2e/payment-dialog-shows-customer-net.spec.ts`.

### الدفعة 4 — توحيد كشف الحساب (`CustomerStatementPage` + `PublicCustomerStatementPage`)
- إضافة رأس موحّد في أعلى الصفحة يستخدم `CustomerAccountSummary` (كبير) بدلاً من البطاقات المخصصة الحالية.
- الرصيد الجاري في الجدول يبدأ من 0 ويُبنى من الحركات فقط (invoice + transaction) بعد استبعاد POS و`reference_id` لفواتير POS — نفس المنطق الموجود مع ضمان مطابقته لـ `net_balance` في السطر الأخير.
- إضافة سطر تحقق (Invariant check) في الـ dev-mode فقط: إذا اختلف `runningBalance` النهائي عن `net_balance` بأكثر من 0.01 → toast تحذيري + سجل في `financeInvariants`.
- توحيد قالب الطباعة `statementPrintTemplate` مع `printTemplate` (نفس المسمّيات والألوان).
- اختبار: `src/test/statementRunningVsNetParity.test.ts`.

### الدفعة 5 — توحيد التقارير والطباعة العامة
- `CustomerDebtReportPage` + `TodayInvoicesPage` (تبويب العملاء) + تقارير الديون + أي مكان يعرض قوائم عملاء بمبالغ:
  - عمود واحد للرصيد باستخدام `computeDisplayBalance`، بدل عمودَي balance/credit منفصلين إلا في وضع "تفصيلي".
  - إضافة toggle "عرض تفصيلي (مدين | دائن | صافي)" ← يفعّل `CustomerAccountSummary`.
- تحديث `financialReportPrintTemplate` بنفس المسمّى "رصيد العميل الحالي".
- تحديث `InvoiceAccountingAlert` ليقرأ من نفس المصدر (بدون استعلام إضافي).
- اختبار E2E موحّد: `e2e/balance-parity-across-surfaces.spec.ts` — يفتح 6 صفحات لنفس العميل ويؤكد أن الرقم المعروض متطابق.

---

## Technical Section

### مبادئ ثابتة
1. **لا استعلام مباشر لـ `customers.balance` أو `credit_balance` منفرداً في أي مكوّن جديد** — دائماً عبر `netBalanceOf`.
2. **لا كتابة يدوية لأعمدة الرصيد** — Triggers هي المصدر (`recompute_customer_balance`).
3. **POS Isolation** يُطبَّق في كل استعلام يعرض حركات عميل: `.neq('source','pos')` للفواتير + استبعاد `reference_id ∈ pos_invoice_ids` للـ transactions.
4. **React Query Keys** المتأثرة عند أي دفع/تعديل: `['customers']`, `['customer', id]`, `['customer-statement', id]`, `['invoice', id]`, `['transactions']`.
5. **الألوان**: أحمر = `hsl(var(--destructive))`، أخضر = `hsl(142 70% 35%)` (كما هو معرّف في `balanceDisplay.tsx`)، رمادي للتسوية. لا hardcoded.
6. **RTL + Arabic** إلزامي لكل نص جديد.

### ملفات مخطط إنشاؤها
- `.lovable/audit/balance-surfaces.md` (الدفعة 1)
- `src/components/statement/StatementNetBalanceHeader.tsx` (الدفعة 4)
- `src/components/invoice/PaymentDialogCustomerContext.tsx` (الدفعة 3)
- `src/test/customersPageBalanceParity.test.tsx` (الدفعة 2)
- `src/test/statementRunningVsNetParity.test.ts` (الدفعة 4)
- `e2e/payment-dialog-shows-customer-net.spec.ts` (الدفعة 3)
- `e2e/balance-parity-across-surfaces.spec.ts` (الدفعة 5)

### ملفات مخطط تعديلها
- `src/pages/CustomersPage.tsx`, `src/components/customer/CustomerDetailView.tsx` (الدفعة 2)
- `src/components/invoice/CustomerPaymentDialog.tsx`, `src/pages/InvoiceViewPage.tsx`, `src/components/invoice/InvoiceCustomerCreditBanner.tsx` (الدفعة 3)
- `src/pages/CustomerStatementPage.tsx`, `src/pages/PublicCustomerStatementPage.tsx`, `src/utils/statementPrintTemplate.ts` (الدفعة 4)
- `src/pages/CustomerDebtReportPage.tsx`, `src/pages/TodayInvoicesPage.tsx`, `src/utils/financialReportPrintTemplate.ts`, `src/components/invoice/InvoiceAccountingAlert.tsx` (الدفعة 5)

### بدون تغييرات على قاعدة البيانات
لا migrations في هذه الخطة — كل شيء يستفيد من `net_balance` المحسوب مسبقاً وTriggers الموجودة. أي تعديل schema يُؤجَّل لخطة منفصلة.

### الاستبعادات (خارج النطاق الآن)
- تغيير طريقة حساب `net_balance` في DB.
- تعدد العملات في العرض الموحّد (يحتاج خطة منفصلة).
- تصدير Excel/PDF للحساب الموحّد (يمكن إضافته بعد الدفعة 5).

---

## طريقة التنفيذ

كل دفعة تُنفَّذ في رسالة منفصلة، وبعد كل دفعة:
1. build/type check يمر.
2. اختبار الدفعة أخضر.
3. لقطة/تحقق من صفحتين على الأقل.

الدفعة 1 هي المدخل (تدقيق فقط) وستحدد بدقة أي صفحات تحتاج تدخّل أكبر مما هو مذكور. ابدأ بها؟