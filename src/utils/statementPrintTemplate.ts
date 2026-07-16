// قالب طباعة كشف الحساب (عميل / مورد) — بنفس شكل وهوية قالب الفاتورة
// ويُفتح عبر openPrintWindow الموجودة في printTemplate.ts كي يحصل تلقائياً
// على شريط الأدوات العلوي: طباعة + تحميل PDF + مشاركة PDF عبر واتساب +
// مشاركة نص واتساب + تخصيص رؤية الأقسام (👁️).

interface StatementCompany {
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo_url?: string;
  currency?: string;
}

interface StatementParty {
  id?: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  balance?: number;
  credit_balance?: number;
  net_balance?: number;
}

export interface StatementInvoiceRow {
  invoice_number: string;
  date: string;
  total: number;
  paid_amount: number;
  status?: string;
}

export interface StatementOrderRow {
  order_number: string;
  date: string;
  total: number;
  status?: string;
}

export interface StatementTxnRow {
  date: string;
  type?: string;
  amount: number;
  description?: string;
}

export interface StatementData {
  kind: "customer" | "supplier";
  party: StatementParty;
  company?: StatementCompany | null;
  fromDate?: string;
  toDate?: string;
  invoices?: StatementInvoiceRow[];
  orders?: StatementOrderRow[];
  transactions?: StatementTxnRow[];
  totals: {
    invoicesTotal?: number;
    paidTotal?: number;
    remaining?: number;
    ordersTotal?: number;
    balance?: number;
  };
  notes?: string;
}

import { resolveLogoUrl } from "@/utils/albatoolLogo";

function fmt(n: number | undefined | null): string {
  return Number(n || 0).toLocaleString();
}

