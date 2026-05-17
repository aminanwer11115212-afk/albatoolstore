/**
 * Prefetch ذكي للصفحات الأكثر استخداماً.
 *
 * يعمل بعد أول رسم وأثناء فترة خمول المتصفح (requestIdleCallback) فقط،
 * فلا يزاحم الـ critical path. الهدف: عند نقر المستخدم على /invoices
 * أو /quotes أو /customers يكون الـ chunk جاهزاً في الذاكرة فلا يرى
 * أي تأخير.
 *
 * كل import() يطابق نفس مسار الـ lazy() في App.tsx → Vite يعيد استخدام
 * نفس الـ chunk بدل تنزيله مرتين.
 */
export function prefetchPopularPages() {
  if (typeof window === "undefined") return;

  const ric: typeof window.requestIdleCallback =
    (window as Window & { requestIdleCallback?: typeof window.requestIdleCallback })
      .requestIdleCallback ??
    ((cb: IdleRequestCallback) =>
      window.setTimeout(
        () => cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline),
        1500
      ) as unknown as number);

  ric(
    () => {
      // الصفحات الأكثر زيارة في نظام المبيعات/المحاسبة
      void import("../pages/InvoicesPage");
      void import("../pages/QuotesPage");
      void import("../pages/CustomersPage");
      void import("../pages/InvoiceCreatePage");
      void import("../pages/QuoteCreatePage");
      void import("../pages/ProductsPage");
    },
    { timeout: 3000 }
  );
}
