// قالب طباعة التقارير المالية (الدخل/المصروفات/قائمة الدخل) — بنفس هوية قالب الفاتورة/كشف الحساب.
// يُفتح داخل iframe في صفحة FinancialReportPreviewPage.

export interface FinancialCompany {
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo_url?: string;
  tax_number?: string;
  currency?: string;
}

export interface FinancialReportColumn {
  key: string;
  label: string;
  align?: "right" | "left" | "center";
  /** عرض اختياري كنسبة (مثل "20%") */
  width?: string;
  /** هل هو عمود رقمي (يُنسَّق وقد يصبغ بلون مختلف) */
  numeric?: boolean;
}

export interface FinancialReportSection {
  /** مفتاح للقسم (يُستخدم كـ data-section) */
  key: string;
  /** عنوان للقسم */
  label: string;
  columns: FinancialReportColumn[];
  rows: Array<Record<string, any>>;
  /** مجموع اختياري يُعرض في صف الإجمالي */
  totals?: Partial<Record<string, number | string>>;
  /** لون رأس الجدول (افتراضي: بنفسجي NEOBILLING) */
  headerColor?: string;
}

export interface FinancialReportSummary {
  label: string;
  value: number | string;
  color?: "green" | "red" | "blue" | "purple";
}

export interface FinancialReportData {
  title: string;
  subtitle?: string;
  fromDate?: string;
  toDate?: string;
  company?: FinancialCompany | null;
  /** صناديق الملخّص أعلى التقرير */
  summary?: FinancialReportSummary[];
  /** الأقسام (الجداول) */
  sections: FinancialReportSection[];
  /** ملاحظات اختيارية */
  notes?: string;
  /** عملة افتراضية تظهر بجانب الأرقام في رسالة واتساب */
  currency?: string;
}

import { resolveLogoUrl } from "@/utils/albatoolLogo";

const fmt = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
};

const colorFor = (c?: string): string => {
  switch (c) {
    case "green": return "#16a34a";
    case "red": return "#dc2626";
    case "blue": return "#2980b9";
    case "purple": return "#5b2c8e";
    default: return "#1a1a1a";
  }
};