export function generateStatementHTML(data: StatementData): string {
  const esc = (v: any) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const { kind, party, company, fromDate, toDate, invoices = [], orders = [], transactions = [], totals, notes } = data;
  const logoURL = resolveLogoUrl(company?.logo_url);
  const title = kind === "customer" ? "كشف حساب عميل" : "كشف حساب مورد";
  const partyLabel = kind === "customer" ? "العميل" : "المورد";

  const periodTxt =
    fromDate || toDate
      ? `${fromDate ? `من ${fromDate}` : ""}${fromDate && toDate ? " " : ""}${toDate ? `إلى ${toDate}` : ""}`
      : "كل الفترة";

  // ===== رسالة واتساب — تنسيق موحّد ثابت لعميل/مورد بأرقام عربية =====
  const toArabicDigits = (s: string | number) =>
    String(s).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const fmtAr = (n: number | undefined | null) => toArabicDigits(fmt(n));
  const periodAr = toArabicDigits(periodTxt);
  const currency = company?.currency || "";

  // الرصيد الموحّد + حالته (مدين/دائن/مُسوّى) — مصدر واحد: netBalanceOf
  // يضمن تطابق الرقم المطبوع/المُشارك مع ما يظهر في شاشة كشف الحساب
  // بعد تقريب DB وحسابات UI.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { netBalanceOf } = require("@/utils/balanceDisplay") as typeof import("@/utils/balanceDisplay");
  const balanceVal =
    kind === "customer"
      ? netBalanceOf(party as any)
      : typeof party.balance === "number"
        ? party.balance
        : Number(totals.balance || 0);
  const balanceState =
    Math.abs(balanceVal) < 0.01
      ? "✅ مُسوّى"
      : balanceVal > 0
        ? (kind === "customer" ? "🔴 مدين (متبقي عليه)" : "🔴 مستحق للمورد")
        : "🟢 دائن (رصيد لصالحه)";
  const balanceAbsAr = fmtAr(Math.abs(balanceVal));

  const waLines: string[] = [];
  waLines.push(`📄 *${title}*`);
  waLines.push("———————————————");
  waLines.push(`👤 ${partyLabel}: *${party.name}*`);
  
  waLines.push(`🗓️ الفترة: ${periodAr}`);
  waLines.push("———————————————");
  waLines.push(`📊 *ملخّص الحساب*`);
  if (kind === "customer") {
    waLines.push(`🧾 إجمالي الفواتير: *${fmtAr(totals.invoicesTotal)}* ${currency}`.trim());
    waLines.push(`✅ المدفوع: *${fmtAr(totals.paidTotal)}* ${currency}`.trim());
    waLines.push(`⚠️ المتبقي: *${fmtAr(totals.remaining)}* ${currency}`.trim());
    waLines.push(`💼 عدد الفواتير: ${toArabicDigits(invoices.length)}`);
  } else {
    waLines.push(`🛒 إجمالي أوامر الشراء: *${fmtAr(totals.ordersTotal)}* ${currency}`.trim());
    waLines.push(`💼 عدد الأوامر: ${toArabicDigits(orders.length)}`);
  }
  if (transactions.length) {
    waLines.push(`💳 عدد المعاملات: ${toArabicDigits(transactions.length)}`);
  }
  waLines.push("———————————————");
  waLines.push(`💰 *الرصيد الحالي: ${balanceAbsAr} ${currency}*`.trim());
  waLines.push(`📌 الحالة: ${balanceState}`);
  waLines.push("———————————————");
  if (company?.company_name) waLines.push(`🏢 ${company.company_name}`);
  if (company?.phone) waLines.push(`☎️ ${toArabicDigits(company.phone)}`);
  waLines.push(`🙏 شكراً لتعاملكم معنا`);
  const waText = waLines.join("\n");
  // escape for HTML attribute (single-quoted attr below)
  const waTextAttr = waText
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "&#10;");
  const waPhoneAttr = (party.phone || "").replace(/[^0-9]/g, "");

  // ===== جدول الفواتير (للعميل) =====
  const invoicesTable =
    kind === "customer" && invoices.length
      ? `
<table data-section="invoices" data-section-label="الفواتير">
  <thead>
    <tr>
      <th style="width:40px;">#</th>
      <th>رقم الفاتورة</th>
      <th>التاريخ</th>
      <th>الإجمالي</th>
      <th>المدفوع</th>
      <th>المتبقي</th>
    </tr>
  </thead>
  <tbody>
    ${invoices
      .map(
        (inv, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(inv.invoice_number)}</td>
        <td>${esc(inv.date)}</td>
        <td>${fmt(inv.total)}</td>
        <td style="color:#16a34a;">${fmt(inv.paid_amount)}</td>
        <td style="color:#dc2626;font-weight:700;">${fmt(Number(inv.total) - Number(inv.paid_amount))}</td>
      </tr>`
      )
      .join("")}
    <tr class="total-row">
      <td colspan="3" style="text-align:right; padding-right:15px;">الإجمالي</td>
      <td>${fmt(totals.invoicesTotal)}</td>
      <td style="color:#16a34a;">${fmt(totals.paidTotal)}</td>
      <td style="color:#dc2626;">${fmt(totals.remaining)}</td>
    </tr>
  </tbody>
</table>`
      : "";

  // ===== جدول أوامر الشراء (للمورد) =====
  const ordersTable =
    kind === "supplier" && orders.length
      ? `
