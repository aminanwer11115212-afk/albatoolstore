import { supabase } from "@/integrations/supabase/client";
import { openWhatsApp } from "@/utils/whatsapp";

export interface UnavailableItemRow {
  product_name: string;
  quantity?: number | null;
  unit?: string | null;
}

export interface UnavailableShareOpts {
  isInvoice: boolean;
  docId: string;
  docNumber?: string;
  customerName?: string;
  customerPhone?: string;
  date?: string;
  rows: UnavailableItemRow[];
  company?: { company_name?: string; phone?: string; address?: string; logo_url?: string } | null;
}

/**
 * نص رسالة واتساب لإبلاغ العميل بالأصناف غير المتوفرة من الفاتورة/عرض السعر.
 * ملاحظة الذاكرة: لا يظهر رقم هاتف العميل في النص. اسم العميل فقط.
 */
export function buildUnavailableItemsWhatsAppText(opts: {
  isInvoice: boolean;
  docNumber?: string;
  customerName?: string;
  rows: UnavailableItemRow[];
  companyName?: string;
}): string {
  const { isInvoice, docNumber, customerName, rows, companyName } = opts;
  const greeting = customerName ? `السلام عليكم ${customerName} 👋` : "السلام عليكم 👋";
  const docLabel = isInvoice
    ? `بخصوص الفاتورة رقم *#${docNumber || "-"}*`
    : `بخصوص عرض السعر رقم *#${docNumber || "-"}*`;
  const lines: string[] = [greeting, "", docLabel, "الأصناف التالية غير متوفرة حالياً:", ""];
  if (rows.length === 0) {
    lines.push("— لا توجد أصناف.");
  } else {
    rows.forEach((r, i) => {
      const qty = r.quantity != null ? Number(r.quantity).toLocaleString() : "-";
      const unit = r.unit ? ` ${r.unit}` : "";
      lines.push(`${i + 1}. ${r.product_name} — الكمية: *${qty}*${unit}`);
    });
  }
  lines.push("");
  lines.push("نرجو إفادتنا بالبدائل المناسبة، أو الموافقة على استبعادها من الطلب.");
  if (companyName) {
    lines.push("");
    lines.push(`— ${companyName}`);
  }
  return lines.join("\n");
}

