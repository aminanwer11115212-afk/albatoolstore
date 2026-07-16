# تدقيق سطوح عرض رصيد العميل — الدفعة 1

مسح شامل لكل مكان في الكود يعرض `balance` / `credit_balance` / `net_balance` لعميل، مع تصنيف الحالة والإجراء المطلوب.

## المعيار (Standard)
- **صحيح ✅**: يمر عبر `netBalanceOf()` / `computeDisplayBalance()` / `CustomerAccountSummary` / `BalanceChip` من `src/utils/balanceDisplay.tsx`.
- **يحتاج توحيد ⚠️**: يقرأ الحقول الخام لكن العرض متسق.
- **خارج المعيار ❌**: حساب يدوي / hardcoded colors / يعرض `balance` وحده دون خصم credit.

## الملخص (Executive)

| # | الملف | السطر | الحالة | ملاحظة | الدفعة |
|---|---|---|---|---|---|
| 1 | `components/CustomerDetailView.tsx` | 41-48 | ✅ | يستخدم netBalanceOf + summary | 2 |
| 2 | `pages/CustomersPage.tsx` | — | ⚠️ | يحتاج فحص أعمدة القائمة (بادج عليه/له) | 2 |
| 3 | `components/CustomerNetBalanceCard.tsx` | 16, 51 | ✅ | يستخدم computeDisplayBalance + summary | — |
| 4 | `components/dashboard/ChargeBalanceDialog.tsx` | 86, 191, 238 | ✅ | يستخدم netBalanceOf | — |
| 5 | `components/invoice/CustomerPaymentDialog.tsx` | 136-140, 549 | ⚠️ | يقرأ الحقول الخام لكنه يمرّرها لـ netBalanceOf؛ ينقصه رأس ملخص للعميل | 3 |
| 6 | `components/invoice/InvoiceCustomerCreditBanner.tsx` | 45, 55 | ⚠️ | يقرأ credit_balance فقط ولا يعرض net context | 3 |
| 7 | `pages/InvoiceCreatePage.tsx` | — | ⚠️ | يعرض رصيد العميل عند الاختيار — يحتاج توحيد على `CustomerInfoStrip`+`netBalanceOf` (موجود جزئياً) | 3 |
| 8 | `pages/InvoiceViewPage.tsx` | — | ⚠️ | يعرض "رصيد العميل الحالي" في الطباعة فقط؛ ينقصه ظهور واضح على الشاشة | 3 |
| 9 | `pages/CustomerStatementPage.tsx` | — | ⚠️ | بطاقات مخصصة بدل CustomerAccountSummary + running balance غير مقارن بـ net_balance | 4 |
| 10 | `pages/PublicCustomerStatementPage.tsx` | 128-131 | ⚠️ | يحسب net يدوياً بدل helper | 4 |
| 11 | `utils/statementPrintTemplate.ts` | — | ❌ | لم يُحدَّث لمسمّى "رصيد العميل الحالي" الموحّد | 4 |
| 12 | `pages/CustomerDebtReportPage.tsx` | 14-32, 174-177 | ⚠️ | يعرض عمودَي balance/credit + net منفصلة؛ يحتاج toggle "تفصيلي" | 5 |
| 13 | `utils/financialReportPrintTemplate.ts` | — | ⚠️ | يحتاج توحيد التسمية | 5 |
| 14 | `components/invoice/InvoiceAccountingAlert.tsx` | — | ⚠️ | استعلام إضافي مستقل؛ يجب أن يقرأ من نفس مصدر netBalanceOf | 5 |
| 15 | `pages/DocumentPreviewPage.tsx` | — | ✅ | يستخدم netBalanceOf | — |
| 16 | `pages/QuoteCreatePage.tsx` / `StockReturnCreatePage.tsx` | 802/1013 | ✅ | oldBalance = netBalanceOf | — |

## سطوح المورّدين (خارج نطاق الخطة، للعلم فقط)
- `SupplierDetailView.tsx`, `SupplierStatementPage.tsx`, `SuppliersPage.tsx`, `PurchaseCreatePage.tsx` تستخدم `supplier.balance` مباشرة بدون مفهوم credit_balance للمورد (لا يوجد `net_balance` للمورد في DB). ← تُترك كما هي.

## سطوح الحسابات (accounts, ليس customer) — خارج النطاق
- `AccountsPage`, `AccountStatementPage`, `TransactionsPage`, `TransferPage`, `DashboardAccountBalances`, `FloatingSideTools`, `BalanceSheetPage`, `NotificationsPage` تعرض `accounts.balance` وهو مفهوم مختلف تماماً (رصيد حساب بنكي/كاش).
- **ملاحظة إصلاح فرعي**: `DashboardAccountBalances.tsx:52` يستخدم `text-green-600` — hardcoded → يجب تحويله لـ `text-primary` أو token. (يمكن إصلاحه في الدفعة 5 كـ cleanup).

## خلاصة النطاق الفعلي للدفعات 2-5

- **الدفعة 2** (صفحة العملاء): `CustomersPage.tsx`, `CustomerDetailView.tsx` (فحص فقط لأنه صحيح), فلاتر net_balance.
- **الدفعة 3** (الدفع والفاتورة): `CustomerPaymentDialog.tsx` (رأس ملخص), `InvoiceCustomerCreditBanner.tsx`, `InvoiceViewPage.tsx` (شريط رصيد ظاهر).
- **الدفعة 4** (كشف الحساب): `CustomerStatementPage.tsx`, `PublicCustomerStatementPage.tsx`, `statementPrintTemplate.ts`.
- **الدفعة 5** (تقارير + طباعة): `CustomerDebtReportPage.tsx`, `financialReportPrintTemplate.ts`, `InvoiceAccountingAlert.tsx`, وإصلاح hardcoded color في `DashboardAccountBalances`.

## قواعد يجب تطبيقها في الدفعات القادمة
1. أي قراءة لـ `balance`/`credit_balance`/`net_balance` تُمرَّر لـ `netBalanceOf` قبل العرض.
2. أي عرض بصري (رقم+لون+لصيقة) يمر عبر `computeDisplayBalance` أو مكوّن `CustomerAccountSummary`/`BalanceChip`.
3. المسمّى الموحّد في كل الطباعة والشاشة: **"رصيد العميل الحالي"** (خالص / عليه X / له X).
4. لا حسابات يدوية `balance - credit_balance` في مكوّن جديد.