<table data-section="orders" data-section-label="أوامر الشراء">
  <thead>
    <tr>
      <th style="width:40px;">#</th>
      <th>رقم الأمر</th>
      <th>التاريخ</th>
      <th>الإجمالي</th>
      <th>الحالة</th>
    </tr>
  </thead>
  <tbody>
    ${orders
      .map(
        (o, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(o.order_number)}</td>
        <td>${esc(o.date)}</td>
        <td>${fmt(o.total)}</td>
        <td>${esc(o.status || "-")}</td>
      </tr>`
      )
      .join("")}
    <tr class="total-row">
      <td colspan="3" style="text-align:right; padding-right:15px;">الإجمالي</td>
      <td>${fmt(totals.ordersTotal)}</td>
      <td></td>
    </tr>
  </tbody>
</table>`
      : "";

  // ===== جدول المعاملات =====
  const txnTable = transactions.length
    ? `
<table data-section="transactions" data-section-label="المعاملات">
  <thead>
    <tr>
      <th style="width:40px;">#</th>
      <th>التاريخ</th>
      <th>النوع</th>
      <th>المبلغ</th>
      <th>الوصف</th>
    </tr>
  </thead>
  <tbody>
    ${transactions
      .map(
        (t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(t.date)}</td>
        <td>${esc(t.type === "income" ? "إيراد" : t.type === "expense" ? "مصروف" : t.type || "-")}</td>
        <td>${fmt(t.amount)}</td>
        <td>${esc(t.description || "-")}</td>
      </tr>`
      )
      .join("")}
  </tbody>
</table>`
    : "";

  // ===== صناديق الملخّص =====
  const summaryBoxes =
    kind === "customer"
      ? `
<div class="summary-row" data-section="summary" data-section-label="ملخص الحساب">
  <div class="summary-box">
    <div class="summary-box-title">إجمالي الفواتير</div>
    <div class="summary-box-value blue">${fmt(totals.invoicesTotal)}</div>
  </div>
  <div class="summary-box">
    <div class="summary-box-title">المدفوع</div>
    <div class="summary-box-value" style="color:#16a34a;">${fmt(totals.paidTotal)}</div>
  </div>
  <div class="summary-box" style="border-color:#dc2626;">
    <div class="summary-box-title">المتبقي</div>
    <div class="summary-box-value red" data-print-total>${fmt(totals.remaining)}</div>
  </div>
</div>`
      : `
<div class="summary-row" data-section="summary" data-section-label="ملخص الحساب">
  <div class="summary-box">
    <div class="summary-box-title">إجمالي أوامر الشراء</div>
    <div class="summary-box-value blue">${fmt(totals.ordersTotal)}</div>
  </div>
  <div class="summary-box" style="border-color:#2980b9;">
    <div class="summary-box-title">الرصيد</div>
    <div class="summary-box-value blue" data-print-total>${fmt(totals.balance)}</div>
  </div>
