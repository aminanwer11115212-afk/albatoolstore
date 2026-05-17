import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        "src/hooks/useUnsavedChangesGuard.tsx",
        "src/pages/InvoiceCreatePage.tsx",
        "src/pages/QuoteCreatePage.tsx",
        "src/pages/InvoicePackagingPage.tsx",
        "src/pages/QuotePackagingPage.tsx",
        "src/components/packaging/PackagingItemsManager.tsx",
      ],
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
