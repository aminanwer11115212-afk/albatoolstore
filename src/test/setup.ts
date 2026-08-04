import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * jsdom لا يعرّف `ResizeObserver` ولا `IntersectionObserver`، والتطبيق
 * يستعملهما (مزامنة ارتفاع الأشرطة، والتحميل عند الظهور). فبدونهما تسقط
 * شاشاتٌ سليمة في الاختبار وحده — عطلٌ في البيئة لا في الكود.
 */
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
if (!(globalThis as any).ResizeObserver) (globalThis as any).ResizeObserver = NoopObserver;
if (!(globalThis as any).IntersectionObserver) (globalThis as any).IntersectionObserver = NoopObserver;

// `scrollIntoView` غير مُنفَّذ في jsdom — تستعمله قوائم الاقتراحات.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
