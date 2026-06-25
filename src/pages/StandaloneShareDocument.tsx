/**
 * صفحة قائمة بذاتها لرابط العميل.
 *
 * تُركَّب من main.tsx مباشرة قبل App.tsx — أي بدون أي Providers،
 * بدون Sidebar/Header، بدون PWA install prompt، بدون React Query
 * أو Router أو Toaster. فقط: جلب HTML المستند من edge function
 * وعرضه + زر طباعة و زر تحميل PDF.
 *
 * تُفعَّل عند مطابقة المسار `/share/document/:token`.
 */
import { useEffect, useRef, useState } from "react";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string;
const ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function StandaloneShareDocument({ token }: { token: string }) {
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!token) {
      setError("رابط غير صالح");
      setLoading(false);
      return;
    }
    const url = `${SUPABASE_URL}/functions/v1/document-share?token=${encodeURIComponent(token)}`;
    fetch(url, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text.replace(/<[^>]+>/g, " ").trim() || `HTTP ${r.status}`);
        setHtml(text);
      })
      .catch((e) => setError(e?.message || "تعذّر فتح المستند"))
      .finally(() => setLoading(false));
  }, [token]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const handleDownloadPdf = async () => {
    if (!html || downloading) return;
    setDownloading(true);
    try {
      const doc = iframeRef.current?.contentDocument;
      const body = doc?.body?.cloneNode(true) as HTMLElement | undefined;
      if (!body) throw new Error("تعذّر قراءة المحتوى");
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `document-${token.slice(0, 8)}.pdf`,
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
        <div style={{ display: "flex", gap: 8 }}>
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
        style={{ flex: 1, width: "100%", border: 0, background: "#fff" }}
      />
    </div>
  );
}
