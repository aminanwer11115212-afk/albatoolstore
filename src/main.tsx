import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { attachSelectBackspaceClose } from "./utils/selectKeyNav";
import { attachSpaceColumnNav } from "./utils/spaceColumnNav";
import { ErrorBoundary } from "./components/ErrorBoundary";

attachSelectBackspaceClose();
attachSpaceColumnNav();

// Global listeners لرصد كل promise rejection أو خطأ غير معالَج.
// مهم في الإنتاج لأن أخطاء async fire-and-forget لا تظهر بدون هذا.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    // eslint-disable-next-line no-console
    console.error("[unhandledrejection]", e.reason);
  });
  window.addEventListener("error", (e) => {
    // eslint-disable-next-line no-console
    console.error("[window.error]", e.error ?? e.message);
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found in document");
}

// رابط العميل: مسار مستقل تماماً — يُركَّب بدون App ولا Providers
// (لا Sidebar، لا React Query، لا Router، لا PWA install prompt).
// فقط: صفحة واحدة فيها معاينة المستند + زر طباعة + زر تحميل PDF.
const shareMatch = window.location.pathname.match(/^\/share\/document\/([^/?#]+)/);
if (shareMatch) {
  import("./pages/StandaloneShareDocument").then(({ default: Standalone }) => {
    createRoot(rootEl).render(<Standalone token={decodeURIComponent(shareMatch[1])} />);
  });
} else {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
