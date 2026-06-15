# فحص شامل لجميع شاشات الموبايل والديسكتوب

نستخدم مهارة `albatool-ui-audit` (موجودة بالفعل) مع توسعتين هذه المرة:
1. فحص **بصري runtime** فعلي عبر `browser--view_preview` بمقاسي 375×812 و 1366×768 لعيّنة من الصفحات الحرجة.
2. مقارنة النتائج مع قائمة القضايا المعروفة سابقاً (12 قضية تمّت معالجتها) لضمان عدم العودة.

## المرحلة 1 — فحص ساكن متوازي (Static Audit)

تشغيل 6 وكلاء فرعيين بالتوازي عبر `acp_subagent--spawn_agent`، كل واحد مسؤول عن قطاع:

| القطاع | الصفحات (مختصر) |
|---|---|
| **A. Sales** | Quotes, QuoteCreate, QuoteView, Invoices, InvoiceCreate, InvoiceView, TodayInvoices, SideQuotes |
| **B. Inventory** | Products, ImportProducts, StockTransfer, StockReturns, ProductCompanies, PackagingTypes |
| **C. Parties** | Customers, Suppliers, Employees, CustomerLogistics, CustomerStatement, SupplierStatement, Staff portal |
| **D. Logistics** | InvoicePackaging, InvoiceTransport, QuotePackaging, QuoteTransport, Dispatch, TransportPackagingReport |
| **E. Finance** | Accounts, Transactions, Transfer, BalanceSheet, TrialBalance, IncomeReport, ExpenseStatement, BankTransfers, AccountStatement, FilteredTransactions, CustomerDebt, TaxReport, FinancialReportPreview, StatementPreview |
| **F. System** | Dashboard, Settings (Company/Currency/Recaptcha/Twilio/Payment), Backup, ActivityLog, DataHealth, SystemStatus, Notifications, Goals, Calendar, Todo, Projects, Layout (Sidebar/Navbar), Auth |

كل وكيل يفحص لكل صفحة:
1. **التوجيه** — مسجّلة في `App.tsx`، lazy import صحيح.
2. **الأزرار** — كل `onClick` له handler حقيقي يستدعي mutation/navigate موجود + toast.
3. **النماذج** — validation قبل insert/update، الحقول المطلوبة محمية.
4. **الـ Dialogs** — تفتح/تغلق/تحفظ مع `invalidateQueries` صحيح المفاتيح.
5. **مفاتيح cache** — تطابق ما هو فعلاً مستخدم في `useData.ts` (مثال: `quotes-full` لا `quotes`).
6. **موبايل ≤640px** — touch ≥44px، input ≥16px، لا overflow أفقي، تحويل الجداول إلى `MobileDocList` حيث ينطبق.
7. **RTL** — `dir="rtl"` على الصفحة، لا `text-left`/`mr-*` خاطئة، Cairo bold محفوظة.
8. **Design tokens** — لا hardcoded colors (`#xxxxxx`, `rgb(...)`, gradients ثابتة)، فقط `hsl(var(--*))`.
9. **التخصيص** — مفاتيح `lov:u:{uid}:ff:{mobile|desktop}:{scope}:{base}` صحيحة.
10. **عدم العودة** — تأكيد أن القضايا المُصلَحة لم ترجع (مفاتيح `["quotes"]` خام، `minHeight:30/36`، الأزرار اليتيمة، الألوان `#3b82f6`).

كل وكيل يُرجع JSON:
```json
{
  "sector": "Sales",
  "pages_checked": [...],
  "ok": [...],
  "issues": [
    { "severity": "high|med|low", "file": "src/...:LINE",
      "what": "...", "form_factor": "mobile|desktop|both", "fix_hint": "..." }
  ],
  "needs_runtime_check": [...]
}
```

## المرحلة 2 — فحص runtime بصري

لكل صفحة في قائمة `needs_runtime_check` (أو الحرجة دائماً): فاتورة جديدة، عرض سعر جديد، الفواتير، العملاء، المنتجات، الترحيلات، التقارير:

- `browser--view_preview` بـ **375×812 (Moto/iPhone)** ثم **1366×768 (Desktop)**.
- التقاط الـ console logs و network errors عبر `browser--read_console_logs`.
- فتح كل dialog أساسي والتأكد من ظهور الأزرار كاملة بدون overflow.

## المرحلة 3 — تجميع التقرير

ادمج كل `issues` في جدول واحد:
- 🔴 **High**: يكسر بيانات/يمنع إنجاز عملية.
- 🟡 **Med**: UX خاطئ لكن العملية تكتمل.
- 🟢 **Low**: تنظيف/تجانس.

لكل قضية: الملف:السطر — الوصف — التأثير (mobile/desktop/both) — الإصلاح المقترح.

في نهاية التقرير: قائمة "✅ قطاعات نظيفة" و "⚠️ يحتاج إصلاح".

## المرحلة 4 — موافقة المستخدم

أعرض الجدول وأنتظر اختيارك:
- (أ) إصلاح كل الحمراء فوراً.
- (ب) حمراء + متوسطة معاً.
- (ج) قضية محددة بالرقم.
- (د) إصدار التقرير فقط دون إصلاح.

## القيود

- الوكلاء **قراءة فقط** — لا تعديلات قبل موافقتك.
- حد أقصى 6 وكلاء بالتوازي.
- لا تغيير على schema قاعدة البيانات أو `client.ts`/`types.ts` أو قواعد `index.css` العامة للموبايل.
- التقارير بالعربية، استجابات الوكلاء بالإنجليزية (أسرع وأدق).

## المخرجات المتوقعة

1. تقرير شامل مرتّب بالأولويات.
2. قائمة pages_checked كاملة (~60 صفحة).
3. قائمة `needs_runtime_check` بعد المرحلة 2 محسومة (نعم/لا).
4. اقتراح إصلاحات قابلة للتطبيق مباشرة.
