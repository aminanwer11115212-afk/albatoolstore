/**
 * خريطة prefetch لكل مسار كسول → دالة الـ dynamic import الخاصة بالصفحة.
 * عند hover/focus على رابط، نستدعي الدالة المقابلة فيبدأ المتصفح بتنزيل
 * الـ chunk في الخلفية. عند النقر فعلياً تكون الصفحة جاهزة فوراً.
 *
 * الدوال هنا هي نفسها المستخدَمة في src/App.tsx مع lazy()،
 * مما يجعل Vite يستخدم نفس الـ chunk (cache hit).
 */

type Importer = () => Promise<unknown>;

const prefetched = new Set<string>();

const map: Record<string, Importer> = {
  // Sales
  "/invoices": () => import("@/pages/InvoicesPage"),
  "/invoices/create": () => import("@/pages/InvoiceCreatePage"),
  "/invoices/cash": () => import("@/pages/InvoiceCreatePage"),
  "/invoices/view": () => import("@/pages/InvoiceViewPage"),
  "/invoices/edit": () => import("@/pages/InvoiceCreatePage"),
  "/invoices/packaging": () => import("@/pages/InvoicePackagingPage"),
  "/invoices/transport": () => import("@/pages/InvoiceTransportPage"),
  "/quotes": () => import("@/pages/QuotesPage"),
  "/quotes/create": () => import("@/pages/QuoteCreatePage"),
  "/quotes/view": () => import("@/pages/QuoteViewPage"),
  "/quotes/edit": () => import("@/pages/QuoteCreatePage"),
  "/quotes/packaging": () => import("@/pages/QuotePackagingPage"),
  "/quotes/transport": () => import("@/pages/QuoteTransportPage"),
  // Inventory
  "/products": () => import("@/pages/ProductsPage"),
  "/products/add": () => import("@/pages/ProductsPage"),
  "/products/report": () => import("@/pages/ProductsPage"),
  "/products/out-of-stock": () => import("@/pages/ProductsPage"),
  "/products/in-stock": () => import("@/pages/ProductsPage"),
  "/products/price-report": () => import("@/pages/ProductsPage"),
  "/companies": () => import("@/pages/ProductCompaniesPage"),
  "/stock-transfer": () => import("@/pages/StockTransferPage"),
  "/purchase": () => import("@/pages/PurchasePage"),
  "/purchase/create": () => import("@/pages/PurchaseCreatePage"),
  "/stock-return": () => import("@/pages/StockReturnPage"),
  "/stock-return/create": () => import("@/pages/StockReturnCreatePage"),
  "/import/products": () => import("@/pages/ImportProductsPage"),
  // CRM
  "/customers": () => import("@/pages/CustomersPage"),
  "/customers/create": () => import("@/pages/CustomersPage"),
  "/customers/debt-report": () => import("@/pages/CustomerDebtReportPage"),
  "/customers/logistics": () => import("@/pages/CustomerLogisticsPage"),
  "/suppliers": () => import("@/pages/SuppliersPage"),
  "/suppliers/create": () => import("@/pages/SuppliersPage"),
  "/transporters": () => import("@/pages/PlaceholderPage"),
  "/transporters/add": () => import("@/pages/PlaceholderPage"),
  "/packaging": () => import("@/pages/PackagingTypesPage"),
  "/packaging/add": () => import("@/pages/PackagingTypeAddPage"),
  "/employees": () => import("@/pages/EmployeesPage"),
  "/employees/add": () => import("@/pages/EmployeesPage"),
  "/destinations": () => import("@/pages/SimpleCrudPage"),
  // Accounting
  "/accounts": () => import("@/pages/AccountsPage"),
  "/accounts/add": () => import("@/pages/AccountsPage"),
  "/accounts/balance-sheet": () => import("@/pages/BalanceSheetPage"),
  "/transactions": () => import("@/pages/TransactionsPage"),
  "/transactions/add": () => import("@/pages/TransactionsPage"),
  "/transactions/transfer": () => import("@/pages/TransferPage"),
  "/transactions/income": () => import("@/pages/FilteredTransactionsPage"),
  "/transactions/expenses": () => import("@/pages/FilteredTransactionsPage"),
  // Reports
  "/reports/account-statement": () => import("@/pages/AccountStatementPage"),
  "/reports/income": () => import("@/pages/IncomeReportPage"),
  "/reports/expenses": () => import("@/pages/IncomeReportPage"),
  "/reports/tax": () => import("@/pages/TaxReportPage"),
  "/reports/daily-invoices": () => import("@/pages/DailyInvoicesReportPage"),
  "/reports/today-invoices": () => import("@/pages/TodayInvoicesPage"),
  "/reports/customer-statement": () => import("@/pages/CustomerStatementPage"),
  "/reports/supplier-statement": () => import("@/pages/SupplierStatementPage"),
  "/reports/bank-transfers": () => import("@/pages/BankTransfersReportPage"),
  "/reports/statistics": () => import("@/pages/StatisticsPage"),
  "/reports/income-statement": () => import("@/pages/IncomeStatementPage"),
  "/reports/trial-balance": () => import("@/pages/TrialBalancePage"),
  "/reports/expense-statement": () => import("@/pages/ExpenseStatementPage"),
  // Export & Backup
  "/export/products": () => import("@/pages/ExportPage"),
  "/export/transactions": () => import("@/pages/ExportPage"),
  "/export/crm": () => import("@/pages/ExportPage"),
  "/export/tax": () => import("@/pages/ExportPage"),
  "/backup/database": () => import("@/pages/BackupPage"),
  // Tools
  "/tools/notes": () => import("@/pages/SimpleCrudPage"),
  "/tools/documents": () => import("@/pages/SimpleCrudPage"),
  "/tools/todo": () => import("@/pages/TodoPage"),
  "/tools/goals": () => import("@/pages/GoalsPage"),
  // Settings & Plugins
  "/settings/company": () => import("@/pages/CompanySettingsPage"),
  "/settings/billing": () => import("@/pages/CompanySettingsPage"),
  "/settings/currency": () => import("@/pages/CompanySettingsPage"),
  "/settings/datetime": () => import("@/pages/CompanySettingsPage"),
  "/settings/theme": () => import("@/pages/CompanySettingsPage"),
  "/settings/smtp": () => import("@/pages/CompanySettingsPage"),
  "/settings/payment-gateways": () => import("@/pages/PaymentGatewaysPage"),
  "/settings/payment-currencies": () => import("@/pages/CurrencySettingsPage"),
  "/settings/currency-exchange": () => import("@/pages/CurrencySettingsPage"),
  "/settings/cloud-usage": () => import("@/pages/CloudUsagePage"),
  "/plugins/recaptcha": () => import("@/pages/RecaptchaSettingsPage"),
  "/plugins/twilio-sms": () => import("@/pages/TwilioSettingsPage"),
  "/templates/email": () => import("@/pages/TemplatesPage"),
  "/templates/sms": () => import("@/pages/TemplatesPage"),
  "/projects": () => import("@/pages/ProjectsPage"),
  "/projects/add": () => import("@/pages/ProjectsPage"),
  "/finance/currencies": () => import("@/pages/CurrenciesPage"),
  // Misc
  "/support": () => import("@/pages/SupportTicketsPage"),
  "/calendar": () => import("@/pages/CalendarPage"),
  "/about": () => import("@/pages/AboutPage"),
  "/audit/activity": () => import("@/pages/ActivityLogPage"),
  "/audit/deleted-items": () => import("@/pages/DeletedItemsPage"),
  "/notifications": () => import("@/pages/NotificationsPage"),
  "/activity-log": () => import("@/pages/NotificationsPage"),
};