</div>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>${esc(title)} - ${esc(party.name)}</title>
<meta name="lov-wa-text" content='${waTextAttr}'>
<meta name="lov-wa-phone" content='${waPhoneAttr}'>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .total-row, .summary-row, .summary-box { page-break-inside: avoid; break-inside: avoid; }
  @media print { body { padding: 0; } .page { max-width: none; } }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1a1a1a; background: #fff; padding: 20px; line-height: 1.5;
    font-size: 14px;
  }
  .page { max-width: 800px; margin: 0 auto; }

  .header {
    text-align: center; padding-bottom: 10px;
    border-bottom: 3px solid #4a7c59;
    margin-bottom: 10px; position: relative;
  }
  .header-logos {
    display: flex; justify-content: space-between; align-items: center; gap: 15px;
  }
  .header-logo img { width: 70px; height: 70px; object-fit: contain; }
  .header-title { font-size: 22px; font-weight: 800; color: #4a7c59; }
  .header-address, .header-phones { font-size: 12px; color: #555; margin-top: 2px; }

  .doc-title { text-align: center; margin: 14px 0 10px; }
  .doc-title h1 {
    display: inline-block; font-size: 20px; font-weight: 800;
    color: #fff; background: #4a7c59; padding: 6px 22px; border-radius: 6px;
  }

  .info-row {
    display: flex; justify-content: space-between; align-items: center;
    margin: 6px 0; font-size: 13px;
  }
  .info-label { font-weight: 700; color: #555; margin-inline-end: 6px; }
  .info-value { color: #1a1a1a; font-weight: 600; }
  .info-value-blue { color: #2980b9; font-weight: 800; }

  table {
    width: 100%; border-collapse: collapse; margin: 12px 0;
    font-size: 13px;
  }
  th {
    background: #4a7c59; color: #fff; padding: 8px 6px;
    font-weight: 700; text-align: center; border: 1px solid #4a7c59;
  }
  td {
    padding: 7px 6px; border: 1px solid #ddd; text-align: center;
  }
  tbody tr:nth-child(even) { background: #f8faf8; }
  .product-name { text-align: right; font-weight: 600; }
  tr.total-row td {
    background: #eef5ee; font-weight: 800; color: #4a7c59;
  }

  .summary-row {
    display: flex; gap: 10px; margin: 12px 0; flex-wrap: wrap;
  }
  .summary-box {
    flex: 1; min-width: 150px; padding: 10px;
    border: 2px solid #4a7c59; border-radius: 8px; text-align: center;
    background: #fafffa;
  }
  .summary-box-title { font-size: 12px; color: #555; margin-bottom: 4px; }
  .summary-box-value { font-size: 18px; font-weight: 800; color: #1a1a1a; }
  .summary-box-value.red { color: #dc2626; }
  .summary-box-value.blue { color: #2980b9; }

  .notes-section {
    margin-top: 14px; padding: 10px;
    background: #fff8e1; border-right: 4px solid #f59e0b; border-radius: 4px;
  }
  .notes-section h4 { color: #92400e; margin-bottom: 4px; font-size: 13px; }
  .notes-section p { font-size: 13px; color: #444; white-space: pre-wrap; }

  .signatures {
    display: flex; justify-content: space-between; margin-top: 30px; gap: 40px;
  }
  .sig-box { flex: 1; text-align: center; }
  .sig-line {
    border-top: 1px solid #555; padding-top: 6px;
    font-size: 12px; color: #555;
  }

  [data-section].__lov_hidden { display: none !important; }
</style>
</head>
<body>
<div class="page">

<div class="header" data-section="header" data-section-label="الترويسة">
  <div class="header-logos">
    <div class="header-logo"><img src="${esc(logoURL)}" alt="Logo" /></div>
    <div>
      <div class="header-title">${esc(company?.company_name || "الشركة")}</div>
      <div class="header-address">${esc(company?.address || "")}</div>
      <div class="header-phones">${esc(company?.phone || "")}</div>
    </div>
    <div class="header-logo"><img src="${esc(logoURL)}" alt="Logo" /></div>
  </div>
</div>

<div class="doc-title">
  <h1>${esc(title)}</h1>
</div>

<div class="info-row" data-section="party-info" data-section-label="بيانات ${partyLabel}">
  <div>
    <span class="info-label">${esc(partyLabel)}:</span>
    <span class="info-value">${esc(party.name)}</span>
  </div>
  <div>
    <span class="info-label">الفترة:</span>
    <span class="info-value">${esc(periodTxt)}</span>
  </div>
</div>
<div class="info-row" data-section="party-contact" data-section-label="تفاصيل الاتصال">
  <div>
    ${party.address ? `<span class="info-label">العنوان:</span><span class="info-value">${esc(party.address)}</span>` : ""}
  </div>
  <div>
    ${typeof party.balance === "number" ? `<span class="info-label">الرصيد الحالي:</span><span class="info-value-blue">${fmt(party.balance)}</span>` : ""}
  </div>
</div>

${summaryBoxes}

${invoicesTable}
${ordersTable}
${txnTable}

${
  notes
    ? `
<div class="notes-section" data-section="notes" data-section-label="الملاحظات">
  <h4>📝 ملاحظات</h4>
  <p>${esc(notes)}</p>
</div>`
    : ""
}

<div class="signatures">
  <div class="sig-box"><div class="sig-line">توقيع ${esc(partyLabel)}</div></div>
  <div class="sig-box"><div class="sig-line">توقيع المسؤول</div></div>
</div>

</div>
</body>
</html>`;
}
