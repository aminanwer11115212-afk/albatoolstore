import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { attachSelectBackspaceClose } from "./utils/selectKeyNav";
import { ErrorBoundary } from "./components/ErrorBoundary";

attachSelectBackspaceClose();

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

createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
