/**
 * صفحة قائمة بذاتها لرابط العميل.
 *
 * تُركَّب من main.tsx مباشرة قبل App.tsx — أي بدون أي Providers،
 * بدون Sidebar/Header، بدون PWA install prompt، بدون React Query
 * أو Router أو Toaster.
 *
 * تُفعَّل عند مطابقة المسار `/share/document/:token`، **وتعترضه قبل الراوتر**
 * — فمسار `PublicDocumentSharePage` في `App.tsx` لا يُبلَغ لهذا العنوان أبداً.
 * وهذا ما جعل ورقة العميل تبقى مختلفة عن المعاينة رغم إصلاح تلك الصفحة: كان
 * الإصلاح في صفحةٍ لا يفتحها أحد.
 *
 * فالورقة هنا تُبنى بـ`generatePrintHTML` نفسها — قالبُ المعاينة والطباعة
 * حرفياً — من بيانات `get_shared_document`. راجع `sharedDocumentHtml.ts`.
 */
import { useEffect, useRef, useState } from "react";
import { buildDocumentFileName } from "@/utils/documentFileName";
import { useDocumentFrameFit } from "@/utils/documentFrameFit";
import DocumentFrameZoom from "@/components/common/DocumentFrameZoom";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string;
const ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function StandaloneShareDocument({ token }: { token: string }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  /**
   * الورقة تُلائم عرض الإطار فيراها العميل كاملةً — ثم يكبّرها ليقرأ.
   *
   * القياس من هنا لا من داخل الورقة: هذه الصفحة قد تحمل ورقة دالّة الحافة
   * القديمة حين لا تكون الهجرة مطبَّقة، وتلك لا تمرّ بقالبنا فلا تُلائم نفسها.
   */
  const frameFit = useDocumentFrameFit(iframeRef, [html]);

  useEffect(() => {
    if (!token) {
      setError("رابط غير صالح");
      setLoading(false);
      return;
    }
    const url = `${SUPABASE_URL}/functions/v1/document-share?token=${encodeURIComponent(token)}`;

    /** مسار الحافة القديم — يبقى شبكةَ أمانٍ حتى تُطبَّق الهجرة في كل بيئة. */
    const loadFromEdge = () =>
      fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
        .then(async (r) => {
          const text = await r.text();
          if (!r.ok) throw new Error(text.replace(/<[^>]+>/g, " ").trim() || `HTTP ${r.status}`);
          setHtml(text);
        })
        .catch((e) => setError(e?.message || "تعذّر فتح المستند"))
        .finally(() => setLoading(false));

    (async () => {
      try {
        const { fetchSharedDocumentHTML } = await import("@/utils/sharedDocumentHtml");
        setHtml(await fetchSharedDocumentHTML(token));
        setLoading(false);
      } catch (e: any) {
        // رفضٌ صريح (منتهٍ/غير موجود) يصل العميل بلغته ولا يُخفى بالسقوط.
        if (e?.code && ["not_found", "expired", "doc_missing", "missing_token", "unsupported_type"].includes(e.code)) {
          setError(e.message);
          setLoading(false);
          return;
        }
        console.warn("[share] RPC unavailable, falling back to edge function:", e?.message || e);
        void loadFromEdge();
      }
    })();
  }, [token]);

  function logEvent(event: "viewed" | "printed" | "downloaded") {
    try {
      fetch(`${SUPABASE_URL}/functions/v1/log-share-event`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ token, event }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* ignore */ }
  }

  // سجِّل أن العميل فتح الصفحة فعلياً (مكمّل لحدث viewed عند الـ redirect)
  useEffect(() => {
    if (!loading && !error && html) logEvent("viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, html]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    logEvent("printed");
    win.focus();
    win.print();
  };

  /** يقرأ meta المستند داخل الـiframe ليبني اسم ملف يفهمه العميل. */
  const pdfFileNameFrom = (doc: Document | null | undefined, tok: string): string => {
    const meta = (n: string) =>
      doc?.querySelector(`meta[name="${n}"]`)?.getAttribute("content") || "";
    const name = buildDocumentFileName({
      docLabel: meta("lov-doc-label") || doc?.title || "مستند",
      customerName: meta("lov-customer-name"),
      docNumber: meta("lov-doc-number"),
      total: meta("lov-doc-total"),
    });
    return name === "مستند.pdf" ? `مستند-${tok.slice(0, 8)}.pdf` : name;
  };

  const handleDownloadPdf = async () => {
    if (!html || downloading) return;
    setDownloading(true);
    try {
      const doc = iframeRef.current?.contentDocument;
      const body = doc?.body?.cloneNode(true) as HTMLElement | undefined;
      if (!body) throw new Error("تعذّر قراءة المحتوى");
      /**
       * إطارُ الورقة على الشاشة لا يدخل الـPDF.
       *
       * القالب يرسم صفحة A4 بيضاء على أرضيةٍ رمادية بهامش 10mm وظِلّ — وهو
       * تنسيقُ عرضٍ في `@media screen`. وhtml2canvas يصوّر بوسيط screen، فلو
       * بقي لخرج الملف بأرضيةٍ رمادية وبهامشٍ مضاعَف: هامش الورقة فوق هامش
       * html2pdf. فيُنزَع من النسخة وحدها — والصفحة على حالها.
       */
      body.style.background = "#fff";
      body.style.padding = "0";
      const page = body.querySelector<HTMLElement>(".page");
      if (page) {
        page.style.width = "auto";
        page.style.maxWidth = "none";
        page.style.minHeight = "0";
        page.style.padding = "0";
        page.style.boxShadow = "none";
        // ولا يدخله تصغيرُ الملاءمة الذي يُري الهاتفَ الورقةَ كاملة: الملف
        // يُصوَّر بمقاس الورقة الحقيقي وإلا خرج من الهاتف بنصف حجم خطّه.
        page.style.zoom = "1";
      }
      const html2pdf = (await import("html2pdf.js")).default;
      logEvent("downloaded");
      await html2pdf()
        .set({
          margin: 10,
          // اسم الملف من meta المستند نفسه (النوع/العميل/الرقم/المبلغ) بدل
          // `document-<token>` الذي لا يدلّ العميل على شيء.
          filename: pdfFileNameFrom(doc, token),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        } as any)
        .from(body)
        .save();
    } catch (e: any) {
      alert(e?.message || "فشل توليد PDF");
    } finally {
      setDownloading(false);
    }
  };

  const wrap: React.CSSProperties = {
    direction: "rtl",
    fontFamily: "'Cairo','Segoe UI',Tahoma,Arial,sans-serif",
    minHeight: "100vh",
    margin: 0,
    background: "#f3f4f6",
    display: "flex",
    flexDirection: "column",
  };
  const bar: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,.05)",
  };
  const btn = (color: string): React.CSSProperties => ({
    background: color,
    color: "#fff",
    border: 0,
    padding: "8px 18px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    fontFamily: "inherit",
  });

  if (loading) {
    return (
      <div style={{ ...wrap, alignItems: "center", justifyContent: "center", color: "#555" }}>
        جاري فتح المستند...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...wrap, alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            maxWidth: 480,
            boxShadow: "0 4px 16px rgba(0,0,0,.08)",
          }}
        >
          <h1 style={{ color: "#b91c1c", fontSize: 18, margin: "0 0 12px" }}>تعذّر فتح المستند</h1>
          <p style={{ color: "#555", margin: 0, fontSize: 14 }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={bar}>
        <strong style={{ fontSize: 14, color: "#1a1a1a" }}>شركة البتول لإسبارات المواتر والتكاتك</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <DocumentFrameZoom fit={frameFit} compact />
          <button type="button" style={btn("#10b981")} onClick={handlePrint}>
            🖨️ طباعة
          </button>
          <button
            type="button"
            style={{ ...btn("#5b21b6"), opacity: downloading ? 0.7 : 1 }}
            onClick={handleDownloadPdf}
            disabled={downloading}
          >
            {downloading ? "جاري التوليد..." : "⬇️ تحميل PDF"}
          </button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        title="معاينة المستند"
        srcDoc={html}
        onLoad={frameFit.refit}
        style={{ flex: 1, width: "100%", border: 0, background: "#fff" }}
      />
    </div>
  );
}