function attr(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** قالب HTML قابل للطباعة لقائمة الأصناف غير المتوفرة. */
export function buildUnavailableItemsPrintHTML(opts: UnavailableShareOpts): string {
  const { isInvoice, docNumber, customerName, date, rows, company } = opts;
  const docTitle = isInvoice ? "أصناف غير متوفرة - فاتورة" : "أصناف غير متوفرة - عرض سعر";
  const logoURL = company?.logo_url || "";
  const logoHTML = logoURL
    ? `<div class="header-logo"><img src="${attr(logoURL)}" alt="Logo" /></div>`
    : "";

  const bodyHTML = rows.length === 0
    ? `<tr><td colspan="3" style="padding:18px;color:#666">لا توجد أصناف</td></tr>`
    : rows.map((r, i) => `<tr>
        <td style="width:35px;">${i + 1}</td>
        <td class="product-name">${attr(r.product_name) || "-"}</td>
        <td style="width:120px;font-weight:700;">${attr(r.quantity ?? "-")}${r.unit ? " " + attr(r.unit) : ""}</td>
      </tr>`).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(docTitle)} ${attr(docNumber || "")}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color:#1a1a1a; background:#fff; padding:20px; line-height:1.5; font-size:14px; }
  .toolbar { position: fixed; top: 0; right: 0; left: 0; z-index: 999; background: linear-gradient(135deg, #5b21b6, #7c3aed); color: #fff; padding: 10px; display: flex; justify-content: center; gap: 12px; }
  .toolbar button { background: #fff; color: #5b21b6; border: 0; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px; }
  .page { max-width: 800px; margin: 70px auto 0; }
  .header { text-align:center; padding-bottom:10px; border-bottom: 3px solid #c0392b; margin-bottom:10px; }
  .header-logos { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .header-logo img { height:75px; object-fit:contain; }
  .header-title { font-size:22px; font-weight:900; color:#c0392b; margin-bottom:4px; }
  .header-address { font-size:13px; color:#333; line-height:1.6; }
  .header-phones { font-size:14px; font-weight:700; color:#1a1a1a; margin-top:2px; }
  .doc-title { text-align:center; margin: 14px 0 10px; }
  .doc-title h1 { font-size:22px; color:#c0392b; font-weight:800; display:inline-block; border-bottom:3px solid #c0392b; padding-bottom:3px; }
  .info-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:14px; }
  .info-label { color:#1a1a1a; font-weight:700; }
  .info-value { color:#c0392b; font-weight:700; }
  table { width:100%; border-collapse:collapse; margin: 12px 0; border:2px solid #1a1a1a; }
  thead th { background:#c0392b; color:#fff; padding:8px 10px; font-size:13px; font-weight:700; text-align:center; border:1px solid #1a1a1a; }
  tbody td { padding:7px 10px; text-align:center; font-size:13px; border:1px solid #999; }
  tbody tr:nth-child(even) { background:#fdf6f6; }
  .product-name { text-align:right; font-weight:600; }
  .footer-note { margin: 20px 0 10px; padding: 12px; border:1px dashed #c0392b; background:#fdf6f6; border-radius:6px; text-align:center; font-weight:700; color:#7a1f1f; }
  @media print { .toolbar { display: none !important; } body { padding:0; } .page { margin-top: 0; } }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>
  <div class="page">
    <div class="header">
      <div class="header-logos">
        ${logoHTML}
        <div>
          <div class="header-title">${attr(company?.company_name || "")}</div>
          <div class="header-address">${attr(company?.address || "")}</div>
          <div class="header-phones">${attr(company?.phone || "")}</div>
        </div>
        ${logoHTML}
      </div>
    </div>
    <div class="doc-title"><h1>${attr(docTitle)} ${docNumber ? "رقم " + attr(docNumber) : ""}</h1></div>
    <div class="info-row">
      <div><span class="info-label">اسم العميل:</span> <span class="info-value">${attr(customerName || "—")}</span></div>
      <div><span class="info-label">التاريخ:</span> <span class="info-value">${attr(date || "")}</span></div>
    </div>
    <table>
      <thead><tr><th style="width:35px;">#</th><th>الصنف</th><th style="width:120px;">الكمية المطلوبة</th></tr></thead>
      <tbody>${bodyHTML}</tbody>
    </table>
    <div class="footer-note">نأسف لعدم توفر هذه الأصناف حالياً، نرجو إفادتنا بالبدائل المناسبة أو الموافقة على استبعادها من الطلب.</div>
  </div>
</body>
</html>`;
}

/** يفتح نافذة طباعة مع المحتوى. */
export function printUnavailableItems(opts: UnavailableShareOpts) {
  const html = buildUnavailableItemsPrintHTML(opts);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("الرجاء السماح بالنوافذ المنبثقة للطباعة");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** ينشئ رابط مشاركة عام (token) لقائمة الأصناف غير المتوفرة. */
export async function createUnavailableItemsShareLink(opts: {
  isInvoice: boolean;
  docId: string;
}): Promise<string> {
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
    body: JSON.stringify({
      doc_type: opts.isInvoice ? "unavailable-invoice" : "unavailable-quote",
      doc_id: opts.docId,
      ttl_hours: 168,
    }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error || "فشل إنشاء الرابط");
  return json.url as string;
}

/** يفتح واتساب برسالة تحوي قائمة الأصناف غير المتوفرة. */
export function shareUnavailableItemsViaWhatsApp(opts: UnavailableShareOpts) {
  const text = buildUnavailableItemsWhatsAppText({
    isInvoice: opts.isInvoice,
    docNumber: opts.docNumber,
    customerName: opts.customerName,
    rows: opts.rows,
    companyName: opts.company?.company_name,
  });
  // الهاتف يُستخدم لفتح المحادثة فقط ولا يظهر في النص.
  openWhatsApp(opts.customerPhone, text);
}
