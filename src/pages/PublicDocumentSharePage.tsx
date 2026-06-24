import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Download, AlertTriangle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// عدّاد محاولات الدخول لنفس صفحة المعاينة (ضمن نفس جلسة المتصفح).
// يحمي من حلقة محتملة إذا أعاد الخادم توجيه الصفحة إلى نفسها.
const VISIT_KEY_PREFIX = "share-doc-visits:";
const MAX_VISITS = 3;

function trackVisit(token: string): number {
  try {
    const key = VISIT_KEY_PREFIX + token;
    const prev = parseInt(sessionStorage.getItem(key) || "0", 10) || 0;
    const next = prev + 1;
    sessionStorage.setItem(key, String(next));
    return next;
  } catch {
    return 1;
  }
}

function genTraceId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export default function PublicDocumentSharePage() {
  const { token } = useParams<{ token: string }>();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [traceId, setTraceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const localTrace = genTraceId();
    setTraceId(localTrace);

    if (!token) {
      setError("رابط غير صالح: لا يوجد معرّف مستند.");
      setLoading(false);
      return;
    }

    // كشف حلقة تحويل: لو وصلنا إلى نفس الصفحة أكثر من MAX_VISITS مرة
    // خلال نفس الجلسة، أوقف ولا تحاول التحميل ثانية.
    const visits = trackVisit(token);
    if (visits > MAX_VISITS) {
      console.error(`[share][${localTrace}] redirect loop detected — visits=${visits}`);
      setError(
        `تم اكتشاف حلقة تحويل (${visits} محاولات). أعد فتح الرابط من المصدر الأصلي أو اطلب رابطاً جديداً.`,
      );
      setLoading(false);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const fnUrl = `${supabaseUrl}/functions/v1/document-share?token=${encodeURIComponent(token)}`;
    console.log(`[share][${localTrace}] fetching document HTML (visit ${visits})`);

    fetch(fnUrl, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      redirect: "manual", // لا نتبع التحويل تلقائياً حتى نكشف الحلقات
    })
      .then(async (response) => {
        // لقطة الرؤوس للتشخيص
        const headerSnapshot: Record<string, string> = {};
        response.headers.forEach((v, k) => { headerSnapshot[k] = v; });
        const serverTrace = response.headers.get("x-share-trace-id") || "";
        const redirectKind = response.headers.get("x-share-redirect") || "";
        const contentType = (response.headers.get("content-type") || "").toLowerCase();

        console.log(`[share][${localTrace}] response`, {
          status: response.status,
          type: response.type,
          server_trace: serverTrace,
          redirect_kind: redirectKind,
          content_type: contentType,
        });

        // كشف تحويل غير متوقع من الـ edge function
        if (
          response.type === "opaqueredirect" ||
          (response.status >= 300 && response.status < 400)
        ) {
          console.error(`[share][${localTrace}] unexpected redirect — headers:`, headerSnapshot);
          toast.error("تحويل غير متوقع من الخادم");
          throw new Error(
            "استلمنا تحويلاً غير متوقع من الخادم بدلاً من محتوى المستند. تحقق من صلاحية الرابط.",
          );
        }
        const text = await response.text();
        if (!response.ok) {
          console.error(`[share][${localTrace}] HTTP ${response.status} — headers:`, headerSnapshot, "body:", text.slice(0, 500));
          throw new Error(
            text?.replace(/<[^>]+>/g, " ").trim() || `تعذّر فتح المستند (HTTP ${response.status})`,
          );
        }

        // تنبيه عند Content-Type غير متوقع
        // نقبل text/html (المتوقع) و text/plain (تعيد بوابة Supabase أحياناً كتابته)
        const isExpectedType = contentType.includes("text/html") || contentType.includes("text/plain");
        if (!isExpectedType) {
          console.error(
            `[share][${localTrace}] unexpected content-type: "${contentType}" — headers:`,
            headerSnapshot,
            "body preview:",
            text.slice(0, 200),
          );
          toast.warning(`تنبيه: نوع محتوى غير متوقع (${contentType || "غير معروف"})`, {
            description: "قد لا يُعرض المستند بشكل صحيح. تم تسجيل التفاصيل في console.",
          });
        }

        // كشف إن كان الرد صفحة تحويل HTML تشير إلى نفس مسارنا (حلقة)
        if (
          /<meta[^>]+http-equiv=["']?refresh/i.test(text) &&
          text.includes(`/share/document/${token}`)
        ) {
          console.error(`[share][${localTrace}] meta-refresh loop in body — headers:`, headerSnapshot);
          throw new Error("تم اكتشاف حلقة تحويل في استجابة الخادم.");
        }
        if (!text || text.trim().length < 10) {
          console.error(`[share][${localTrace}] empty response — headers:`, headerSnapshot);
          throw new Error("استجابة فارغة من الخادم.");
        }
        // نجح التحميل: صفّر العدّاد، واربط trace العميل بـ trace الخادم
        if (serverTrace) setTraceId(`${localTrace}/${serverTrace}`);
        try {
          sessionStorage.removeItem(VISIT_KEY_PREFIX + token);
        } catch { /* ignore */ }
        setHtml(text);
      })
      .catch((e) => {
        console.error(`[share][${localTrace}] failed:`, e);
        setError(e?.message || "تعذّر فتح المستند");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDownloadPdf = async () => {
    if (!html || downloading) return;
    setDownloading(true);
    const loadingToast = toast.loading("جاري توليد ملف PDF...");
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      const sourceElement = iframeDoc?.body?.cloneNode(true) as HTMLElement | undefined;
      if (!sourceElement) throw new Error("تعذّر قراءة محتوى المعاينة");

      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `document-${token?.slice(0, 8) || "share"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        } as any)
        .from(sourceElement)
        .save();

      toast.dismiss(loadingToast);
      toast.success("تم تحميل الملف بنجاح");
    } catch (e: any) {
      toast.dismiss(loadingToast);
      toast.error(e?.message || "تعذّر توليد ملف PDF، حاول مرة أخرى");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> جاري فتح المستند...
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-lg p-6 text-center max-w-md shadow-sm">
          <div className="flex justify-center mb-3">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <h1 className="text-lg font-bold text-destructive mb-2">تعذّر فتح المستند</h1>
          <p className="text-sm text-muted-foreground mb-3">{error.replace(/<[^>]+>/g, " ").trim()}</p>
          {traceId && (
            <p className="text-xs text-muted-foreground">
              رقم التتبّع: <code className="bg-muted px-2 py-0.5 rounded text-primary font-mono">{traceId}</code>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background flex flex-col">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-2 flex items-center justify-between shadow-sm">
        <h1 className="text-sm font-semibold text-foreground">معاينة المستند</h1>
        <Button
          size="sm"
          onClick={handleDownloadPdf}
          disabled={downloading || !html}
          className="gap-2"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloading ? "جاري التوليد..." : "تحميل PDF"}
        </Button>
      </div>
      <iframe
        ref={iframeRef}
        title="معاينة المستند"
        srcDoc={html}
        className="w-full flex-1 min-h-[calc(100vh-3rem)] border-0 bg-background"
      />
    </div>
  );
}
