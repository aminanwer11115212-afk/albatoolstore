import { useState, useCallback, useEffect, lazy } from "react";
import { lazyEl } from "@/components/PageLoader";
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createIDBPersister } from "@/lib/queryPersister";
import { initOfflineFlush, setConflictHandler } from "@/lib/offlineQueue";
import { initAttachmentFlush } from "@/lib/attachmentQueue";
import { initSagaFlush } from "@/lib/documentSaga";
import { initStorageManager } from "@/lib/storageManager";
import { recordConflict } from "@/lib/conflictResolver";
import ConflictResolutionDialog from "@/components/ConflictResolutionDialog";
import OfflineBanner from "@/components/layout/OfflineBanner";
import { toast } from "sonner";
import { BrowserRouter, Route, Routes, useParams, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/layout/AppLayout";
import ProductsCacheSync from "./components/ProductsCacheSync";
import RealtimeSync from "./components/RealtimeSync";
import CriticalErrorDialog from "./components/CriticalErrorDialog";
import HiddenDevResetDialog from "./components/HiddenDevResetDialog";
import SplashScreen from "./components/SplashScreen";
import NavigationPerfTracker from "./components/NavigationPerfTracker";
import { ColumnResizeDebugHud } from "./components/ColumnResizeDebugHud";
import { ColumnsResetFloatingButton } from "./components/ColumnsResetFloatingButton";
import { initPerfMonitor } from "./lib/perfMonitor";
import { initPagePerf } from "./lib/pagePerf";
import { prefetchPopularPages } from "./lib/prefetchRoutes";
import { prefetchCoreData } from "./lib/prefetchCoreData";
// كل الصفحات lazy — حتى Dashboard (recharts ~221KB) و LoginPage
// لتقليل الباندل الأولي وتسريع First Paint.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
import {
  useProductCategories, useWarehouses, useCustomerGroups,
  useTransporters, usePackagingTypes, useDestinations,
  useTransactionCategories, useBillingTerms, useNotes, useDocuments
} from "./hooks/useData";
import { useUiPrefsCloudSync } from "./hooks/useUiPrefsCloudSync";
import { StaffGuard, PermGuard } from "./components/RoleGuard";
import SimpleCrudPage from "./pages/SimpleCrudPage";
import HomeButton from "./components/HomeButton";
import { ConfirmDeleteProvider } from "./components/common/ConfirmDeleteProvider";


// Lazy (يُحمَّل عند الزيارة فقط)
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const CustomerDebtReportPage = lazy(() => import("./pages/CustomerDebtReportPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const InvoiceCreatePage = lazy(() => import("./pages/InvoiceCreatePage"));

const MigratePosNumbersPage = lazy(() => import("./pages/MigratePosNumbersPage"));
const InvoiceViewPage = lazy(() => import("./pages/InvoiceViewPage"));
const InvoicePackagingPage = lazy(() => import("./pages/InvoicePackagingPage"));
const InvoiceTransportPage = lazy(() => import("./pages/InvoiceTransportPage"));
const TransportPackagingReportPage = lazy(() => import("./pages/TransportPackagingReportPage"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const SideQuotesPage = lazy(() => import("./pages/SideQuotesPage"));
const SideQuoteDetailPage = lazy(() => import("./pages/SideQuoteDetailPage"));
const QuoteCreatePage = lazy(() => import("./pages/QuoteCreatePage"));
const SideQuoteCreatePage = lazy(() => import("./pages/SideQuoteCreatePage"));
const QuoteViewPage = lazy(() => import("./pages/QuoteViewPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const FieldsPlaygroundPage = lazy(() => import("./pages/FieldsPlaygroundPage"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const BalanceSheetPage = lazy(() => import("./pages/BalanceSheetPage"));
const TransferPage = lazy(() => import("./pages/TransferPage"));
const AccountStatementPage = lazy(() => import("./pages/AccountStatementPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const PurchasePage = lazy(() => import("./pages/PurchasePage"));
const PurchaseCreatePage = lazy(() => import("./pages/PurchaseCreatePage"));
const StockReturnPage = lazy(() => import("./pages/StockReturnPage"));
const StockReturnCreatePage = lazy(() => import("./pages/StockReturnCreatePage"));
const StockReturnViewPage = lazy(() => import("./pages/StockReturnViewPage"));
const CompanySettingsPage = lazy(() => import("./pages/CompanySettingsPage"));
const ProductCompaniesPage = lazy(() => import("./pages/ProductCompaniesPage"));
const StockTransferPage = lazy(() => import("./pages/StockTransferPage"));
const StockTrackingPage = lazy(() => import("./pages/StockTrackingPage"));
const DailyInvoicesReportPage = lazy(() => import("./pages/DailyInvoicesReportPage"));
const IncomeReportPage = lazy(() => import("./pages/IncomeReportPage"));
const TaxReportPage = lazy(() => import("./pages/TaxReportPage"));
const StatisticsPage = lazy(() => import("./pages/StatisticsPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const PlaceholderPage = lazy(() => import("./pages/PlaceholderPage"));
const PaymentGatewaysPage = lazy(() => import("./pages/PaymentGatewaysPage"));
const CurrencySettingsPage = lazy(() => import("./pages/CurrencySettingsPage"));
const RecaptchaSettingsPage = lazy(() => import("./pages/RecaptchaSettingsPage"));
const TwilioSettingsPage = lazy(() => import("./pages/TwilioSettingsPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));
const ImportProductsPage = lazy(() => import("./pages/ImportProductsPage"));
const BackupPage = lazy(() => import("./pages/BackupPage"));
const TodoPage = lazy(() => import("./pages/TodoPage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const TodayInvoicesPage = lazy(() => import("./pages/TodayInvoicesPage"));
const CustomerStatementPage = lazy(() => import("./pages/CustomerStatementPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const SupplierStatementPage = lazy(() => import("./pages/SupplierStatementPage"));
const StatementPreviewPage = lazy(() => import("./pages/StatementPreviewPage"));
const DocumentPreviewPage = lazy(() => import("./pages/DocumentPreviewPage"));
const PackagingReportPreviewPage = lazy(() => import("./pages/PackagingReportPreviewPage"));
const FilteredTransactionsPage = lazy(() => import("./pages/FilteredTransactionsPage"));
const BankTransfersReportPage = lazy(() => import("./pages/BankTransfersReportPage"));
const SupportTicketsPage = lazy(() => import("./pages/SupportTicketsPage"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const QuotePackagingPage = lazy(() => import("./pages/QuotePackagingPage"));
const PackagingTypesPage = lazy(() => import("./pages/PackagingTypesPage"));
const PackagingTypeAddPage = lazy(() => import("./pages/PackagingTypeAddPage"));
const QuoteTransportPage = lazy(() => import("./pages/QuoteTransportPage"));
const CustomerLogisticsPage = lazy(() => import("./pages/CustomerLogisticsPage"));
const DispatchPage = lazy(() => import("./pages/DispatchPage"));
const ActivityLogPage = lazy(() => import("./pages/ActivityLogPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const DeletedItemsPage = lazy(() => import("./pages/DeletedItemsPage"));
const CurrenciesPage = lazy(() => import("./pages/CurrenciesPage"));
const IncomeStatementPage = lazy(() => import("./pages/IncomeStatementPage"));
const TrialBalancePage = lazy(() => import("./pages/TrialBalancePage"));
const DiscountAuditPage = lazy(() => import("./pages/DiscountAuditPage"));
const ExpenseStatementPage = lazy(() => import("./pages/ExpenseStatementPage"));
const FinancialReportPreviewPage = lazy(() => import("./pages/FinancialReportPreviewPage"));
const CloudUsagePage = lazy(() => import("./pages/CloudUsagePage"));
const PerformanceReportPage = lazy(() => import("./pages/PerformanceReportPage"));
const DataHealthPage = lazy(() => import("./pages/DataHealthPage"));
const FinanceHealthPage = lazy(() => import("./pages/FinanceHealthPage"));
const SystemStatusPage = lazy(() => import("./pages/SystemStatusPage"));
const DataMigrationPage = lazy(() => import("./pages/DataMigrationPage"));
const PublicCustomerStatementPage = lazy(() => import("./pages/PublicCustomerStatementPage"));
const PublicDocumentSharePage = lazy(() => import("./pages/PublicDocumentSharePage"));
const StaffLayout = lazy(() => import("./components/layout/StaffLayout"));
const StaffDashboard = lazy(() => import("./pages/staff/StaffDashboard"));
const StaffListPage = lazy(() => import("./pages/staff/StaffListPage"));
const StaffCustomersPage = lazy(() => import("./pages/staff/StaffCustomersPage"));
const StaffProfilePage = lazy(() => import("./pages/staff/StaffProfilePage"));
const StaffMyRecordsPage = lazy(() => import("./pages/staff/StaffMyRecordsPage"));
const OfflineQueuePage = lazy(() => import("./pages/OfflineQueuePage"));

const isAuthOrNetworkError = (err: any) => {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    err?.status === 401 ||
    err?.status === 403 ||
    msg.includes("jwt") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden")
  );
};

const queryClient = new QueryClient({
  // Global fallback: أي query/mutation فشلَت ولم تُعالَج محلياً يُظهر toast.
  // يكفي السبب رسالة الخطأ — لا نعرض stack للمستخدم.
  queryCache: new QueryCache({
    onError: (err, query) => {
      // تجاهل أخطاء أُعلِنت كـ "صامتة" عبر meta.silent
      if ((query?.meta as any)?.silent) return;
      // eslint-disable-next-line no-console
      console.error("[QueryCache.onError]", query?.queryKey, err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if ((mutation?.meta as any)?.silent) return;
      const msg = (err as any)?.message || "تعذّر تنفيذ العملية";
      toast.error(msg);
      // eslint-disable-next-line no-console
      console.error("[MutationCache.onError]", mutation?.options?.mutationKey, err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      // إعادة الجلب عند عودة الاتصال ضرورية لـ ERP بياناته حسّاسة للوقت.
      refetchOnReconnect: true,
      retry: (count, err) => {
        if (isAuthOrNetworkError(err)) return false;
        return count < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    },
    mutations: {
      retry: 0,
    },
  },
});

// Overrides لمفاتيح حسّاسة للوقت: staleTime قصير + إعادة جلب عند العودة للصفحة.
// يبقى refetchOnWindowFocus=false عالمياً لكن هذه القوائم تُحدَّث عند كل mount.
[
  ["invoices"],
  ["invoices-with-customers"],
  ["quotes"],
  ["quotes-with-customers"],
  ["transactions"],
  ["transactions-with-accounts"],
  ["recent-transactions"],
  ["recent-invoices"],
  ["today-invoices"],
  ["dashboard-stats"],
  ["accounts"],
  ["customers"],
  ["suppliers"],
  ["products"],
  ["products-with-details"],
  ["purchase-orders"],
  ["purchase-orders-full"],
  ["purchase-order-items"],
].forEach((key) => {
  queryClient.setQueryDefaults(key, {
    staleTime: 30_000,
    refetchOnMount: "always",
  });
});

// Wrappers تُجبر unmount نظيف عند تغيير :id (انتقال بين سجلات نفس النوع)
const QuoteEditWrapper = () => {
  const { id } = useParams();
  return <QuoteCreatePage key={id || "new"} />;
};
const InvoiceEditWrapper = () => {
  const { id } = useParams();
  return <InvoiceCreatePage key={id || "new"} />;
};
const PurchaseEditWrapper = () => {
  const { id } = useParams();
  return <PurchaseCreatePage key={id || "new"} />;
};
const StockReturnEditWrapper = () => {
  const { id } = useParams();
  return <StockReturnCreatePage key={id || "new"} />;
};

const CategoriesPage = () => <SimpleCrudPage title="فئات المنتجات" hook={useProductCategories} fields={[{ key: "name", label: "الاسم" }, { key: "description", label: "الوصف" }]} />;
const WarehousesPage = () => <SimpleCrudPage title="المستودعات" hook={useWarehouses} fields={[{ key: "name", label: "الاسم" }, { key: "location", label: "الموقع" }, { key: "description", label: "الوصف" }]} />;
const ClientGroupsPage = () => <SimpleCrudPage title="مجموعات العملاء" hook={useCustomerGroups} fields={[{ key: "name", label: "الاسم" }, { key: "description", label: "الوصف" }]} />;
const TransportersPage = lazy(() => import("./pages/TransportersPage"));

const DestinationsPage = () => <SimpleCrudPage title="إدارة الوجهات" hook={useDestinations} fields={[{ key: "name", label: "اسم الوجهة" }, { key: "description", label: "الوصف" }]} />;
const TransactionCategoriesPage = () => <SimpleCrudPage title="فئات المعاملات" hook={useTransactionCategories} fields={[{ key: "name", label: "الاسم" }, { key: "description", label: "الوصف" }]} />;
const BillingTermsPage = () => <SimpleCrudPage title="بنود الفاتورة" hook={useBillingTerms} fields={[{ key: "name", label: "الاسم" }, { key: "type", label: "النوع" }, { key: "description", label: "الوصف" }]} />;
const NotesPageComponent = () => <SimpleCrudPage title="ملاحظات" hook={useNotes} fields={[{ key: "title", label: "العنوان" }, { key: "content", label: "المحتوى" }]} nameKey="title" />;
const DocumentsPageComponent = () => <SimpleCrudPage title="مستندات" hook={useDocuments} fields={[{ key: "title", label: "العنوان" }, { key: "file_type", label: "النوع" }, { key: "description", label: "الوصف" }]} nameKey="title" />;

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashFinish = useCallback(() => setShowSplash(false), []);
  useUiPrefsCloudSync();
  useEffect(() => {
    initPerfMonitor();
    initPagePerf();
    // void + catch ضروري: prefetchPopularPages تُرجِع Promise، بدون catch
    // أي فشل شبكة يصبح unhandledrejection.
    try {
      prefetchPopularPages();
    } catch (e) {
      console.error("[prefetch] failed:", e);
    }
    void prefetchCoreData(queryClient);

    // إعادة تحميل البيانات الأساسية دورياً كل 5 دقائق (فقط عند وجود اتصال)
    // لإبقاء نسخة الأوفلاين محدَّثة بدون انتظار زيارة المستخدم للصفحات.
    const intervalId = setInterval(() => {
      if (navigator.onLine) {
        void prefetchCoreData(queryClient);
      }
    }, 5 * 60_000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setConflictHandler(async (item, remote) => { await recordConflict(item, remote); });
    initOfflineFlush((r) => {
      if (r.ok > 0) {
        queryClient.invalidateQueries();
        toast.success(`تمت مزامنة ${r.ok} عملية`);
      }
      if (r.conflicts > 0) {
        toast.warning(`${r.conflicts} تعارض يحتاج قرارك — راجع سجل المزامنة`);
      }
    });
    initAttachmentFlush();
    initSagaFlush();
    initStorageManager(queryClient);
    const onStorageWarn = (e: any) => {
      const ratio = e.detail?.ratio;
      if (ratio && ratio >= 0.9) {
        toast.warning("تخزين المتصفح شارف على الامتلاء — يُنصح بالتنظيف من سجل المزامنة");
      }
    };
    window.addEventListener("albatool:storage-warn", onStorageWarn);
    return () => window.removeEventListener("albatool:storage-warn", onStorageWarn);
  }, []);

  return (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: createIDBPersister(),
      maxAge: 1000 * 60 * 60 * 24 * 7, // أسبوع
      buster: "v1",
      dehydrateOptions: {
        // لا نحفظ الاستعلامات الفاشلة أو التي لم تُجلَب بعد
        shouldDehydrateQuery: (q) => q.state.status === "success",
      },
    }}
  >
    <ProductsCacheSync />
    <RealtimeSync />
    <TooltipProvider>
      <OfflineBanner />
      <ConflictResolutionDialog />
      <Toaster />
      <Sonner />
      <CriticalErrorDialog />
      <HiddenDevResetDialog />
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
      <BrowserRouter>
        <NavigationPerfTracker />
        <ColumnResizeDebugHud />
        <ColumnsResetFloatingButton />
        <HomeButton />
        <StaffGuard>
        <ConfirmDeleteProvider>
        <AppLayout>

          <Routes>
            <Route path="/login" element={lazyEl(<LoginPage />, "تسجيل الدخول")} />
            {/* /signup معطّل — الحسابات تُنشأ من المسؤول فقط */}
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="/share/customer/t/:token" element={lazyEl(<PublicCustomerStatementPage />, "كشف الحساب")} />
            <Route path="/share/document/:token" element={lazyEl(<PublicDocumentSharePage />, "معاينة المستند")} />
            {/* Staff Portal */}
            <Route path="/staff" element={lazyEl(<StaffLayout><StaffDashboard /></StaffLayout>, "بوابة الموظفين")} />
            <Route path="/staff/my-records" element={lazyEl(<StaffLayout><PermGuard anyOf={["create_quote", "create_invoice"]}><StaffMyRecordsPage /></PermGuard></StaffLayout>, "سجلاتي")} />
            <Route path="/staff/quotes" element={lazyEl(<StaffLayout><PermGuard permission="create_quote"><StaffListPage table="quotes" title="عروض أسعاري" newPath="/staff/quotes/new" numberKey="quote_number" createPermission="create_quote" /></PermGuard></StaffLayout>, "عروض أسعاري")} />
            <Route path="/staff/quotes/new" element={lazyEl(<StaffLayout><PermGuard permission="create_quote"><QuoteCreatePage /></PermGuard></StaffLayout>, "عرض سعر جديد")} />
            <Route path="/staff/invoices" element={lazyEl(<StaffLayout><PermGuard permission="create_invoice"><StaffListPage table="invoices" title="فواتيري" newPath="/staff/invoices/new" numberKey="invoice_number" createPermission="create_invoice" /></PermGuard></StaffLayout>, "فواتيري")} />
            <Route path="/staff/invoices/new" element={lazyEl(<StaffLayout><PermGuard permission="create_invoice"><InvoiceCreatePage /></PermGuard></StaffLayout>, "فاتورة جديدة")} />
            <Route path="/staff/customers" element={lazyEl(<StaffLayout><PermGuard anyOf={["view_customers", "add_customer"]}><StaffCustomersPage /></PermGuard></StaffLayout>, "العملاء")} />
            <Route path="/staff/profile" element={lazyEl(<StaffLayout><StaffProfilePage /></StaffLayout>, "الملف الشخصي")} />
            <Route path="/" element={lazyEl(<Dashboard />, "الرئيسية")} />
            <Route path="/offline-queue" element={lazyEl(<OfflineQueuePage />, "سجل المزامنة")} />
            {/* Sales */}
            <Route path="/invoices" element={lazyEl(<InvoicesPage />, "إدارة الفواتير")} />
            <Route path="/invoices/create" element={lazyEl(<InvoiceCreatePage />, "فاتورة جديدة")} />
            <Route path="/invoices/view/:id" element={lazyEl(<InvoiceViewPage />, "عرض الفاتورة")} />
            <Route path="/invoices/edit/:id" element={lazyEl(<InvoiceEditWrapper />, "تعديل الفاتورة")} />
            <Route path="/invoices/cash" element={lazyEl(<InvoiceCreatePage pos />, "مبيعات كاش (نقطة بيع)")} />
            <Route path="/invoices/cash/new" element={lazyEl(<InvoiceCreatePage pos />, "فاتورة كاش جديدة")} />
            <Route path="/invoices/cash/edit/:id" element={lazyEl(<InvoiceCreatePage pos />, "تعديل فاتورة كاش")} />
            <Route path="/invoices/cash/list" element={lazyEl(<InvoicesPage posOnly />, "إدارة فواتير الكاش")} />
            <Route path="/invoices/cash/migrate-numbers" element={lazyEl(<MigratePosNumbersPage />, "ترحيل ترقيم فواتير الكاش")} />
            <Route path="/invoices/:id/packaging" element={lazyEl(<InvoicePackagingPage />, "تغليف الفاتورة")} />
            <Route path="/invoices/:id/transport" element={lazyEl(<InvoiceTransportPage />, "ترحيل الفاتورة")} />
            <Route path="/invoices/:id/transport-report" element={lazyEl(<TransportPackagingReportPage docType="invoice" mode="transport" />, "تقرير الترحيل")} />
            <Route path="/invoices/:id/packaging-report" element={lazyEl(<TransportPackagingReportPage docType="invoice" mode="packaging" />, "تقرير التغليف")} />
            <Route path="/quotes" element={lazyEl(<QuotesPage />, "إدارة عروض الأسعار")} />
            <Route path="/quotes/side" element={lazyEl(<SideQuotesPage />, "عروض الأسعار الجانبية")} />
            <Route path="/quotes/side/new" element={lazyEl(<SideQuoteCreatePage />, "عرض سعر جانبي جديد")} />
            <Route path="/quotes/side/edit/:id" element={lazyEl(<SideQuoteCreatePage />, "تعديل عرض جانبي")} />
            <Route path="/quotes/side/:id" element={lazyEl(<SideQuoteDetailPage />, "تفاصيل عرض جانبي")} />
            <Route path="/quotes/create" element={lazyEl(<QuoteCreatePage />, "عرض سعر جديد")} />
            <Route path="/quotes/view/:id" element={lazyEl(<QuoteViewPage />, "عرض السعر")} />
            <Route path="/quotes/edit/:id" element={lazyEl(<QuoteEditWrapper />, "تعديل عرض السعر")} />
            <Route path="/preview/quote/:id" element={lazyEl(<DocumentPreviewPage docType="quote" />, "معاينة عرض السعر")} />
            <Route path="/preview/invoice/:id" element={lazyEl(<DocumentPreviewPage docType="invoice" />, "معاينة الفاتورة")} />
            <Route path="/preview/purchase/:id" element={lazyEl(<DocumentPreviewPage docType="purchase" />, "معاينة أمر الشراء")} />
            <Route path="/preview/return/:id" element={lazyEl(<DocumentPreviewPage docType="return" />, "معاينة المرتجع")} />
            <Route path="/preview/invoice/:id/packaging" element={lazyEl(<PackagingReportPreviewPage docType="invoice" />, "معاينة تقرير تغليف الفاتورة")} />
            <Route path="/preview/quote/:id/packaging" element={lazyEl(<PackagingReportPreviewPage docType="quote" />, "معاينة تقرير تغليف عرض السعر")} />
            <Route path="/quotes/:id/packaging" element={lazyEl(<QuotePackagingPage />, "تغليف عرض السعر")} />
            <Route path="/quotes/:id/transport" element={lazyEl(<QuoteTransportPage />, "ترحيل عرض السعر")} />
            <Route path="/quotes/:id/transport-report" element={lazyEl(<TransportPackagingReportPage docType="quote" mode="transport" />, "تقرير الترحيل")} />
            <Route path="/quotes/:id/packaging-report" element={lazyEl(<TransportPackagingReportPage docType="quote" mode="packaging" />, "تقرير التغليف")} />
            <Route path="/quotes/*" element={lazyEl(<QuotesPage />, "عروض الأسعار")} />
            <Route path="/customers/:id/logistics" element={lazyEl(<CustomerLogisticsPage />, "لوجستيات العميل")} />
            <Route path="/customers/logistics" element={lazyEl(<CustomerLogisticsPage />, "لوجستيات العملاء")} />
            <Route path="/dispatch" element={lazyEl(<DispatchPage />, "الترحيلات")} />
            {/* Inventory */}
            <Route path="/products" element={lazyEl(<ProductsPage />, "المنتجات")} />
            <Route path="/products/add" element={lazyEl(<ProductsPage />, "إضافة منتج")} />
            <Route path="/products/report" element={lazyEl(<ProductsPage />, "تقرير المنتجات")} />
            <Route path="/products/out-of-stock" element={lazyEl(<ProductsPage />, "المنتجات المنتهية")} />
            <Route path="/products/in-stock" element={lazyEl(<ProductsPage />, "المنتجات المتوفرة")} />
            <Route path="/products/price-report" element={lazyEl(<ProductsPage />, "تقرير الأسعار")} />
            <Route path="/dev/fields-playground" element={lazyEl(<FieldsPlaygroundPage />, "اختبار الحقول")} />
            <Route path="/categories" element={lazyEl(<CategoriesPage />, "فئات المنتجات")} />
            <Route path="/companies" element={lazyEl(<ProductCompaniesPage />, "ماركات المنتجات")} />
            <Route path="/warehouses" element={lazyEl(<WarehousesPage />, "المستودعات")} />
            <Route path="/stock-transfer" element={lazyEl(<StockTransferPage />, "تحويل مخزون")} />
            <Route path="/stock-tracking" element={lazyEl(<StockTrackingPage />, "تتبع المخزون")} />
            <Route path="/purchase" element={lazyEl(<PurchasePage />, "أوامر الشراء")} />
            <Route path="/purchase/create" element={lazyEl(<PurchaseCreatePage />, "أمر شراء جديد")} />
            <Route path="/purchase/edit/:id" element={lazyEl(<PurchaseEditWrapper />, "تعديل أمر الشراء")} />
            <Route path="/stock-return" element={lazyEl(<StockReturnPage />, "المرتجعات")} />
            <Route path="/stock-return/create" element={lazyEl(<StockReturnCreatePage />, "مرتجع جديد")} />
            <Route path="/stock-return/edit/:id" element={lazyEl(<StockReturnEditWrapper />, "تعديل المرتجع")} />
            <Route path="/stock-return/view/:id" element={lazyEl(<StockReturnViewPage />, "عرض المرتجع")} />
            {/* CRM */}
            <Route path="/customers" element={lazyEl(<CustomersPage />, "العملاء")} />
            <Route path="/customers/create" element={lazyEl(<CustomersPage />, "إضافة عميل")} />
            <Route path="/customers/debt-report" element={lazyEl(<CustomerDebtReportPage />, "تقرير ديون العملاء")} />
            <Route path="/client-groups" element={lazyEl(<ClientGroupsPage />, "مجموعات العملاء")} />
            <Route path="/suppliers" element={lazyEl(<SuppliersPage />, "الموردين")} />
            <Route path="/suppliers/create" element={lazyEl(<SuppliersPage />, "إضافة مورد")} />
            <Route path="/transporters" element={lazyEl(<TransportersPage />, "الناقلين")} />
            <Route path="/transporters/add" element={lazyEl(<TransportersPage />, "إضافة ناقل")} />
            <Route path="/packaging" element={lazyEl(<PackagingTypesPage />, "أنواع التغليف")} />
            <Route path="/packaging/add" element={lazyEl(<PackagingTypeAddPage />, "نوع تغليف جديد")} />
            {/* Accounting */}
            <Route path="/accounts" element={lazyEl(<AccountsPage />, "الحسابات")} />
            <Route path="/accounts/add" element={lazyEl(<AccountsPage />, "إضافة حساب")} />
            <Route path="/accounts/balance-sheet" element={lazyEl(<BalanceSheetPage />, "الميزانية العمومية")} />
            <Route path="/transactions" element={lazyEl(<TransactionsPage />, "المعاملات")} />
            <Route path="/transactions/add" element={lazyEl(<TransactionsPage />, "إضافة معاملة")} />
            <Route path="/transactions/transfer" element={lazyEl(<TransferPage />, "تحويل بين الحسابات")} />
            {/* Reports */}
            <Route path="/reports/account-statement" element={lazyEl(<AccountStatementPage />, "كشف الحساب")} />
            <Route path="/reports/income" element={lazyEl(<IncomeReportPage />, "تقرير الإيرادات")} />
            <Route path="/reports/expenses" element={lazyEl(<IncomeReportPage />, "تقرير المصروفات")} />
            <Route path="/reports/tax" element={lazyEl(<TaxReportPage />, "تقرير الضرائب")} />
            <Route path="/reports/daily-invoices" element={lazyEl(<DailyInvoicesReportPage />, "تقرير الفواتير اليومية")} />
            <Route path="/reports/statistics" element={lazyEl(<StatisticsPage />, "الإحصائيات")} />
            {/* Export & Import */}
            <Route path="/export/products" element={lazyEl(<ExportPage />, "تصدير المنتجات")} />
            <Route path="/export/transactions" element={lazyEl(<ExportPage />, "تصدير المعاملات")} />
            <Route path="/export/crm" element={lazyEl(<ExportPage />, "تصدير CRM")} />
            <Route path="/export/tax" element={lazyEl(<ExportPage />, "تصدير الضرائب")} />
            <Route path="/import/products" element={lazyEl(<ImportProductsPage />, "استيراد المنتجات")} />
            <Route path="/backup/database" element={lazyEl(<BackupPage />, "النسخ الاحتياطي")} />
            {/* Employees */}
            <Route path="/employees" element={lazyEl(<EmployeesPage />, "الموظفين")} />
            <Route path="/employees/add" element={lazyEl(<EmployeesPage />, "إضافة موظف")} />
            {/* Destinations */}
            <Route path="/destinations" element={lazyEl(<DestinationsPage />, "الوجهات")} />
            <Route path="/destinations/add" element={lazyEl(<DestinationsPage />, "إضافة وجهة")} />
            {/* Tools */}
            <Route path="/tools/notes" element={lazyEl(<NotesPageComponent />, "الملاحظات")} />
            <Route path="/tools/documents" element={lazyEl(<DocumentsPageComponent />, "المستندات")} />
            <Route path="/tools/todo" element={lazyEl(<TodoPage />, "المهام")} />
            <Route path="/tools/goals" element={lazyEl(<GoalsPage />, "الأهداف")} />
            {/* Reports - additional */}
            <Route path="/reports/today-invoices" element={lazyEl(<TodayInvoicesPage />, "فواتير اليوم")} />
            <Route path="/reports/customer-statement" element={lazyEl(<CustomerStatementPage />, "كشف حساب العميل")} />
            <Route path="/customers/:id/statement" element={lazyEl(<CustomerStatementPage />, "كشف حساب العميل")} />
            <Route path="/reports/supplier-statement" element={lazyEl(<SupplierStatementPage />, "كشف حساب المورد")} />
            <Route path="/reports/statement-preview" element={lazyEl(<StatementPreviewPage />, "معاينة كشف الحساب")} />
            <Route path="/reports/bank-transfers" element={lazyEl(<BankTransfersReportPage />, "تقرير التحويلات البنكية")} />
            {/* Transactions - filtered */}
            <Route path="/transactions/income" element={lazyEl(<FilteredTransactionsPage type="income" />, "الإيرادات")} />
            <Route path="/transactions/expenses" element={lazyEl(<FilteredTransactionsPage type="expense" />, "المصروفات")} />
            {/* Payment settings */}
            <Route path="/settings/payment-gateways" element={lazyEl(<PaymentGatewaysPage />, "بوابات الدفع")} />
            <Route path="/settings/payment-currencies" element={lazyEl(<CurrencySettingsPage />, "عملات الدفع")} />
            <Route path="/settings/currency-exchange" element={lazyEl(<CurrencySettingsPage />, "أسعار الصرف")} />
            <Route path="/settings/bank-accounts" element={lazyEl(<PlaceholderPage title="حسابات بنكية" />, "حسابات بنكية")} />
            <Route path="/settings/transaction-categories" element={lazyEl(<TransactionCategoriesPage />, "فئات المعاملات")} />
            <Route path="/settings/billing-terms" element={lazyEl(<BillingTermsPage />, "بنود الفاتورة")} />
            {/* Plugins */}
            <Route path="/plugins/recaptcha" element={lazyEl(<RecaptchaSettingsPage />, "إعدادات reCAPTCHA")} />
            <Route path="/plugins/url-shortener" element={lazyEl(<PlaceholderPage title="URL Shortener" />, "URL Shortener")} />
            <Route path="/plugins/twilio-sms" element={lazyEl(<TwilioSettingsPage />, "إعدادات Twilio SMS")} />
            {/* Templates */}
            <Route path="/templates/email" element={lazyEl(<TemplatesPage type="email" />, "قوالب البريد")} />
            <Route path="/templates/sms" element={lazyEl(<TemplatesPage type="sms" />, "قوالب SMS")} />
            {/* Projects */}
            <Route path="/projects" element={lazyEl(<ProjectsPage />, "المشاريع")} />
            <Route path="/projects/add" element={lazyEl(<ProjectsPage />, "إضافة مشروع")} />
            {/* Settings */}
            <Route path="/settings/company" element={lazyEl(<CompanySettingsPage />, "إعدادات الشركة")} />
            <Route path="/settings/billing" element={lazyEl(<CompanySettingsPage />, "إعدادات الفوترة")} />
            <Route path="/settings/currency" element={lazyEl(<CompanySettingsPage />, "إعدادات العملة")} />
            <Route path="/settings/datetime" element={lazyEl(<CompanySettingsPage />, "التاريخ والوقت")} />
            <Route path="/settings/theme" element={lazyEl(<CompanySettingsPage />, "إعدادات المظهر")} />
            <Route path="/settings/smtp" element={lazyEl(<CompanySettingsPage />, "إعدادات SMTP")} />
            <Route path="/settings/columns" element={lazyEl(<CompanySettingsPage />, "أعمدة الجداول")} />
            <Route path="/settings/danger" element={lazyEl(<CompanySettingsPage />, "منطقة الخطر")} />
            {/* Support, Calendar, About */}
            <Route path="/support" element={lazyEl(<SupportTicketsPage />, "الدعم الفني")} />
            <Route path="/calendar" element={lazyEl(<CalendarPage />, "التقويم")} />
            <Route path="/about" element={lazyEl(<AboutPage />, "حول النظام")} />
            {/* Audit & Activity */}
            <Route path="/audit/activity" element={lazyEl(<ActivityLogPage />, "سجل النشاط")} />
            <Route path="/notifications" element={lazyEl(<NotificationsPage />, "الإشعارات")} />
            <Route path="/activity-log" element={lazyEl(<NotificationsPage />, "سجل النشاط")} />
            <Route path="/audit/deleted-items" element={lazyEl(<DeletedItemsPage />, "العناصر المحذوفة")} />
            {/* Multi-Currency & Financial Reports */}
            <Route path="/finance/currencies" element={lazyEl(<CurrenciesPage />, "العملات")} />
            <Route path="/reports/income-statement" element={lazyEl(<IncomeStatementPage />, "قائمة الدخل")} />
            <Route path="/reports/trial-balance" element={lazyEl(<TrialBalancePage />, "ميزان المراجعة")} />
            <Route path="/reports/discount-audit" element={lazyEl(<DiscountAuditPage />, "سجل تدقيق الخصومات")} />
            <Route path="/reports/expense-statement" element={lazyEl(<ExpenseStatementPage />, "كشف المصروفات")} />
            <Route path="/reports/financial-preview" element={lazyEl(<FinancialReportPreviewPage />, "معاينة التقرير المالي")} />
            <Route path="/settings/cloud-usage" element={lazyEl(<CloudUsagePage />, "استهلاك Cloud")} />
            <Route path="/data-health" element={lazyEl(<DataHealthPage />, "فحص صحة البيانات")} />
            <Route path="/admin/finance-health" element={lazyEl(<FinanceHealthPage />, "صحة الحسابات المالية")} />
            <Route path="/system-status" element={lazyEl(<SystemStatusPage />, "حالة النظام")} />
            <Route path="/migration" element={lazyEl(<DataMigrationPage />, "ترحيل البيانات")} />
            <Route path="/settings/performance" element={lazyEl(<PerformanceReportPage />, "تقرير الأداء")} />
            <Route path="*" element={lazyEl(<NotFound />, "غير موجود")} />
          </Routes>
        </AppLayout>
        </ConfirmDeleteProvider>
        </StaffGuard>
      </BrowserRouter>

    </TooltipProvider>
  </PersistQueryClientProvider>
);
};

export default App;
