// قالب طباعة احترافي A4 لتقارير الترحيل والتغليف
// يُستخدم للفاتورة وعرض السعر بنفس النمط البصري لقالب الفواتير العادية

interface CompanyInfo {
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  currency?: string;
  logo_url?: string;
}

interface DocInfo {
  id?: string;
  number?: string | number;
  date?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
}

interface TransportRow {
  transporter?: string;
  destination?: string;
  date?: string;
  vehicle?: string;
  driver?: string;
  cost?: number;
  notes?: string;
}

interface PackagingRow {
  type?: string;
  product?: string;
  quantity?: number;
  packs_count?: number;
  pieces_per_pack?: number;
  weight?: number | string;
  dimensions?: string;
  cost?: number;
  notes?: string;
}

export interface TransportReportData {
  docType: "invoice" | "quote";
  doc: DocInfo;
  company?: CompanyInfo | null;
  rows: TransportRow[];
}

export interface PackagingReportData {
  docType: "invoice" | "quote";
  doc: DocInfo;
  company?: CompanyInfo | null;
  rows: PackagingRow[];
}

const esc = (s: any) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const LOGO_FALLBACK = "https://vifrecsqxdbwqtcfkdyb.supabase.co/storage/v1/object/public/company-assets/logo.png";

const baseStyles = (accent: string) => `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .total-row, .summary-box, .signatures, .sig-box { page-break-inside: avoid; break-inside: avoid; }
  @media print { body { padding: 0; } .page { max-width: none; } }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color:#1a1a1a; background:#fff; padding:20px; line-height:1.5; font-size:14px; }
  .page { max-width: 800px; margin: 0 auto; }
  .header { text-align:center; padding-bottom:10px; border-bottom: 3px solid ${accent}; margin-bottom:10px; }
  .header-logos { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .header-logo img { height:75px; object-fit:contain; }
  .header-title { font-size:22px; font-weight:900; color:#c0392b; margin-bottom:4px; }
  .header-address { font-size:13px; color:#333; line-height:1.6; }
  .header-phones { font-size:14px; font-weight:700; color:#1a1a1a; margin-top:2px; }
  .doc-title { text-align:center; margin: 14px 0 10px; }
  .doc-title h1 { font-size:22px; color:#2c3e50; font-weight:800; display:inline-block; border-bottom:3px solid ${accent}; padding-bottom:3px; }
  .info-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:14px; }
  .info-row .right, .info-row .left { display:flex; gap:8px; }
  .info-label { color:#1a1a1a; font-weight:700; }
  .info-value { color:#c0392b; font-weight:700; }
  .info-value-blue { color:#2980b9; font-weight:800; }
  table { width:100%; border-collapse:collapse; margin: 12px 0; border:2px solid #1a1a1a; }
  thead th { background:${accent}; color:#fff; padding:8px 10px; font-size:13px; font-weight:700; text-align:center; border:1px solid #1a1a1a; }
  tbody td { padding:7px 10px; text-align:center; font-size:13px; border:1px solid #999; }
  tbody tr:nth-child(even) { background:#f8f8f8; }
  .total-row td { font-weight:800; font-size:14px; border:2px solid #1a1a1a; background:#f0f0f0; }
  .product-name { text-align:right; font-weight:600; }
  .summary-box { border:2px solid ${accent}; border-radius:6px; padding:12px 30px; text-align:center; min-width:260px; margin: 16px auto; }
  .summary-box-title { font-size:15px; font-weight:800; color:#1a1a1a; margin-bottom:4px; }
  .summary-box-value { font-size:22px; font-weight:900; color:${accent}; }
  .empty { text-align:center; padding:30px; color:#888; font-size:14px; background:#fafafa; border:1px dashed #ccc; border-radius:6px; }
  .signatures { display:flex; justify-content:space-between; padding:20px 50px 10px; margin-top:20px; }
  .sig-box { text-align:center; width:180px; }
  .sig-line { border-top:1px solid #999; margin-top:45px; padding-top:5px; font-size:12px; color:#555; font-weight:600; }
  @media print { body { padding:0; } }
`;

