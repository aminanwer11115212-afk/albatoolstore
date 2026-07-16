import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Printer, Download, MessageCircle, FileText } from "lucide-react";
import { generateFinancialReportHTML, type FinancialReportData } from "@/utils/financialReportPrintTemplate";
import { openWhatsApp } from "@/utils/whatsapp";

/**
 * صفحة معاينة موحّدة للتقارير المالية (الدخل/المصروفات/قائمة الدخل/الديون...).
 * تقرأ البيانات من sessionStorage بمفتاح "lov_financial_report_preview".
 * تعرض المستند داخل iframe مع شريط أدوات: طباعة / PDF / واتساب / تخصيص الرؤية.
 */

const STORAGE_KEY = "lov_financial_report_preview";
const VIS_KEY_PREFIX = "__lov_print_visibility__";

function getUserKey(): string {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          const uid = parsed?.user?.id || parsed?.currentSession?.user?.id;
          if (uid) return String(uid).replace(/[^a-zA-Z0-9_-]/g, "");
        }
      }
    }
  } catch { /* ignore */ }
  return "anon";
}

export default function FinancialReportPreviewPage() {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [data, setData] = useState<FinancialReportData | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [sections, setSections] = useState<{ key: string; label: string }[]>([]);
  const [busy, setBusy] = useState<string>("");

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as FinancialReportData;
      setData(parsed);
      const visKey = `${VIS_KEY_PREFIX}:${getUserKey()}:financial-${(parsed.title || "report").replace(/\s+/g, "-")}`;
      const savedRaw = localStorage.getItem(visKey);
      if (savedRaw) setHidden(JSON.parse(savedRaw) || {});
    } catch { /* ignore */ }
  }, []);

  const html = useMemo(() => (data ? generateFinancialReportHTML(data) : ""), [data]);

  const onIframeLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const found: { key: string; label: string }[] = [];
    const seen = new Set<string>();
    doc.querySelectorAll("[data-section]").forEach((el) => {
      const key = el.getAttribute("data-section") || "";
      if (!key || seen.has(key)) return;
      seen.add(key);
      found.push({ key, label: el.getAttribute("data-section-label") || key });
    });
    setSections(found);
    applyHidden(hidden);
    // Auto-export if requested (set by the invoking page, e.g. CustomerStatementPage → "تصدير PDF")
    try {
      const flag = sessionStorage.getItem("lov_financial_report_autoexport");
      if (flag === "pdf") {
        sessionStorage.removeItem("lov_financial_report_autoexport");
        setTimeout(() => { handleDownloadPdf().catch(() => {}); }, 400);
      }
    } catch { /* ignore */ }
  };

  const applyHidden = (state: Record<string, boolean>) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => {
      const key = el.getAttribute("data-section") || "";
      if (state[key]) el.classList.add("__lov_hidden");
      else el.classList.remove("__lov_hidden");
    });
  };

  const toggleSection = (key: string) => {
    if (!data) return;
    const next = { ...hidden };
    if (next[key]) delete next[key]; else next[key] = true;
    setHidden(next);
    applyHidden(next);
    const visKey = `${VIS_KEY_PREFIX}:${getUserKey()}:financial-${(data.title || "report").replace(/\s+/g, "-")}`;
    try { localStorage.setItem(visKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const docTitle = data?.title || "تقرير مالي";

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  };

  const generatePdfBlob = async (): Promise<Blob | null> => {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow as any;
    if (!doc || !win) return null;
    if (!win.html2pdf) {
      await new Promise<void>((resolve, reject) => {
        const s = doc.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("فشل تحميل مكتبة PDF"));
        doc.body.appendChild(s);
      });
    }
    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".__lov_hidden").forEach((n) => n.remove());
    const wrap = doc.createElement("div");
    wrap.appendChild(clone);
    const opt = {
      margin: 8,
      filename: `${docTitle}.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    return await win.html2pdf().set(opt).from(wrap).outputPdf("blob");
  };

  const cleanFileName = (raw: string, ext: string) => {
    const map: Record<string, string> = { "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9" };
    let s = (raw || "تقرير").trim().replace(/[٠-٩]/g, (d) => map[d] || d);
    s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (s.length > 120) s = s.slice(0, 120).trim();
    return `${s}.${ext}`;
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
    try {
      const blob = await generatePdfBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = cleanFileName(docTitle, "pdf");
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (e: any) {
      alert("فشل توليد PDF: " + (e?.message || e));
    } finally { setBusy(""); }
  };

  const getWaText = (): string => {
    const doc = iframeRef.current?.contentDocument;
    const m = doc?.querySelector('meta[name="lov-wa-text"]');
    return (m?.getAttribute("content") || "").trim();
  };

  const handleWaText = () => {
    const t = getWaText() || docTitle;
    openWhatsApp(undefined, t);
  };

  const handleWaPdf = async () => {
    setBusy("wa-pdf");
    try {
      const blob = await generatePdfBlob();
      if (!blob) return;
      const file = new File([blob], cleanFileName(docTitle, "pdf"), { type: "application/pdf" });
      const nav: any = navigator;
      let canShare = false;
      try { canShare = !!(nav.canShare && nav.share && nav.canShare({ files: [file] })); } catch { canShare = false; }
      if (canShare) {
        try { await nav.share({ files: [file] }); return; }
        catch (e: any) { if (e?.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      openWhatsApp(undefined, "");
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("فشل مشاركة PDF: " + (e?.message || e));
    } finally { setBusy(""); }
  };

  if (!data) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-muted-foreground mb-4">لا توجد بيانات لعرضها. الرجاء فتح المعاينة من صفحة التقرير.</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded bg-primary text-primary-foreground">رجوع</button>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="bg-card border border-border rounded-xl shadow-sm p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-medium transition-colors"
          >
            <ArrowRight size={16} /> رجوع
          </button>
          <div className="flex items-center gap-1.5 px-2 text-sm font-bold text-primary">
            <FileText size={16} /> {docTitle}
          </div>

          <div className="flex-1" />

          <div className="inline-flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
            >
              <Printer size={16} /> طباعة
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={busy === "pdf"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <Download size={16} /> {busy === "pdf" ? "جاري..." : "تحميل PDF"}
            </button>
          </div>

          <div className="hidden sm:block w-px h-7 bg-border mx-1" aria-hidden="true" />

          <div className="inline-flex items-center gap-2">
            <button
              onClick={handleWaPdf}
              disabled={busy === "wa-pdf"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <MessageCircle size={16} /> {busy === "wa-pdf" ? "جاري..." : "واتساب PDF"}
            </button>
            <button
              onClick={handleWaText}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              <MessageCircle size={16} /> واتساب نص
            </button>
          </div>
        </div>
        {sections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className="text-xs font-semibold text-muted-foreground">👁️ تخصيص الرؤية:</span>
            {sections.map((s) => {
              const isHidden = !!hidden[s.key];
              return (
                <button
                  key={s.key}
                  onClick={() => toggleSection(s.key)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                    isHidden
                      ? "bg-muted text-muted-foreground border-border line-through opacity-70"
                      : "bg-primary/10 text-primary border-primary/30"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={onIframeLoad}
          title={docTitle}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
