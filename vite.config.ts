import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Plugin: يضيف Cache-Control مناسب لكل نوع ملف عند تشغيل `vite preview`
 * أو أي خادم static يعتمد على middleware Vite.
 *
 * - `/assets/*`  → cache دائم immutable (آمن لأن أسماء الملفات تحوي hash).
 * - `index.html` ومسارات SPA → no-cache (لكن مع revalidation فالطلب يبقى سريعاً).
 * - الباقي (favicon، صور public/) → cache متوسط لمدة ساعة.
 */
function cacheHeadersPlugin(): Plugin {
  const setHeaders = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }) => {
    const url = req.url || "";

    // أصول مع hash → cache طويل المدى (سنة كاملة) + immutable
    if (url.startsWith("/assets/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return;
    }

    // index.html أو أي مسار SPA (لا يحوي امتداد ملف)
    const looksLikeFile = /\.[a-zA-Z0-9]+(\?|$)/.test(url);
    if (!looksLikeFile || url === "/" || url.endsWith("/index.html")) {
      // no-cache = المتصفح يعيد التحقق من الخادم في كل طلب لكن يستخدم
      // النسخة المخزّنة إن لم تتغيّر (ETag/304) → سريع + يضمن وصول التحديثات.
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      return;
    }

    // ملفات public/ أخرى (favicon, صور, fonts بدون hash)
    res.setHeader("Cache-Control", "public, max-age=3600");
  };

  return {
    name: "lovable-cache-headers",
    apply: "serve",
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        setHeaders(req, res);
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // dev only: نمنع cache المتصفح حتى تنعكس تعديلاتك فوراً.
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
    },
  },
  preview: {
    // الإنتاج: الـ headers الفعلية تُطبَّق عبر cacheHeadersPlugin أدناه
    // (لا نضع headers ثابتة هنا لأنها كانت ستُطبَّق على كل طلب بنفس القيمة).
  },
  build: {
    rollupOptions: {
      output: {
        // hash في اسم الملف يضمن invalidation تلقائي للـ CSS/JS/assets في الإنتاج
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        // تجميع المكتبات الكبيرة في chunks منفصلة قابلة للـ cache طويل المدى.
        // كل مجموعة تتغيّر نادراً وبشكل مستقل عن كود التطبيق.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts": ["recharts"],
          "vendor-pdf": ["html2pdf.js", "html2canvas"],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-dates": ["date-fns", "react-day-picker"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    cacheHeadersPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