/**
 * يبدأ تنزيل chunk الصفحة في الخلفية إن لم يُنزَّل من قبل.
 * آمن للاستدعاء المتكرر — يتم التنزيل مرة واحدة فقط لكل مسار.
 */
export function prefetchRoute(path: string): void {
  if (!path || prefetched.has(path)) return;
  // تطبيع المسارات الديناميكية: /invoices/edit/abc → /invoices/edit
  const normalized = normalizePath(path);
  const importer = map[path] || map[normalized];
  if (!importer) return;
  prefetched.add(path);
  // requestIdleCallback إن وُجد لتأجيل العمل عن thread الرئيسي
  const run = () => {
    importer().catch(() => {
      // فشل صامت — المستخدم سيحصل على spinner عادي عند النقر
      prefetched.delete(path);
    });
  };
  if (typeof (window as any).requestIdleCallback === "function") {
    (window as any).requestIdleCallback(run, { timeout: 1000 });
  } else {
    setTimeout(run, 0);
  }
}

function normalizePath(path: string): string {
  // إزالة أجزاء UUID/أرقام الديناميكية في النهاية
  // /invoices/edit/abc-123 → /invoices/edit
  // /quotes/view/xxx → /quotes/view
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 3) {
    const last = segments[segments.length - 1];
    const looksLikeId =
      /^[0-9a-f-]{8,}$/i.test(last) || /^\d+$/.test(last);
    if (looksLikeId) {
      return "/" + segments.slice(0, -1).join("/");
    }
  }
  return path;
}

/**
 * Props جاهزة للصق على عناصر <Link> أو <a> لتفعيل prefetch تلقائياً.
 * استخدام: <Link to={path} {...prefetchHandlers(path)}>
 */
export function prefetchHandlers(path: string) {
  return {
    onMouseEnter: () => prefetchRoute(path),
    onFocus: () => prefetchRoute(path),
    onTouchStart: () => prefetchRoute(path),
  };
}