const headerHTML = (company?: CompanyInfo | null) => {
  const logo = company?.logo_url || LOGO_FALLBACK;
  return `
  <div class="header">
    <div class="header-logos">
      <div class="header-logo"><img src="${esc(logo)}" alt="Logo" /></div>
      <div>
        <div class="header-title">${esc(company?.company_name || "اولاد جابر لاسبيرات المواتر والتكاتك")}</div>
        <div class="header-address">${esc(company?.address || "")}</div>
        <div class="header-phones">${esc(company?.phone || "")}</div>
      </div>
      <div class="header-logo"><img src="${esc(logo)}" alt="Logo" /></div>
    </div>
  </div>`;
};

const infoRowsHTML = (doc: DocInfo, docType: "invoice" | "quote") => {
  const numLabel = docType === "invoice" ? "رقم الفاتورة" : "رقم عرض السعر";
  return `
  <div class="info-row">
    <div class="right">
      <span class="info-label">اسم العميل:</span>
      <span class="info-value">${esc(doc.customerName || "كاش")}</span>
    </div>
    <div class="left">
      <span class="info-label">التاريخ:</span>
      <span class="info-value">${esc(doc.date || "")}</span>
    </div>
  </div>
  <div class="info-row">
    <div class="right">
      ${doc.customerAddress ? `<span class="info-label">العنوان:</span><span class="info-value">${esc(doc.customerAddress)}</span>` : ""}
    </div>
    <div class="left">
      <span class="info-label">${numLabel}:</span>
      <span class="info-value-blue">${esc(doc.number || "")}</span>
    </div>
  </div>`;
};

const signaturesHTML = (kind: "transport" | "packaging") => `
  <div class="signatures">
    <div class="sig-box"><div class="sig-line">توقيع المستلم</div></div>
    <div class="sig-box"><div class="sig-line">${kind === "transport" ? "توقيع السائق / الناقل" : "توقيع المسؤول"}</div></div>
    <div class="sig-box"><div class="sig-line">ختم الشركة</div></div>
  </div>`;

export function generateTransportReportHTML(data: TransportReportData): string {
  const { docType, doc, company, rows } = data;
  const accent = "#16a34a";
  const total = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  const currency = "";
  const docLabel = docType === "invoice" ? "الفاتورة" : "عرض السعر";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير الترحيل ${esc(doc.number || "")}</title>
<style>${baseStyles(accent)}</style></head><body><div class="page">
${headerHTML(company)}
<div class="doc-title"><h1>تقرير ترحيل ${docLabel} رقم ${esc(doc.number || "")}</h1></div>
${infoRowsHTML(doc, docType)}

${rows.length === 0 ? `<div class="empty">لا توجد سجلات ترحيل لهذا ${docLabel}</div>` : `
<table>
  <thead>
    <tr>
      <th style="width:35px;">#</th>
      <th>الناقل</th>
      <th>الوجهة</th>
      <th style="width:90px;">التاريخ</th>
      <th style="width:90px;">المركبة</th>
      <th>السائق</th>
      <th style="width:100px;">التكلفة</th>
      <th>ملاحظات</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="product-name">${esc(r.transporter || "-")}</td>
        <td>${esc(r.destination || "-")}</td>
        <td>${esc(r.date || "-")}</td>
        <td>${esc(r.vehicle || "-")}</td>
        <td>${esc(r.driver || "-")}</td>
        <td style="font-weight:700;">${Number(r.cost || 0).toLocaleString()}</td>
        <td>${esc(r.notes || "-")}</td>
      </tr>`).join("")}
    <tr class="total-row">
      <td colspan="6" style="text-align:right; padding-right:15px;">إجمالي تكلفة الترحيل</td>
      <td>${total.toLocaleString()}</td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="summary-box">
  <div class="summary-box-title">إجمالي تكاليف الترحيل</div>
  <div class="summary-box-value">${currency} ${total.toLocaleString()}</div>
</div>
`}
${signaturesHTML("transport")}
</div></body></html>`;
}