export function generateFinancialReportHTML(data: FinancialReportData): string {
  const esc = (v: any) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const { title, subtitle, fromDate, toDate, company, summary = [], sections, notes, currency } = data;
  const logoURL = resolveLogoUrl(company?.logo_url);
  const periodTxt =
    fromDate || toDate
      ? `${fromDate ? `من ${fromDate}` : ""}${fromDate && toDate ? " " : ""}${toDate ? `إلى ${toDate}` : ""}`
      : "";

  // ===== رسالة واتساب =====
  const toAr = (s: string | number) =>
    String(s).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const waLines: string[] = [];
  waLines.push(`📄 *${title}*`);
  if (periodTxt) waLines.push(`🗓️ ${toAr(periodTxt)}`);
  waLines.push("———————————————");
  summary.forEach((s) => {
    waLines.push(`• ${s.label}: *${typeof s.value === "number" ? toAr(fmt(s.value)) : s.value}* ${currency || ""}`.trim());
  });
  waLines.push("———————————————");
  if (company?.company_name) waLines.push(`🏢 ${company.company_name}`);
  if (company?.phone) waLines.push(`☎️ ${toAr(company.phone)}`);
  const waText = waLines.join("\n");
  const waTextAttr = waText
    .replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;");

  const summaryHTML = summary.length
    ? `<div class="summary-row" data-section="summary" data-section-label="ملخّص">
${summary.map((s) => `  <div class="summary-box">
    <div class="summary-box-title">${esc(s.label)}</div>
    <div class="summary-box-value" style="color:${colorFor(s.color)};">${typeof s.value === "number" ? fmt(s.value) : esc(s.value)}</div>
  </div>`).join("\n")}
</div>`
    : "";

  const sectionsHTML = sections.map((sec) => {
    const headerBg = sec.headerColor || "#5b2c8e";
    const colsHead = sec.columns.map((c) =>
      `<th style="width:${c.width || "auto"}; text-align:${c.align || "center"};">${esc(c.label)}</th>`
    ).join("");
    const body = sec.rows.length
      ? sec.rows.map((r) => `<tr>${sec.columns.map((c) => {
          const raw = r[c.key];
          const val = c.numeric ? fmt(typeof raw === "number" ? raw : Number(raw || 0)) : fmt(raw);
          return `<td style="text-align:${c.align || (c.numeric ? "center" : "right")};">${esc(val)}</td>`;
        }).join("")}</tr>`).join("")
      : `<tr><td colspan="${sec.columns.length}" style="text-align:center;color:#888;padding:14px;">لا توجد بيانات</td></tr>`;
    const totalsRow = sec.totals
      ? `<tr class="total-row">${sec.columns.map((c, idx) => {
          const v = sec.totals?.[c.key];
          if (idx === 0 && v === undefined) return `<td style="text-align:right;padding-right:12px;">الإجمالي</td>`;
          if (v === undefined) return `<td></td>`;
          return `<td style="text-align:${c.align || "center"};">${typeof v === "number" ? fmt(v) : esc(v)}</td>`;
        }).join("")}</tr>`
      : "";
    return `<div data-section="${esc(sec.key)}" data-section-label="${esc(sec.label)}" class="section-block">
  <div class="section-title" style="border-color:${headerBg};color:${headerBg};">${esc(sec.label)}</div>
  <table>
    <thead><tr style="background:${headerBg};">${colsHead}</tr></thead>
    <tbody>${body}${totalsRow}</tbody>
  </table>
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="lov-wa-text" content='${waTextAttr}'>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .section-block, .summary-row, .summary-box, .total-row, .notes-section { page-break-inside: avoid; break-inside: avoid; }
  @media print { body { padding: 0; } .page { max-width: none; } }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1a1a1a; background: #fff; padding: 20px; line-height: 1.5; font-size: 14px;
  }
  .page { max-width: 820px; margin: 0 auto; }

  .header {
    background: linear-gradient(135deg, #5b2c8e, #7e3eb5);
    color: #fff; border-radius: 12px; padding: 16px 20px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    box-shadow: 0 4px 14px rgba(91,44,142,0.2);
  }
  .header img.logo {
    height: 64px; width: 64px; object-fit: contain;
    background: #fff; border-radius: 10px; padding: 4px;
  }
  .header .company { flex: 1; min-width: 200px; }
  .header .company h2 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
  .header .meta { font-size: 12px; opacity: 0.92; line-height: 1.6; }
  .header .title-box {
    text-align: center; padding: 8px 16px;
    background: rgba(255,255,255,0.14); border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.25); min-width: 200px;
  }
  .header .title-box .t { font-size: 16px; font-weight: 800; }
  .header .title-box .st { font-size: 12px; opacity: 0.9; margin-top: 2px; }
  .header .title-box .pd { font-size: 11px; opacity: 0.85; margin-top: 4px; }

  .summary-row { display: flex; gap: 10px; margin: 12px 0 16px; flex-wrap: wrap; }
  .summary-box {
    flex: 1; min-width: 150px; padding: 12px;
    border: 2px solid #5b2c8e; border-radius: 8px; text-align: center; background: #faf8ff;
  }
  .summary-box-title { font-size: 12px; color: #555; margin-bottom: 4px; }
  .summary-box-value { font-size: 20px; font-weight: 800; }

  .section-block { margin-top: 18px; }
  .section-title {
    font-size: 14px; font-weight: 800; padding: 6px 10px;
    border-right: 4px solid #5b2c8e; background: #f6f1fb; margin-bottom: 6px;
  }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { color: #fff; padding: 8px 6px; font-weight: 700; text-align: center; border: 1px solid rgba(0,0,0,0.08); }
  td { padding: 7px 6px; border: 1px solid #e5e5e5; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  tr.total-row td { background: #efeaf5; font-weight: 800; color: #5b2c8e; }

  .notes-section {
    margin-top: 16px; padding: 10px;
    background: #fff8e1; border-right: 4px solid #f59e0b; border-radius: 4px;
  }
  .notes-section h4 { color: #92400e; margin-bottom: 4px; font-size: 13px; }
  .notes-section p { font-size: 13px; color: #444; white-space: pre-wrap; }

  .signatures { display: flex; justify-content: space-between; margin-top: 30px; gap: 40px; }
  .sig-box { flex: 1; text-align: center; }
  .sig-line { border-top: 1px solid #555; padding-top: 6px; font-size: 12px; color: #555; }

  [data-section].__lov_hidden { display: none !important; }

  @media print {
    body { background: #fff !important; }
    .header { background: #5b2c8e !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

<div class="header" data-section="header" data-section-label="الترويسة">
  <img src="${esc(logoURL)}" alt="logo" class="logo" onerror="this.style.display='none'"/>
  <div class="company">
    <h2>${esc(company?.company_name || "اسم الشركة")}</h2>
    <div class="meta">
      ${company?.phone ? `<div>📞 ${esc(company.phone)}</div>` : ""}
      ${company?.email ? `<div>✉️ ${esc(company.email)}</div>` : ""}
      ${company?.address ? `<div>📍 ${esc(company.address)}</div>` : ""}
      ${company?.tax_number ? `<div>🧾 الرقم الضريبي: ${esc(company.tax_number)}</div>` : ""}
    </div>
  </div>
  <div class="title-box">
    <div class="t">${esc(title)}</div>
    ${subtitle ? `<div class="st">${esc(subtitle)}</div>` : ""}
    ${periodTxt ? `<div class="pd">📅 ${esc(periodTxt)}</div>` : ""}
  </div>
</div>

${summaryHTML}
${sectionsHTML}

${notes ? `<div class="notes-section" data-section="notes" data-section-label="الملاحظات">
  <h4>📝 ملاحظات</h4><p>${esc(notes)}</p>
</div>` : ""}

<div class="signatures" data-section="signatures" data-section-label="التوقيعات">
  <div class="sig-box"><div class="sig-line">المحاسب</div></div>
  <div class="sig-box"><div class="sig-line">المدير المالي</div></div>
</div>

</div>
</body>
</html>`;
}
