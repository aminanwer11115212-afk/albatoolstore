import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Printer, Download, MessageCircle, FileText, Eye, EyeOff, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateStatementHTML, type StatementData } from "@/utils/statementPrintTemplate";
import { openWhatsApp, buildWhatsAppDeepLink } from "@/utils/whatsapp";

/**
 * صفحة معاينة كشف الحساب داخل النظام (نفس التخطيط/الثيم).
 * تقرأ بيانات الكشف من sessionStorage بمفتاح "lov_statement_preview".
 * تعرض المستند داخل iframe مع شريط أدوات React علوي:
 *  • طباعة • تحميل PDF • واتساب نص • واتساب PDF • تخصيص رؤية الأقسام (👁️)
 * لا يوجد روابط مشاركة عامة.
 */

const STORAGE_DATA_KEY = "lov_statement_preview";
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

export default function StatementPreviewPage() {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [data, setData] = useState<StatementData | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [sections, setSections] = useState<{ key: string; label: string }[]>([]);
  const [busy, setBusy] = useState<string>("");

  // load data + saved visibility prefs
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_DATA_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StatementData;
      setData(parsed);
      const visKey = `${VIS_KEY_PREFIX}:${getUserKey()}:${parsed.kind}-statement`;
      const savedRaw = localStorage.getItem(visKey);
      if (savedRaw) setHidden(JSON.parse(savedRaw) || {});
    } catch {/* ignore */}
  }, []);

  const html = useMemo(() => (data ? generateStatementHTML(data) : ""), [data]);

  // after iframe load → discover sections + apply hidden + neutralize internal toolbar (we have our own)
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
    applyHiddenToIframe(hidden);
  };

  const applyHiddenToIframe = (state: Record<string, boolean>) => {
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
    applyHiddenToIframe(next);
    const visKey = `${VIS_KEY_PREFIX}:${getUserKey()}:${data.kind}-statement`;
    try { localStorage.setItem(visKey, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const docTitle = useMemo(() => {
    if (!data) return "كشف الحساب";
    const t = data.kind === "customer" ? "كشف حساب عميل" : "كشف حساب مورد";
    return `${t} - ${data.party.name}`;
  }, [data]);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  };

  const generatePdfBlob = async (): Promise<Blob | null> => {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow as any;
    if (!doc || !win) return null;
    // load html2pdf in iframe context if not yet
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

  // ===== اسم الملف الموحَّد بنفس منطق buildWaFileName في printTemplate =====
  const buildWaFileNameForStatement = (ext: string): string => {
    const digitMap: Record<string, string> = {
      "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
      "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
    };
    const clean = (raw?: string): string => {
      let s = (raw || "").trim();
      if (!s || s === "-" || s === "—" || s === "_" || s === "undefined" || s === "null") return "";
      s = s.replace(/[٠-٩۰-۹]/g, (d) => digitMap[d] || d);
      s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
      return s;
    };
    const docLabel   = clean(data?.kind === "customer" ? "كشف حساب عميل" : data?.kind === "supplier" ? "كشف حساب مورد" : "كشف حساب") || "مستند";
    const customerNm = clean(data?.party?.name) || "بدون اسم";
    let name = `${docLabel} - ${customerNm}`.trim();
    if (!name) name = "document";
    if (name.length > 120) name = name.slice(0, 120).trim();
    return `${name}.${ext}`;
  };

  const handleDownloadPdf = async () => {
    setBusy("pdf");
    try {
      const blob = await generatePdfBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = buildWaFileNameForStatement("pdf");
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
  const getWaPhone = (): string => {
    const doc = iframeRef.current?.contentDocument;
    const m = doc?.querySelector('meta[name="lov-wa-phone"]');
    let v = (m?.getAttribute("content") || "").trim();
    if (!v) return "";
    const map: Record<string, string> = {
      "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
      "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
    };
    v = v.replace(/[٠-٩۰-۹]/g, (d) => map[d] || d);
    const hasPlus = v.includes("+");
    let digits = v.replace(/[^0-9]/g, "");
    if (!digits) return "";
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (!hasPlus && digits.startsWith("0")) digits = "249" + digits.slice(1);
    return digits;
  };
  const normalizeArabic = (s: string) => {
    try { return (s || "").normalize("NFC"); } catch { return s || ""; }
  };
  const buildWaUrl = (text: string) => {
    const phone = getWaPhone();
    const t = normalizeArabic(String(text || ""));
    return buildWhatsAppDeepLink(phone, t);
  };

  const handleWaText = () => {
    openWhatsApp(getWaPhone(), normalizeArabic(getWaText() || docTitle));
  };

  /** مشاركة Blob كملف فقط بدون أي نص (مع مسار احتياطي للتنزيل + فتح واتساب فارغ) */
  const shareBlobOnly = async (blob: Blob, fileName: string, mime: string) => {
    const file = new File([blob], fileName, { type: mime });
    const nav: any = navigator;
    let canShareFiles = false;
    try {
      canShareFiles = !!(nav.canShare && nav.share && nav.canShare({ files: [file] }));
    } catch { canShareFiles = false; }
    if (canShareFiles) {
      try { await nav.share({ files: [file] }); return; }
      catch (e: any) { if (e?.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    window.open(buildWaUrl(""), "_blank");
  };

  const handleWaPdf = async () => {
    setBusy("wa-pdf");
    try {
      const blob = await generatePdfBlob();
      if (!blob) return;
      await shareBlobOnly(blob, buildWaFileNameForStatement("pdf"), "application/pdf");
    } catch (e: any) {
      if (e?.name !== "AbortError") alert("فشل مشاركة PDF: " + (e?.message || e));
    } finally { setBusy(""); }
  };

  /** يولّد صورة PNG للمستند داخل iframe باستخدام html2canvas */
  const generateImgBlob = async (): Promise<Blob | null> => {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow as any;
    if (!doc || !win) return null;

    // تأكد من توفر html2canvas — إما من window، أو من html2pdf.bundle، أو حمّله مستقلاً
    let html2canvas = win.html2canvas;
    if (!html2canvas && win.html2pdf?.html2canvas) {
      html2canvas = win.html2pdf.html2canvas;
      win.html2canvas = html2canvas;
    }
    if (!html2canvas) {
      await new Promise<void>((resolve, reject) => {
        const s = doc.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("فشل تحميل مكتبة الصور"));
        doc.body.appendChild(s);
      });
      html2canvas = win.html2canvas;
    }
    if (typeof html2canvas !== "function") throw new Error("html2canvas غير متاح");

    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".__lov_hidden").forEach((n) => n.remove());
    const wrap = doc.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.left = "-99999px";
    wrap.style.top = "0";
    wrap.style.background = "#fff";
    wrap.appendChild(clone);
    doc.body.appendChild(wrap);
    try {
      const canvas = await html2canvas(wrap, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
      return await new Promise<Blob | null>((resolve) => canvas.toBlob((b: Blob | null) => resolve(b), "image/png", 0.95));
    } finally {
      doc.body.removeChild(wrap);
    }
  };

  const handleLinkOnline = async () => {
    if (!data) return;
    setBusy("link");
    try {
      const docType = data.kind === "customer" ? "statement-customer" : "statement-supplier";
      const docId = data.party?.id;
      if (!docId) throw new Error("معرّف الطرف غير متاح");
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      if (!accessToken) throw new Error("يجب تسجيل الدخول");
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-document-share-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: ANON,
        },
        body: JSON.stringify({ doc_type: docType, doc_id: docId, ttl_hours: 168 }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "فشل إنشاء الرابط");
      const phone = getWaPhone();
      const partyName = data.party?.name || "";
      const greeting = partyName ? `مرحباً ${partyName} 👋` : "مرحباً 👋";
      const msg = `${greeting}\nتفضل رابط معاينة كشف الحساب:\n${json.url}`;
      openWhatsApp(phone, msg);
    } catch (e: any) {
      alert("فشل إنشاء الرابط: " + (e?.message || e));
    } finally { setBusy(""); }
  };

  if (!data) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <p className="text-muted-foreground mb-4">لا توجد بيانات لعرضها. الرجاء فتح المعاينة من صفحة الكشف.</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded bg-primary text-primary-foreground">رجوع</button>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {/* شريط الأدوات */}
      <div className="bg-card border border-border rounded-xl shadow-sm p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* يسار: رجوع + عنوان المستند */}
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

          {/* يمين: مجموعة الطباعة/التحميل */}
          <div className="inline-flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
              title="طباعة"
            >
              <Printer size={16} /> طباعة
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={busy === "pdf"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold transition-colors disabled:opacity-60"
              title="تحميل PDF"
            >
              <Download size={16} /> {busy === "pdf" ? "جاري..." : "تحميل PDF"}
            </button>
          </div>

          {/* فاصل بصري */}
          <div className="hidden sm:block w-px h-7 bg-border mx-1" aria-hidden="true" />

          {/* مجموعة واتساب */}
          <div className="inline-flex items-center gap-2">
            <button
              onClick={handleWaPdf}
              disabled={busy === "wa-pdf"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              title="مشاركة PDF عبر واتساب"
            >
              <MessageCircle size={16} /> {busy === "wa-pdf" ? "جاري..." : "واتساب PDF"}
            </button>
            <button
              onClick={handleLinkOnline}
              disabled={busy === "link"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              title="إنشاء رابط معاينة للعميل"
            >
              <LinkIcon size={16} /> {busy === "link" ? "جاري..." : "رابط للعميل"}
            </button>
            <button
              onClick={handleWaText}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
              title="مشاركة نص عبر واتساب"
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
                  title={isHidden ? "إظهار: " + s.label : "إخفاء: " + s.label}
                >
                  {isHidden ? <EyeOff size={13} /> : <Eye size={13} />} {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* iframe لعرض المستند بنفس قالب الطباعة */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <iframe
          ref={iframeRef}
          title={docTitle}
          srcDoc={html}
          onLoad={onIframeLoad}
          className="w-full bg-white"
          style={{ height: "calc(100vh - 220px)", minHeight: 600, border: 0 }}
        />
      </div>
    </div>
  );
}