export function generatePackagingReportHTML(data: PackagingReportData): string {
  const { docType, doc, company, rows } = data;
  const accent = "#0d9488";
  const total = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  const totalQty = rows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const currency = "";
  const docLabel = docType === "invoice" ? "الفاتورة" : "عرض السعر";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير تغليف ${docLabel} ${esc(doc.number || "")}</title>
<meta name="lov-doc-label" content="تقرير تغليف ${docLabel}">
<meta name="lov-doc-number" content="${esc(doc.number || "")}">
<meta name="lov-customer-name" content="${esc(doc.customerName || "")}">
<meta name="lov-wa-phone" content="${esc(doc.customerPhone || "")}">
<meta name="lov-doc-id" content="${esc(doc.id || "")}">
<meta name="lov-doc-share-type" content="${docType === "invoice" ? "packaging-invoice" : "packaging-quote"}">
<style>${baseStyles(accent)}</style></head><body><div class="page">
${headerHTML(company)}
<div class="doc-title"><h1>تقرير تغليف ${docLabel} رقم ${esc(doc.number || "")}</h1></div>
${infoRowsHTML(doc, docType)}

${rows.length === 0 ? `<div class="empty">لا توجد سجلات تغليف لهذا ${docLabel}</div>` : (() => {
  const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim() !== "-" && Number(v) !== 0;
  const hasWeight = rows.some((r) => hasVal(r.weight));
  const hasDimensions = rows.some((r) => hasVal(r.dimensions));
  const hasCost = rows.some((r) => Number(r.cost || 0) > 0);
  const hasNotes = rows.some((r) => hasVal(r.notes));
  const showSummaryBox = hasCost && total > 0;




  return `
<table>
  <thead>
    <tr>
      <th style="width:35px;" data-section="col-index" data-section-label="#">#</th>
      <th style="width:70px;" data-section="col-packs" data-section-label="العدد">العدد</th>
      <th data-section="col-product" data-section-label="نوع التغليف والصنف">نوع التغليف والصنف</th>
      ${hasWeight ? `<th style="width:80px;" data-section="col-weight" data-section-label="الوزن">الوزن</th>` : ""}
      ${hasDimensions ? `<th style="width:110px;" data-section="col-dimensions" data-section-label="الأبعاد">الأبعاد</th>` : ""}
      ${hasCost ? `<th style="width:100px;" data-section="col-cost" data-section-label="التكلفة">التكلفة</th>` : ""}
      ${hasNotes ? `<th data-section="col-notes" data-section-label="ملاحظات">ملاحظات</th>` : ""}
    </tr>
  </thead>
  <tbody>
    ${rows.map((r, i) => {
      const packs = Number(r.packs_count ?? 1);
      const pieces = Number(r.pieces_per_pack ?? r.quantity ?? 1);
      const typePart = r.type ? `<span style="font-weight:700;">${esc(r.type)}</span>` : "";
      const productPart = r.product ? ` ${esc(r.product)}` : "";
      const piecesPart = pieces > 1 ? ` <span style="color:#0d9488;font-weight:800;">— × ${pieces}</span>` : "";
      const productCell = `<span style="white-space:nowrap;">${typePart}${productPart}${piecesPart}</span>`;
      return `
      <tr>
        <td data-section="col-index">${i + 1}</td>
        <td data-section="col-packs">${packs}</td>
        <td class="product-name" data-section="col-product" style="text-align:right;">${productCell}</td>
        ${hasWeight ? `<td data-section="col-weight">${r.weight ? `${esc(r.weight)} كجم` : "-"}</td>` : ""}
        ${hasDimensions ? `<td data-section="col-dimensions">${esc(r.dimensions || "-")}</td>` : ""}
        ${hasCost ? `<td style="font-weight:700;" data-section="col-cost">${Number(r.cost || 0).toLocaleString()}</td>` : ""}
        ${hasNotes ? `<td data-section="col-notes">${esc(r.notes || "-")}</td>` : ""}
      </tr>`;
    }).join("")}
  </tbody>
</table>

${(() => {
  const totalPacks = rows.reduce((s, r) => s + Number(r.packs_count ?? 1), 0);
  return `
<table style="width:auto; margin: 12px 0 18px auto; border:2px solid #1a1a1a;">
  <thead>
    <tr>
      <th style="background:${accent}; color:#fff; border:1px solid #1a1a1a; padding:8px 16px; font-size:14px; min-width:140px;">عدد القطع</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="font-weight:900; font-size:18px; background:#f0f0f0; border:2px solid #1a1a1a; padding:10px 16px; text-align:center;">${totalPacks}</td>
    </tr>
  </tbody>
</table>`;
})()}

${showSummaryBox ? `<div class="summary-box">
  <div class="summary-box-title">إجمالي تكاليف التغليف</div>
  <div class="summary-box-value">${currency} ${total.toLocaleString()}</div>
</div>` : ""}
`;
})()}
${signaturesHTML("packaging")}
</div></body></html>`;
}

export function openReportPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
