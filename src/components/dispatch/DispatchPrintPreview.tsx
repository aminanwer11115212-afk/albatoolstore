/**
 * DispatchPrintPreview — لوحة معاينة طباعة A4 للفواتير المختارة في إدارة الترحيلات.
 *
 * - تستخدم نفس قالب الطباعة العام للفواتير (generatePrintHTML) كي يكون شكل
 *   المعاينة مطابقاً تماماً لشكل طباعة الفاتورة في باقي الشاشات.
 * - تعرض فاتورة واحدة لكل صفحة A4، مع شريط تنقل بين الفواتير المختارة.
 * - يتم تصغير الترويسة (الشعار + اسم الشركة + العناوين) عبر CSS مُحقَن
 *   فوق القالب لتوفير مساحة لمحتوى الترحيلات/التغليف.
 * - "طباعة الكل" تبني وثيقة واحدة فيها كل الفواتير (page-break بين كلٍ منها).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, ChevronRight, ChevronLeft, Eye, Loader2 } from "lucide-react";
import { generatePrintHTML } from "@/utils/printTemplate";
import { loadInvoiceExtras } from "@/utils/printExtras";

type Props = {
  selectedIds: Set<string>;
  company: any;
};

const EMPTY_IDS: string[] = [];

// CSS مُحقَن فوق قالب الطباعة لتصغير الترويسة فقط (دون المساس بباقي القالب).
const COMPACT_HEADER_CSS = `
  body { padding: 14px !important; }
  .header { padding-bottom: 6px !important; margin-bottom: 6px !important; border-bottom-width: 2px !important; }
  .header-logos { margin-bottom: 3px !important; }
  .header-logo img { height: 42px !important; }
  .header-title { font-size: 14px !important; margin-bottom: 2px !important; }
  .header-address { font-size: 10px !important; line-height: 1.35 !important; }
  .header-phones { font-size: 11px !important; margin-top: 1px !important; }
  .header-manager { font-size: 10px !important; margin-top: 1px !important; }
  .doc-title { margin: 6px 0 6px !important; }
  .doc-title h1 { font-size: 16px !important; padding-bottom: 2px !important; border-bottom-width: 2px !important; }
  .info-row { margin-bottom: 8px !important; font-size: 12px !important; }
`;

/**
 * يحقن CSS داخل <head> لكتلة HTML المُولّدة من generatePrintHTML.
 */
function injectCompactHeader(html: string): string {
  const styleTag = `<style data-dispatch-compact>${COMPACT_HEADER_CSS}</style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${styleTag}</head>`);
  return styleTag + html;
}

/**
 * يستخرج محتوى <body>...</body> من وثيقة HTML.
 */
function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

/**
 * يستخرج محتوى أول <style> من وثيقة HTML (قالب الطباعة يضع كل CSS هناك).
 */
function extractStyle(html: string): string {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : "";
}

// تحميل فاتورة كاملة (بنود + زبون + رصيد) — مماثل لما يفعله DocumentPreviewPage.
async function loadFullInvoice(id: string) {
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*, customers(name, phone, address, email, balance)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!invoice) return null;
  const { data: items } = await supabase
    .from("invoice_items").select("*").eq("invoice_id", id);
  return { invoice, items: items || [] };
}

function buildInvoiceHTML(payload: any, company: any, extras: any): string {
  const { invoice, items } = payload;
  const printItems = items.map((it: any) => ({
    product_name: it.product_name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    tax_amount:
      (Number(it.tax_rate || 0) * Number(it.unit_price) * Number(it.quantity)) / 100,
    discount: it.discount || 0,
    total: it.total,
  }));
  const raw = generatePrintHTML({
    type: "invoice",
    isCash: invoice.type === "cash",
    number: invoice.invoice_number,
    date: invoice.date,
    dueDate: invoice.due_date,
    customer: invoice.customers
      ? {
          name: invoice.customers.name,
          phone: invoice.customers.phone,
          address: invoice.customers.address,
          email: invoice.customers.email,
        }
      : null,
    items: printItems,
    subtotal: Number(invoice.subtotal || 0),
    taxTotal: Number(invoice.tax_amount || 0),
    discountTotal: Number(invoice.discount || 0),
    shipping: Number(invoice.shipping || 0),
    grandTotal: Number(invoice.total || 0),
    paidAmount: Number(invoice.paid_amount || 0),
    dueAmount: Number(invoice.due_amount || 0),
    notes: invoice.notes,
    company: company as any,
    status: invoice.status,
    paymentMethod: invoice.payment_method,
    variant: "full",
    oldBalance: Number(invoice.customers?.balance || 0),
    ...extras,
  });
  return injectCompactHeader(raw);
}

