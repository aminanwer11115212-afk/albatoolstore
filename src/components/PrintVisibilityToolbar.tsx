import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Printer, Download, Share2, MessageCircle } from "lucide-react";
import { userScopedLegacyKey } from "@/lib/userScopedKey";
import { openWhatsApp } from "@/utils/whatsapp";

/**
 * شريط معاينة عام يضع زر عين لكل قسم قابل للإخفاء/الإظهار.
 *
 * كيفية الاستخدام:
 *   1) ضع `data-section="header"` و `data-section-label="الترويسة"` على
 *      أي عنصر JSX تريد إخفاءه/إظهاره.
 *   2) ضع <PrintVisibilityToolbar storageKey="customer-statement"
 *         containerSelector=".printable-area" sections={[{key:"header",label:"الترويسة"},...]} />
 *
 * - يحفظ تفضيلات الإخفاء في localStorage تحت المفتاح المعطى.
 * - يخفي الأقسام مرئياً + يحذفها من الطباعة (CSS @media print + خاصية حذف عند PDF).
 * - يدعم زر طباعة + زر تحميل PDF + زر مشاركة واتساب نصية.
 */

export interface PrintSection {
  key: string;
  label: string;
}

interface Props {
  storageKey: string;
  /** CSS selector للمنطقة القابلة للطباعة (المحتوى فقط، بدون شريط الأدوات) */
  containerSelector: string;
  sections: PrintSection[];
  /** نص يظهر في رسالة المشاركة بواتساب */
  shareTitle?: string;
  /** مبلغ/إجمالي يظهر في رسالة المشاركة */
  shareSummary?: string;
  /** اسم ملف PDF المُولَّد */
  pdfFilename?: string;
  /** عرض زر مشاركة واتساب نص؟ */
  showWhatsApp?: boolean;
}

const STYLE_TAG_ID = "__lov_print_visibility_styles__";

function injectGlobalStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = `
    [data-section].__lov_pv_hidden { display: none !important; }
    @media print {
      .__lov_pv_toolbar { display: none !important; }
      [data-section].__lov_pv_hidden { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}

export default function PrintVisibilityToolbar({
  storageKey,
  containerSelector,
  sections,
  shareTitle,
  shareSummary,
  pdfFilename,
  showWhatsApp = true,
}: Props) {
  const fullKey = userScopedLegacyKey(`__lov_print_visibility__${storageKey}`);
  const [hidden, setHidden] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(fullKey) || "{}") || {};
    } catch {
      return {};
    }
  });
  const [downloading, setDownloading] = useState(false);
  const html2pdfRef = useRef<any>(null);

  // inject hide styles globally once
  useEffect(() => {
    injectGlobalStyles();
  }, []);

  // apply visibility to DOM
  useEffect(() => {
    sections.forEach((s) => {
      document.querySelectorAll(`[data-section="${s.key}"]`).forEach((el) => {
        if (hidden[s.key]) el.classList.add("__lov_pv_hidden");
        else el.classList.remove("__lov_pv_hidden");
      });
    });
    try {
      localStorage.setItem(fullKey, JSON.stringify(hidden));
    } catch {
      /* noop */
    }
  }, [hidden, sections, fullKey]);

  const toggle = (key: string) => {
    setHidden((p) => ({ ...p, [key]: !p[key] }));
  };

  const loadHtml2Pdf = async () => {
    if (html2pdfRef.current) return html2pdfRef.current;
    return await new Promise((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-lov-html2pdf="1"]',
      ) as HTMLScriptElement | null;
      if (existing && (window as any).html2pdf) {
        html2pdfRef.current = (window as any).html2pdf;
        resolve(html2pdfRef.current);
        return;
      }
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      s.dataset.lovHtml2pdf = "1";
      s.onload = () => {
        html2pdfRef.current = (window as any).html2pdf;
        resolve(html2pdfRef.current);
      };
      s.onerror = () => reject(new Error("فشل تحميل مكتبة PDF"));
      document.head.appendChild(s);
    });
  };

  const buildPrintableClone = (): HTMLElement | null => {
    const src = document.querySelector(containerSelector) as HTMLElement | null;
    if (!src) return null;
    const clone = src.cloneNode(true) as HTMLElement;
    // remove anything currently hidden by toggle
    clone.querySelectorAll(".__lov_pv_hidden").forEach((n) => n.remove());
    const wrap = document.createElement("div");
    wrap.appendChild(clone);
    wrap.style.padding = "10mm";
    wrap.style.background = "#fff";
    return wrap;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const html2pdf: any = await loadHtml2Pdf();
      const el = buildPrintableClone();
      if (!el) throw new Error("لا يوجد محتوى");
      const opt = {
        margin: 8,
        filename: (pdfFilename || shareTitle || "document") + ".pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      };
      await html2pdf().set(opt).from(el).save();
    } catch (e: any) {
      alert("فشل توليد PDF: " + (e?.message || e));
    } finally {
      setDownloading(false);
    }
  };

  const handleWhatsApp = () => {
    const lines = [shareTitle || document.title || "كشف"];
    if (shareSummary) lines.push(shareSummary);
    openWhatsApp(undefined, lines.join("\n"));
  };

  const handleShare = async () => {
    const text = `${shareTitle || ""}${shareSummary ? "\n" + shareSummary : ""}`.trim();
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text });
        return;
      } catch {
        /* fallthrough */
      }
    }
    handleWhatsApp();
  };

  const visibleCount = useMemo(
    () => sections.length - Object.values(hidden).filter(Boolean).length,
    [hidden, sections.length],
  );

  return (
    <div
      className="__lov_pv_toolbar"
      dir="rtl"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "linear-gradient(135deg, #5b2c8e, #7e3eb5)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 10,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 700, marginInlineEnd: 8 }}>📄 معاينة المستند</span>
        <button type="button" onClick={handlePrint} style={btnStyle()}>
          <Printer size={14} /> طباعة
        </button>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={downloading}
          style={btnStyle()}
        >
          <Download size={14} /> {downloading ? "جاري..." : "تحميل PDF"}
        </button>
        {showWhatsApp && (
          <>
            <button type="button" onClick={handleShare} style={btnStyle()}>
              <Share2 size={14} /> مشاركة
            </button>
            <button type="button" onClick={handleWhatsApp} style={btnStyle()}>
              <MessageCircle size={14} /> واتساب
            </button>
          </>
        )}
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.2)" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontWeight: 700, marginInlineEnd: 6, opacity: 0.9 }}>
          👁️ تخصيص الرؤية ({visibleCount}/{sections.length}):
        </span>
        {sections.map((s) => {
          const isHidden = !!hidden[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              title={isHidden ? `إظهار: ${s.label}` : `إخفاء: ${s.label}`}
              style={btnStyle(isHidden)}
            >
              {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
              <span
                style={{
                  textDecoration: isHidden ? "line-through" : "none",
                  opacity: isHidden ? 0.7 : 1,
                }}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function btnStyle(off = false): React.CSSProperties {
  return {
    background: off ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.25)",
    padding: "5px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    transition: "background 0.15s",
  };
}
