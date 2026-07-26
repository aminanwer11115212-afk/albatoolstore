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
        // صيغة الدالة (لا الكائن) عمداً: الصيغة الكائنية تسحب اعتماديات الحزمة
        // المشتركة إلى نفس الـ chunk، ما جعل مدخل التطبيق يستورد vendor-charts
        // (422KB) بالكامل من أجل دالة مساعدة واحدة مشتركة — فتُحمَّل الرسوم
        // البيانية في المسار الحرج رغم أن كل صفحاتها lazy. الدالة تُثبّت ملفات
        // الحزمة نفسها فقط وتترك المشترك للتقسيم الافتراضي.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // clsx تستخدمها cn() في كل التطبيق وrecharts معاً — بدون تثبيتها في
          // chunk خاص صغير كان Rollup يضعها داخل vendor-charts فيستوردها مدخل
          // التطبيق ويجرّ 422KB في المسار الحرج. يجب أن تسبق قاعدة recharts.
          if (id.includes("node_modules/clsx") || id.includes("node_modules/tailwind-merge") || id.includes("node_modules/class-variance-authority") || id.includes("node_modules/react-is/") || id.includes("node_modules/prop-types/")) return "vendor-ui-utils";
          // recharts بلا تثبيت متعمَّد: تثبيته كان يمتص اعتمادياته المشتركة
          // (lodash/clsx/react-is…) داخل chunk واحد يضطر مدخل التطبيق لاستيراده.
          // التقسيم الافتراضي يضعه في chunk مشترك بين صفحات الرسوم الثلاث فقط.
          // html2pdf/html2canvas بلا تثبيت أيضاً — نفس مرض الامتصاص: التثبيت جعل
          // المدخل يستوردهما مبكراً (960KB). كل استدعاءاتهما dynamic فيقسمهما
          // Rollup تلقائياً إلى chunk كسول عند الطلب.
          if (id.includes("node_modules/react-router")) return "vendor-react";
          if (id.includes("node_modules/react-dom/") || id.includes("node_modules/react/")) return "vendor-react";
          if (id.includes("node_modules/@tanstack/react-query")) return "vendor-query";
          if (id.includes("node_modules/@supabase/")) return "vendor-supabase";
          if (id.includes("node_modules/react-hook-form") || id.includes("node_modules/@hookform/") || id.includes("node_modules/zod")) return "vendor-forms";
          if (id.includes("node_modules/date-fns") || id.includes("node_modules/react-day-picker")) return "vendor-dates";
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";
          return undefined;
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