export default function DispatchPrintPreview({ selectedIds, company }: Props) {
  const ids = useMemo(() => {
    const arr = Array.from(selectedIds);
    return arr.length ? arr : EMPTY_IDS;
  }, [selectedIds]);

  const [currentIdx, setCurrentIdx] = useState(0);

  // إعادة الضبط عند تغيُّر الاختيار
  useEffect(() => {
    setCurrentIdx((i) => Math.min(i, Math.max(0, ids.length - 1)));
  }, [ids.length, ids.join(",")]);

  // تحميل بيانات كل الفواتير المختارة (للمعاينة وللطباعة الجماعية)
  const { data: docs, isLoading } = useQuery({
    queryKey: ["dispatch-preview-full", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
          const payload = await loadFullInvoice(id);
          if (!payload) return null;
          const extras = await loadInvoiceExtras(id).catch(() => ({}));
          return { id, payload, extras };
        })
      );
      return results.filter(Boolean) as Array<{
        id: string;
        payload: any;
        extras: any;
      }>;
    },
  });

  const total = ids.length;
  const currentDoc = docs?.[currentIdx];

  // HTML للمعاينة (الفاتورة الحالية)
  const previewHtml = useMemo(() => {
    if (!currentDoc) return "";
    return buildInvoiceHTML(currentDoc.payload, company, currentDoc.extras);
  }, [currentDoc, company]);

  // ── Print handlers ────────────────────────────────────────────────────────
  const openPrintWindow = (html: string) => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.print();
      win.onafterprint = () => win.close();
    };
  };

  const handlePrintCurrent = () => {
    if (!previewHtml) return;
    openPrintWindow(previewHtml);
  };

  const handlePrintAll = () => {
    if (!docs || docs.length === 0) return;
    // نبني وثيقة موحَّدة: نأخذ CSS من أول فاتورة + body لكل فاتورة بـ page-break.
    const first = buildInvoiceHTML(docs[0].payload, company, docs[0].extras);
    const css = extractStyle(first) + "\n" + COMPACT_HEADER_CSS +
      "\n.page { page-break-after: always; } .page:last-child { page-break-after: auto; }";
    const bodies = docs.map((d) => {
      const html = buildInvoiceHTML(d.payload, company, d.extras);
      return extractBody(html);
    }).join("\n");
    const out = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" /><title>طباعة الترحيلات</title><style>${css}</style></head><body>${bodies}</body></html>`;
    openPrintWindow(out);
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (ids.length === 0) {
    return (
      <div className="dpp-shell" dir="rtl">
        <PreviewStyles />
        <div className="dpp-header">
          <h3><Eye size={15} /> معاينة الطباعة</h3>
        </div>
        <div className="dpp-empty">
          <Eye size={36} className="dpp-empty-ic" />
          <div className="dpp-empty-title">لا توجد فواتير مختارة</div>
          <div className="dpp-empty-sub">اختر فاتورة أو أكثر من القائمة لعرض معاينة الطباعة هنا</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dpp-shell" dir="rtl">
      <PreviewStyles />

      {/* Header + Nav */}
      <div className="dpp-header">
        <h3><Eye size={15} /> معاينة الطباعة</h3>
        <div className="dpp-nav">
          <button
            type="button"
            className="dpp-nav-btn"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            title="السابقة"
          >
            <ChevronRight size={14} />
          </button>
          <span className="dpp-pageinfo">
            فاتورة <b>{currentIdx + 1}</b> من <b>{total}</b>
          </span>
          <button
            type="button"
            className="dpp-nav-btn"
            onClick={() => setCurrentIdx((i) => Math.min(total - 1, i + 1))}
            disabled={currentIdx >= total - 1}
            title="التالية"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="dpp-actions">
        <button
          type="button"
          className="dpp-btn dpp-btn-primary"
          onClick={handlePrintCurrent}
          disabled={isLoading || !previewHtml}
        >
          <Printer size={13} />
          طباعة الفاتورة الحالية
        </button>
        <button
          type="button"
          className="dpp-btn dpp-btn-ghost"
          onClick={handlePrintAll}
          disabled={isLoading || !docs || docs.length === 0}
        >
          <Printer size={13} />
          طباعة الكل ({total})
        </button>
      </div>

      {/* Preview iframe */}
      <div className="dpp-viewport">
        {isLoading || !previewHtml ? (
          <div className="dpp-empty">
            <Loader2 className="animate-spin" size={18} />
            <div className="dpp-empty-title">جارٍ تحميل المعاينة…</div>
          </div>
        ) : (
          <iframe
            key={currentDoc?.id}
            title="معاينة طباعة الترحيل"
            srcDoc={previewHtml}
            className="dpp-iframe"
          />
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
function PreviewStyles() {
  return (
    <style>{`
      .dpp-shell {
        display:flex; flex-direction:column;
        background: hsl(var(--card));
        border: 1px solid hsl(var(--border));
        border-radius: 10px; overflow:hidden;
        box-shadow: 0 2px 10px rgba(0,0,0,0.04);
        height: 100%; min-height: 400px;
      }
      .dpp-header {
        display:flex; align-items:center; justify-content:space-between;
        padding: 8px 12px;
        background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85));
        color: hsl(var(--primary-foreground));
      }
      .dpp-header h3 { font-size:13px; font-weight:800; margin:0; display:flex; align-items:center; gap:6px; }
      .dpp-nav { display:inline-flex; align-items:center; gap:4px; background: rgba(255,255,255,0.18); border-radius:6px; padding:2px 4px; }
      .dpp-nav-btn {
        background: transparent; border:none; color:inherit; cursor:pointer;
        padding: 2px 4px; border-radius:4px;
        display:inline-flex; align-items:center; justify-content:center;
      }
      .dpp-nav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
      .dpp-nav-btn:disabled { opacity:0.4; cursor:not-allowed; }
      .dpp-pageinfo { font-size:11px; font-weight:700; padding: 0 4px; }
      .dpp-pageinfo b { font-weight:800; }

      .dpp-actions {
        display:flex; gap:6px; padding: 8px 10px;
        border-bottom: 1px solid hsl(var(--border));
        background: hsl(var(--muted) / 0.3);
      }
      .dpp-btn {
        height:30px; padding: 0 10px; border-radius:6px; border:none;
        font-size:11px; font-weight:800; cursor:pointer;
        display:inline-flex; align-items:center; gap:5px;
      }
      .dpp-btn:disabled { opacity:0.5; cursor:not-allowed; }
      .dpp-btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); flex:1; justify-content:center; }
      .dpp-btn-ghost { background: hsl(var(--card)); color: hsl(var(--foreground)); border:1px solid hsl(var(--border)); }

      .dpp-viewport {
        flex:1; min-height: 360px;
        background: hsl(var(--muted) / 0.4);
        display:flex; justify-content:stretch; align-items:stretch;
      }
      .dpp-iframe {
        flex:1; width:100%; height:100%;
        border: 0; background: #fff;
      }
      .dpp-empty {
        flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap: 8px; padding: 40px 14px; text-align:center;
        color: hsl(var(--muted-foreground));
      }
      .dpp-empty-ic { opacity: 0.25; }
      .dpp-empty-title { font-weight:800; font-size:13px; color: hsl(var(--foreground)); }
      .dpp-empty-sub { font-size:11px; }
    `}</style>
  );
}
