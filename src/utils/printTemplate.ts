interface PrintItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount: number;
  total: number;
}

interface PrintData {
  type: "invoice" | "quote" | "purchase" | "return";
  isCash?: boolean;
  number?: string;
  date: string;
  
  dueDate?: string;
  customer?: { name: string; phone?: string; address?: string; company?: string; email?: string } | null;
  items: PrintItem[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  shipping?: number;
  grandTotal: number;
  paidAmount?: number;
  dueAmount?: number;
  notes?: string;
  status?: string;
  paymentMethod?: string;
  company?: {
    company_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    tax_number?: string;
    currency?: string;
    logo_url?: string;
    tax_rate?: number;
    website?: string;
    bank_name?: string;
    bank_account?: string;
    iban?: string;
  } | null;
  variant?: "full" | "no-account" | "account-only" | "no-details" | "stocktake";
  noHeader?: boolean;
  oldBalance?: number;
  packagingInfo?: string;
  transportInfo?: string;
  customTitle?: string;
  /** رصيد العميل المدين قبل هذه الفاتورة (لا يشمل متبقّي هذه الفاتورة). */
  previousDebt?: number;
  /** رصيد العميل الدائن قبل هذه الفاتورة. */
  previousCredit?: number;
  /** إخفاء صندوق "المبلغ المدفوع" في قسم ملخّص الحساب (يُستخدم في المعاينة). */
  hidePaidBox?: boolean;
}

import { resolveLogoUrl } from "@/utils/albatoolLogo";
import { computeDocumentBalance } from "@/utils/documentBalanceSummary";

function cleanExtraHTML(s?: string): string | undefined {
  if (!s) return undefined;
  // Strip dangerous constructs (script/style tags, inline event handlers,
  // javascript: URLs) before doing the formatting cleanup.
  const out = s
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<(div|span|p|section)[^>]*>\s*(<br\s*\/?>)?\s*<\/\1>/gi, "")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
    .replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, "")
    .trim();
  const textOnly = out.replace(/<[^>]+>/g, "").trim();
  return textOnly.length ? out : undefined;
}

export function generatePrintHTML(data: PrintData): string {
  const {
    type, isCash, number, date, dueDate, customer, items,
    subtotal, taxTotal, discountTotal, shipping = 0, grandTotal,
    paidAmount = 0, dueAmount = 0, notes, company, status, paymentMethod,
    variant = "full", noHeader = false, oldBalance = 0, packagingInfo, transportInfo, customTitle,
    previousDebt = 0, previousCredit = 0, hidePaidBox = false,
  } = data;

  const balSum = computeDocumentBalance({
    grandTotal, discount: discountTotal, paidAmount,
    previousDebt, previousCredit,
  });
  const fmt = (n: number) => Number(n || 0).toLocaleString();

  const title = variant === "stocktake"
    ? "كشف جرد"
    : (customTitle || (type === "invoice"
      ? (isCash ? "فاتورة كاش" : "فاتورة مبيعات")
      : type === "quote" ? "عرض سعر"
      : type === "return" ? "مرتجع مبيعات"
      : type === "purchase" ? "أمر شراء"
      : "فاتورة مشتريات"));

  const currency = "";
  // Header visibility is controlled solely by the explicit `noHeader` flag.
  const showHeader = noHeader !== true;
  const showItems = variant !== "account-only" && variant !== "no-details";
  const showAccount = variant !== "no-account" && variant !== "no-details" && variant !== "stocktake";
  // Packaging/transport block: hidden for account-only and no-details variants.
  const showExtras = variant !== "account-only" && variant !== "no-details" && variant !== "stocktake";
  const logoURL = resolveLogoUrl(company?.logo_url);
  // "المطلوب النهائي" = جملة الفاتورة − المبلغ المدفوع (لا يُجمع مع الحساب القديم).
  const finalTotal = Math.max(0, grandTotal - paidAmount);
  const cleanPackaging = cleanExtraHTML(packagingInfo);
  const cleanTransport = cleanExtraHTML(transportInfo);

  // Helper: escape value for safe insertion inside an HTML attribute (double-quoted)
  const attr = (v: string) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Helper: escape value for safe insertion as HTML body text
  const esc = (v: any) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="lov-doc-label" content="${attr(title)}">
<meta name="lov-doc-number" content="${attr(number || "")}">
<meta name="lov-customer-name" content="${attr(customer?.name || "")}">
<meta name="lov-wa-phone" content="">
<title>${esc(title)} ${esc(number || "")}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  /* Pagination across A4 pages for long tables */
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .total-row, .summary-row, .summary-box, .footer { page-break-inside: avoid; break-inside: avoid; }
  @media print { body { padding: 0; } .page { max-width: none; } }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1a1a1a; background: #fff; padding: 20px; line-height: 1.5;
    font-size: 14px;
  }

  .page { max-width: 800px; margin: 0 auto; }

  /* === HEADER === */
  .header {
    text-align: center; padding-bottom: 10px;
    border-bottom: 3px solid #4a7c59;
    margin-bottom: 10px; position: relative;
  }
  .header-logos {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 6px;
  }
  .header-logo img { height: 75px; object-fit: contain; }
  .header-title {
    font-size: 22px; font-weight: 900; color: #c0392b;
    margin-bottom: 4px;
  }
  .header-address {
    font-size: 13px; color: #333; line-height: 1.6;
  }
  .header-phones {
    font-size: 14px; font-weight: 700; color: #1a1a1a;
    margin-top: 2px;
  }
  .header-manager {
    font-size: 13px; color: #555; margin-top: 2px;
  }

  /* === DOC TITLE === */
  .doc-title {
    text-align: center; margin: 14px 0 10px;
  }
  .doc-title h1 {
    font-size: 22px; color: #2c3e50; font-weight: 800;
    display: inline-block; border-bottom: 3px solid #5b2c8e;
    padding-bottom: 3px;
  }

  /* === INFO ROW === */
  .info-row {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; font-size: 14px;
  }
  .info-row .right { display: flex; gap: 8px; }
  .info-row .left { display: flex; gap: 8px; }
  .info-label { color: #1a1a1a; font-weight: 700; }
  .info-value { color: #c0392b; font-weight: 700; }
  .info-value-blue { color: #2980b9; font-weight: 800; }

  /* === TABLE === */
  table {
    width: 100%; border-collapse: collapse; margin-bottom: 12px;
    border: 2px solid #1a1a1a;
  }
  thead th {
    background: #5b4cad; color: white;
    padding: 8px 10px; font-size: 13px; font-weight: 700;
    text-align: center; border: 1px solid #1a1a1a;
  }
  tbody td {
    padding: 7px 10px; text-align: center; font-size: 13px;
    border: 1px solid #999;
  }
  tbody tr:nth-child(even) { background: #f8f8f8; }
  .total-row td {
    font-weight: 800; font-size: 14px;
    border: 2px solid #1a1a1a; background: #f0f0f0;
  }
  .product-name { text-align: right; font-weight: 600; }

  /* === SUMMARY BOXES === */
  .summary-row {
    display: flex; justify-content: center; gap: 30px;
    margin: 16px 0;
  }
  .summary-box {
    border: 2px solid #1a1a1a; border-radius: 6px;
    padding: 12px 30px; text-align: center; min-width: 220px;
  }
  .summary-box-title {
    font-size: 15px; font-weight: 800; color: #1a1a1a;
    margin-bottom: 4px;
  }
  .summary-box-value {
    font-size: 20px; font-weight: 900;
  }
  .summary-box-value.red { color: #c0392b; }
  .summary-box-value.blue { color: #2980b9; }

  /* === PACKAGING & TRANSPORT === */
  .extra-row {
    display: flex; gap: 16px; margin: 16px 0;
  }
  .extra-box {
    flex: 1; border: 2px solid #999; border-radius: 6px;
    padding: 12px 16px; min-height: 80px;
  }
  .extra-box-title {
    font-size: 14px; font-weight: 800; color: #5b2c8e;
    border-bottom: 2px dashed #5b2c8e;
    padding-bottom: 4px; margin-bottom: 8px;
  }
  .extra-box p {
    font-size: 12px; color: #666;
  }

  /* === NOTES === */
  .notes-section {
    margin: 10px 0; padding: 8px 12px;
    background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;
  }
  .notes-section h4 { font-size: 13px; color: #92400e; font-weight: 700; margin-bottom: 3px; }
  .notes-section p { font-size: 12px; color: #78350f; }

  /* === SIGNATURES === */
  .signatures {
    display: flex; justify-content: space-between; padding: 20px 50px 10px;
    margin-top: 20px;
  }
  .sig-box { text-align: center; width: 150px; }
  .sig-line {
    border-top: 1px solid #999; margin-top: 45px; padding-top: 5px;
    font-size: 12px; color: #555; font-weight: 600;
  }

  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
<div class="page">

${showHeader ? `
<!-- Header -->
<div class="header" data-section="header" data-section-label="الترويسة">
  <div class="header-logos">
    <div class="header-logo"><img src="${logoURL}" alt="Logo" /></div>
    <div>
      <div class="header-title">${esc(company?.company_name || "اولاد جابر لاسبيرات المواتر والتكاتك")}</div>
      <div class="header-address">${esc(company?.address || "")}</div>
      <div class="header-phones">${esc(company?.phone || "")}</div>
    </div>
    <div class="header-logo"><img src="${logoURL}" alt="Logo" /></div>
  </div>
</div>
` : ""}

<!-- Document Title -->
<div class="doc-title">
  <h1>${esc(title)}</h1>
</div>

<!-- Info Row -->
<div class="info-row">
  <div class="right">
    <span class="info-label">اسم العميل:</span>
    <span class="info-value">${esc(customer?.name || "كاش")}</span>
  </div>
  <div class="left">
    <span class="info-label">التاريخ:</span>
    <span class="info-value">${date}</span>
  </div>
</div>
<div class="info-row">
  <div class="right">
    ${customer?.address ? `<span class="info-label">العنوان:</span><span class="info-value">${esc(customer.address)}</span>` : ""}
  </div>
  <div class="left">
    <span class="info-label">رقم ${type === "invoice" ? "الفاتورة" : type === "quote" ? "عرض السعر" : "المشتريات"}:</span>
    <span class="info-value-blue">${esc(number || "")}</span>
  </div>
</div>

${showItems ? (variant === "stocktake" ? `
<!-- Items Table (STOCKTAKE — quantity first + tick circle) -->
<table data-section="items" data-section-label="كشف الجرد">
  <thead>
    <tr>
      <th style="width:60px;">العدد</th>
      <th>اسم الصنف</th>
      <th style="width:90px;">السعر</th>
      <th style="width:110px;">الإجمالي</th>
      <th style="width:60px;">التجرد</th>
      <th style="width:35px;">#</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it, i) => `
      <tr>
        <td style="font-weight:800;font-size:14px;">${it.quantity}</td>
        <td class="product-name">${esc(it.product_name)}</td>
        <td>${(Number(it.unit_price) || 0).toLocaleString()}</td>
        <td style="font-weight:700;">${(Number(it.total) || 0).toLocaleString()}</td>
        <td style="text-align:center;"><span style="display:inline-block;width:18px;height:18px;border:1.5px solid #333;border-radius:50%;"></span></td>
        <td>${i + 1}</td>
      </tr>
    `).join("")}
    <tr class="total-row" data-section="grand-total" data-section-label="الإجمالي">
      <td colspan="3" style="text-align:right; padding-right:15px;">الإجمالي</td>
      <td style="font-weight:800;">${(Number(grandTotal) || 0).toLocaleString()}</td>
      <td colspan="2"></td>
    </tr>
  </tbody>
</table>
` : variant === "no-account" ? `
<!-- Items Table (NO PRICES — products only) -->
<table data-section="items" data-section-label="المنتجات">
  <thead>
    <tr>
      <th style="width:50px;">#</th>
      <th>اسم الصنف</th>
      <th style="width:120px;">الكمية</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="product-name">${esc(it.product_name)}</td>
        <td>${it.quantity}</td>
      </tr>
    `).join("")}
  </tbody>
</table>
` : `
<!-- Items Table -->
<table data-section="items" data-section-label="المنتجات">
  <thead>
    <tr>
      <th style="width:35px;">#</th>
      <th>اسم الصنف</th>
      <th style="width:80px;">الكمية</th>
      <th style="width:100px;">السعر</th>
      <th style="width:110px;">الإجمالي</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td class="product-name">${esc(it.product_name)}</td>
        <td>${it.quantity}</td>
        <td>${it.unit_price.toLocaleString()}</td>
        <td style="font-weight:700;">${it.total.toLocaleString()}</td>
      </tr>
    `).join("")}
    <tr class="total-row" data-section="grand-total" data-section-label="الجملة">
      <td colspan="2" style="text-align:right; padding-right:15px;">جملة ${type === "invoice" ? "الفاتورة" : type === "quote" ? "عرض السعر" : "المشتريات"}</td>
      <td></td>
      <td></td>
      <td>${(Number(subtotal) || (grandTotal + (Number(discountTotal) || 0))).toLocaleString()}</td>
    </tr>
  </tbody>
</table>
`) : ""}

${showAccount ? (() => {
  const prevNet = (Number(previousDebt) || 0) - (Number(previousCredit) || 0);
  const hasPrev = Math.abs(prevNet) > 0.01;
  const subtotalRow = Number(subtotal) || (grandTotal + (Number(discountTotal) || 0));
  const majmoo = grandTotal + prevNet; // جملة − خصم + حساب قديم (signed)
  const hasPaid = !hidePaidBox && paidAmount > 0.01;
  const finalNet = majmoo - paidAmount;
  return `
<!-- Financial Summary Rows (ordered: جملة → خصم → حساب قديم → المجموع → المدفوع → الإجمالي) -->
<table data-section="account-summary" data-section-label="ملخص الحساب" style="width:100%;margin-top:8px;border-collapse:collapse;font-size:13px;">
  <tbody>
    ${balSum.hasDiscount ? `
    <tr data-section="discount-row" data-section-label="الخصم">
      <td style="padding:6px 12px;text-align:right;color:#666;">الخصم</td>
      <td style="padding:6px 12px;text-align:left;font-weight:700;color:#dc2626;">− ${fmt(balSum.discount)}</td>
    </tr>` : ""}
    ${hasPrev ? `
    <tr data-section="prev-account-row" data-section-label="الحساب القديم">
      <td style="padding:6px 12px;text-align:right;color:#666;">الحساب القديم ${prevNet > 0 ? "(عليه)" : "(له)"}</td>
      <td style="padding:6px 12px;text-align:left;font-weight:700;color:${prevNet > 0 ? "#dc2626" : "#16a34a"};">${prevNet > 0 ? "+ " : "− "}${fmt(Math.abs(prevNet))}</td>
    </tr>` : ""}
    <tr data-section="majmoo-row" data-section-label="المجموع" style="border-top:1px solid #e5e7eb;">
      <td style="padding:8px 12px;text-align:right;font-weight:700;">المجموع</td>
      <td style="padding:8px 12px;text-align:left;font-weight:800;">${fmt(majmoo)}</td>
    </tr>
    ${hasPaid ? `
    <tr data-section="paid-row" data-section-label="المدفوع">
      <td style="padding:6px 12px;text-align:right;color:#666;">المدفوع</td>
      <td style="padding:6px 12px;text-align:left;font-weight:700;color:#16a34a;">− ${fmt(paidAmount)}</td>
    </tr>` : ""}
    <tr data-section="final-status" data-section-label="الإجمالي النهائي" style="border-top:2px solid #1f2937;">
      ${finalNet > 0.01 ? `
        <td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;">الإجمالي (عليه)</td>
        <td style="padding:10px 12px;text-align:left;font-weight:900;font-size:16px;color:#dc2626;">${fmt(finalNet)}</td>
      ` : finalNet < -0.01 ? `
        <td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;">الإجمالي (له)</td>
        <td style="padding:10px 12px;text-align:left;font-weight:900;font-size:16px;color:#16a34a;">${fmt(Math.abs(finalNet))}</td>
      ` : `
        <td colspan="2" style="padding:10px 12px;text-align:center;font-weight:900;font-size:15px;color:#16a34a;">✓ مسددة بالكامل</td>
      `}
    </tr>
  </tbody>
</table>
`;
})() : ""}

${showExtras ? `
<!-- Packaging & Transport -->
<div class="extra-row">
  <div class="extra-box" data-section="packaging" data-section-label="التغليف">
    <div class="extra-box-title">تفاصيل التغليف</div>
    <p>${cleanPackaging || "لا توجد بيانات تغليف لهذه الفاتورة"}</p>
  </div>
  <div class="extra-box" data-section="transport" data-section-label="الترحيلات">
    <div class="extra-box-title">معلومات الترحيل</div>
    <p>${cleanTransport || "لا توجد بيانات ترحيل لهذا الفاتورة"}</p>
  </div>
</div>
` : ""}

${notes ? `
<div class="notes-section" data-section="notes" data-section-label="الملاحظات">
  <h4>📝 ملاحظات</h4>
  <p>${esc(notes)}</p>
</div>
` : ""}

<!-- Signatures -->
<div class="signatures">
  <div class="sig-box"><div class="sig-line">توقيع المستلم</div></div>
  <div class="sig-box"><div class="sig-line">توقيع المسؤول</div></div>
</div>

</div>
</body>
</html>`;
}

/**
 * يفتح نافذة معاينة فيها التقرير + شريط أدوات علوي ثابت:
 *   • طباعة      → يفتح حوار الطباعة (المستخدم يختار الطابعة أو حفظ كـ PDF)
 *   • PDF        → ينزّل ملف PDF مباشرة (html2pdf)
 *   • واتساب PDF → يولّد PDF ويُشاركه عبر Web Share API (الجوال)، وإلا يحمّله ويفتح واتساب
 *   • واتساب نص  → يفتح واتساب برسالة ملخّصة
 */
/**
 * يبني الـHTML النهائي = (HTML المستند) + شريط أدوات المعاينة المحقون.
 * يُستخدم في:
 *   • openPrintWindow (نافذة منبثقة — السلوك القديم)
 *   • DocumentPreviewPage داخل iframe (الصفحة الداخلية الجديدة)
 *
 * inline=true: يستبدل زر "إغلاق ✕" برسالة postMessage('lov-preview-close')
 * بدلاً من window.close (المناسب فقط داخل popup).
 */
export function buildPrintWindowHtml(html: string, inline: boolean = false): string {
  // ===== استخراج معرّف المستخدم الحالي ليُستخدم كمفتاح حفظ مستقل لكل مستخدم =====
  let userKey = "anon";
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          const uid = parsed?.user?.id || parsed?.currentSession?.user?.id;
          if (uid) { userKey = String(uid); break; }
        }
      }
    }
  } catch { /* ignore */ }
  const userKeyAttr = userKey.replace(/[^a-zA-Z0-9_-]/g, "");

  // نحقن شريط أدوات + script للأزرار قبل </body>
  const toolbarHTML = `
<meta name="lov-print-user" content="${userKeyAttr}">

<style id="__lov_print_toolbar_css">
  #__lov_print_toolbar {
    position: fixed; top: 0; right: 0; left: 0; z-index: 999999;
    background: linear-gradient(135deg, #5b21b6, #7c3aed);
    color: #fff; padding: 8px 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: flex; flex-direction: column; gap: 6px;
    font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
    font-size: 13px;
  }
  #__lov_print_toolbar .row {
    display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; align-items: center;
  }
  #__lov_print_toolbar button {
    background: rgba(255,255,255,0.15);
    color: #fff; border: 1px solid rgba(255,255,255,0.25);
    padding: 6px 12px; border-radius: 6px; cursor: pointer;
    font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
    transition: background 0.15s;
  }
  #__lov_print_toolbar button:hover { background: rgba(255,255,255,0.28); }
  #__lov_print_toolbar button.close { background: rgba(0,0,0,0.25); }
  #__lov_print_toolbar button.toggle-off {
    background: rgba(0,0,0,0.35); opacity: 0.65;
    text-decoration: line-through;
  }
  #__lov_print_toolbar .label { font-weight: 700; margin-inline-end: 8px; opacity: 0.9; }
  #__lov_print_toolbar .divider {
    width: 100%; height: 1px; background: rgba(255,255,255,0.2);
  }
  body { padding-top: 96px !important; }
  /* hidden via toggle: hide on screen AND when printing/PDF */
  [data-section].__lov_hidden { display: none !important; }
  @media print {
    #__lov_print_toolbar, #__lov_print_toolbar_css { display: none !important; }
    body { padding-top: 0 !important; }
  }
</style>
<div id="__lov_print_toolbar" dir="rtl">
  <div class="row">
    <span class="label">📄 معاينة المستند</span>
    <button id="__btn_print" title="طباعة (Ctrl+P)">🖨️ طباعة</button>
    <button id="__btn_pdf" title="تحميل PDF">⬇️ تحميل PDF</button>
    <button id="__btn_wa_pdf" title="مشاركة PDF عبر واتساب">📱 واتساب PDF</button>
    <button id="__btn_link_online" title="إنشاء رابط معاينة للعميل">🔗 رابط للعميل</button>
    <button id="__btn_wa_text" title="مشاركة نصياً عبر واتساب">💬 واتساب نص</button>
    <button id="__btn_close" class="close" title="إغلاق">✕</button>
  </div>
  <div class="divider"></div>
  <div class="row" id="__lov_visibility_row">
    <span class="label">👁️ تخصيص الرؤية:</span>
    <!-- يُملأ ديناميكياً -->
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
(function(){
  function getMeta(name){
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? (m.getAttribute('content') || '') : '';
  }
  function getDocTitle(){
    var t = document.title || "document";
    return t.replace(/[^\\w\\u0600-\\u06FF\\-_. ]+/g, "").trim() || "document";
  }

  // ===== Visibility toggles per section (saved in localStorage per-user & per-doc-kind) =====
  function getUserKey(){
    var m = document.querySelector('meta[name="lov-print-user"]');
    return (m && m.getAttribute('content')) || 'anon';
  }
  function getDocKind(){
    // نستخرج "نوع المستند" من العنوان (قبل أول " - " أو "|")
    var t = (document.title || 'document').split(/\\s+[-|]\\s+/)[0].trim();
    return t.replace(/[^\\w\\u0600-\\u06FF]+/g, '_').slice(0, 40) || 'doc';
  }
  // مفتاح الحفظ خاص بكل مستند على حدة (فاتورة/عرض سعر) حتى لا تتأثر التقارير الأخرى.
  // يسقط إلى مستوى نوع المستند إن لم يتوفر معرّف.
  var DOC_ID = getMeta('lov-doc-id');
  var STORAGE_KEY = '__lov_print_visibility__:' + getUserKey() + ':' + getDocKind()
    + (DOC_ID ? (':' + DOC_ID) : '');
  function loadPrefs(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }
  function savePrefs(p){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch(e){}
  }
  var prefs = loadPrefs();

  function applyHidden(section, hidden){
    var nodes = document.querySelectorAll('[data-section="' + section + '"]');
    nodes.forEach(function(n){
      if (hidden) n.classList.add('__lov_hidden');
      else n.classList.remove('__lov_hidden');
    });
  }

  function buildVisibilityButtons(){
    var row = document.getElementById('__lov_visibility_row');
    if (!row) return;
    var seen = {};
    var sections = [];
    document.querySelectorAll('[data-section]').forEach(function(el){
      var key = el.getAttribute('data-section');
      if (!key || seen[key]) return;
      seen[key] = true;
      sections.push({
        key: key,
        label: el.getAttribute('data-section-label') || key
      });
    });
    sections.forEach(function(s){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-toggle-section', s.key);
      var hidden = !!prefs[s.key];
      btn.className = hidden ? 'toggle-off' : '';
      btn.innerHTML = (hidden ? '🚫 ' : '👁️ ') + s.label;
      btn.title = hidden ? 'إظهار: ' + s.label : 'إخفاء: ' + s.label;
      btn.onclick = function(){
        var nowHidden = !btn.classList.contains('toggle-off');
        if (nowHidden) {
          btn.classList.add('toggle-off');
          btn.innerHTML = '🚫 ' + s.label;
          btn.title = 'إظهار: ' + s.label;
          prefs[s.key] = true;
        } else {
          btn.classList.remove('toggle-off');
          btn.innerHTML = '👁️ ' + s.label;
          btn.title = 'إخفاء: ' + s.label;
          delete prefs[s.key];
        }
        applyHidden(s.key, nowHidden);
        savePrefs(prefs);
      };
      row.appendChild(btn);
      applyHidden(s.key, hidden);
    });
  }
  buildVisibilityButtons();

  function contentEl(){
    // كل ما عدا شريط الأدوات + استبعاد الأقسام المخفية حالياً
    var clone = document.body.cloneNode(true);
    var bar = clone.querySelector('#__lov_print_toolbar');
    if (bar) bar.remove();
    clone.querySelectorAll('.__lov_hidden').forEach(function(n){ n.remove(); });
    var wrap = document.createElement('div');
    wrap.appendChild(clone);
    return wrap;
  }
  function genPdfBlob(){
    var el = contentEl();
    var opt = {
      margin: 8,
      filename: getDocTitle() + '.pdf',
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    return window.html2pdf().set(opt).from(el).outputPdf('blob');
  }
  function getCustomWaText(){
    var m = document.querySelector('meta[name="lov-wa-text"]');
    var v = m ? (m.getAttribute('content') || '').trim() : '';
    return v || '';
  }
  function getWaPhone(){
    var m = document.querySelector('meta[name="lov-wa-phone"]');
    var v = m ? (m.getAttribute('content') || '').trim() : '';
    if (!v) return '';
    // 1) حوّل الأرقام العربية الشرقية والفارسية إلى لاتينية
    var map = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    v = v.replace(/[٠-٩۰-۹]/g, function(d){ return map[d] || d; });
    // 2) احتفظ بالأرقام و '+' فقط
    var hasPlus = v.indexOf('+') !== -1;
    var digits = v.replace(/[^0-9]/g, '');
    if (!digits) return '';
    // 3) صيغة دولية بدون '+': أزل '00' البادئة، وحوّل '0' المحلية لرمز الدولة الافتراضي
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    else if (!hasPlus && digits.charAt(0) === '0') digits = '249' + digits.slice(1);
    return digits;
  }
  function getSummaryText(){
    var custom = getCustomWaText();
    if (custom) return custom;
    var docLabel    = getMeta('lov-doc-label')    || getDocTitle();
    var docNumber   = getMeta('lov-doc-number');
    var customerNm  = getMeta('lov-customer-name');
    var totalEl     = document.querySelector('[data-print-total]');
    var totalTxt    = totalEl ? totalEl.textContent.trim() : '';

    var greeting = customerNm
      ? ('مرحباً ' + customerNm + ' 👋')
      : 'مرحباً 👋';

    var docLine = '📄 ' + docLabel + (docNumber ? (' رقم: ' + docNumber) : '');

    var lines = [greeting, '', docLine];
    if (totalTxt) lines.push('💰 الإجمالي: ' + totalTxt);
    lines.push('', 'شكراً لتعاملكم معنا 🙏');
    return lines.join('\\n');
  }
  function normalizeArabic(s){
    try { return (s || '').normalize('NFC'); } catch(e){ return s || ''; }
  }
  function buildWaDeepLink(text){
    var phone = getWaPhone();
    var t = normalizeArabic(String(text || ''));
    if (phone) return 'whatsapp://send?phone=' + phone + '&text=' + encodeURIComponent(t);
    return 'whatsapp://send?text=' + encodeURIComponent(t);
  }
  function buildWaWebFallback(text){
    var phone = getWaPhone();
    var t = normalizeArabic(String(text || ''));
    if (phone) return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(t);
    return 'https://wa.me/?text=' + encodeURIComponent(t);
  }
  function openWa(text){
    var deep = buildWaDeepLink(text);
    var web = buildWaWebFallback(text);
    var fellBack = false;
    function onHide(){ fellBack = true; }
    document.addEventListener('visibilitychange', onHide, { once: true });
    window.addEventListener('pagehide', onHide, { once: true });
    window.addEventListener('blur', onHide, { once: true });
    try { window.location.href = deep; } catch(e){}
    setTimeout(function(){
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('blur', onHide);
      if (!fellBack && document.visibilityState === 'visible') {
        window.open(web, '_blank');
      }
    }, 1500);
  }
  // Backwards compat (kept in case templates reference it)
  function buildWaUrl(text){ return buildWaDeepLink(text); }

  document.getElementById('__btn_print').onclick = function(){ window.print(); };

  document.getElementById('__btn_pdf').onclick = async function(){
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ جاري...';
    try {
      var blob = await genPdfBlob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = getDocTitle() + '.pdf';
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch(e){ alert('فشل توليد PDF: ' + e.message); }
    btn.disabled = false; btn.textContent = old;
  };

  function buildWaFileName(){
    // حوّل الأرقام العربية/الفارسية إلى لاتينية
    var digitMap = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
                     '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    function clean(s){
      s = (s || '').trim();
      // اعتبر القيم النائبة فارغة
      if (!s || s === '-' || s === '—' || s === '_' || s === 'undefined' || s === 'null') return '';
      // تحويل أرقام
      s = s.replace(/[٠-٩۰-۹]/g, function(d){ return digitMap[d] || d; });
      // إزالة الأحرف غير المسموحة في أسماء الملفات (Windows/Mac/Linux)
      s = s.replace(/[\\\\/:*?"<>|\\r\\n\\t]+/g, ' ').replace(/\\s+/g, ' ').trim();
      return s;
    }
    var docLabel   = clean(getMeta('lov-doc-label'));
    var docNumber  = clean(getMeta('lov-doc-number'));
    var customerNm = clean(getMeta('lov-customer-name'));

    // fallbacks افتراضية
    if (!docLabel)   docLabel   = clean(getDocTitle()) || 'مستند';
    if (!customerNm) customerNm = 'بدون اسم';
    // docNumber اختياري — لا نضيف افتراضي (تفادياً لاسم مكرر)

    var parts = [docLabel, customerNm];
    if (docNumber) parts.push(docNumber);
    var name = parts.join(' - ').trim();
    if (!name) name = 'document';

    // تقليم الطول لتجنّب حدود نظام الملفات (~120 محرف للاسم)
    if (name.length > 120) name = name.slice(0, 120).trim();

    return name + '.pdf';
  }
  function buildWaFileNameExt(ext){
    var n = buildWaFileName();
    // استبدل امتداد .pdf الافتراضي بالامتداد المطلوب
    n = n.replace(/\\.pdf$/i, '');
    return n + '.' + ext;
  }
  function loadHtml2CanvasIfNeeded(){
    // 1) موجود على window (تحميل مسبق)
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    // 2) موجود ضمن html2pdf.bundle
    if (window.html2pdf && window.html2pdf.html2canvas) {
      window.html2canvas = window.html2pdf.html2canvas;
      return Promise.resolve(window.html2canvas);
    }
    // 3) حمّل html2canvas مستقلاً من CDN
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = function(){
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error('html2canvas لم يتحمَّل بشكل صحيح'));
      };
      s.onerror = function(){ reject(new Error('فشل تحميل مكتبة الصور')); };
      document.head.appendChild(s);
    });
  }
  function genImgBlob(){
    return loadHtml2CanvasIfNeeded().then(function(){
      var el = contentEl();
      // ارفقه مؤقتاً خارج الشاشة حتى يُرسم
      el.style.position = 'fixed';
      el.style.left = '-99999px';
      el.style.top = '0';
      el.style.background = '#fff';
      document.body.appendChild(el);
      return window.html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' })
        .then(function(canvas){
          document.body.removeChild(el);
          return new Promise(function(res){ canvas.toBlob(function(b){ res(b); }, 'image/png', 0.95); });
        }).catch(function(e){
          if (el.parentNode) el.parentNode.removeChild(el);
          throw e;
        });
    });
  }
  function genHtmlBlob(){
    // ابنِ مستند HTML مستقل قابل للفتح في أي متصفح
    var clone = document.documentElement.cloneNode(true);
    var bar = clone.querySelector('#__lov_print_toolbar');
    if (bar) bar.remove();
    clone.querySelectorAll('.__lov_hidden').forEach(function(n){ n.remove(); });
    // أزل السكربتات لأنها غير لازمة للعرض الثابت
    clone.querySelectorAll('script').forEach(function(n){ n.remove(); });
    var html = '<!doctype html>\\n' + clone.outerHTML;
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }
  async function shareBlobOnly(blob, fileName, mime){
    var file = new File([blob], fileName, { type: mime });
    var canShareFiles = false;
    try {
      canShareFiles = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    } catch(e){ canShareFiles = false; }
    if (canShareFiles) {
      try { await navigator.share({ files: [file] }); return true; }
      catch(e){ if (e && e.name === 'AbortError') return true; }
    }
    // مسار احتياطي: نزّل الملف + افتح واتساب بدون نص
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
    openWa('');
    return true;
  }

  document.getElementById('__btn_wa_pdf').onclick = async function(){
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ جاري...';
    try {
      var blob = await genPdfBlob();
      var fileName = buildWaFileName();
      var file = new File([blob], fileName, { type: 'application/pdf' });

      // مشاركة الملف فقط بدون أي نص — المستخدم يختار جهة الاتصال
      var canShareFiles = false;
      try {
        canShareFiles = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
      } catch(e){ canShareFiles = false; }

      if (canShareFiles) {
        try {
          await navigator.share({ files: [file] });
          btn.disabled = false; btn.textContent = old;
          return;
        } catch(e){
          if (e && e.name === 'AbortError') {
            btn.disabled = false; btn.textContent = old;
            return;
          }
        }
      }

      // مسار احتياطي (متصفح قديم بلا Web Share): نزّل الملف + افتح واتساب بدون نص
      var url2 = URL.createObjectURL(blob);
      var a2 = document.createElement('a');
      a2.href = url2; a2.download = fileName;
      document.body.appendChild(a2); a2.click();
      setTimeout(function(){ URL.revokeObjectURL(url2); a2.remove(); }, 1000);
      openWa('');
    } catch(e){
      if (e && e.name !== 'AbortError') alert('فشل مشاركة PDF: ' + (e.message || e));
    }
    btn.disabled = false; btn.textContent = old;
  };


  document.getElementById('__btn_link_online').onclick = async function(){
    var btn = this; btn.disabled = true; var old = btn.textContent; btn.textContent = '⏳ جاري...';
    try {
      var docId   = getMeta('lov-doc-id');
      var docKind = getMeta('lov-doc-share-type');
      if (!docId || !docKind) throw new Error('لا يمكن إنشاء رابط لهذا المستند');

      var phone = getWaPhone();
      var customerNm = getMeta('lov-customer-name');

      // اطلب من النافذة الأم (React) أن تنشئ التوكن وتفتح واتساب
      // (الـ iframe بـ srcDoc له origin="null" ولا يستطيع الـ fetch مباشرة)
      var reqId = 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);

      // اجمع قائمة الأقسام المخفية حالياً (من إعدادات الرؤية في شريط الأدوات)
      // لكي تنتقل نفس الإعدادات إلى صفحة معاينة العميل عند فتح الرابط.
      var hiddenSections = [];
      try {
        Object.keys(prefs).forEach(function(k){
          if (prefs[k]) hiddenSections.push(k);
        });
      } catch(e) {}

      var done = false;
      var onResp = function(ev){
        var d = ev.data;
        if (!d || d.type !== 'lov-link-online-result' || d.reqId !== reqId) return;
        done = true;
        window.removeEventListener('message', onResp);
        if (!d.ok) {
          alert('فشل إنشاء الرابط: ' + (d.error || 'خطأ غير معروف'));
        }
        btn.disabled = false; btn.textContent = old;
      };
      window.addEventListener('message', onResp);
      window.parent.postMessage({
        type: 'lov-link-online-request',
        reqId: reqId,
        docType: docKind,
        docId: docId,
        phone: phone,
        customerName: customerNm,
        hiddenSections: hiddenSections
      }, '*');

      // مهلة 20 ثانية
      setTimeout(function(){
        if (done) return;
        window.removeEventListener('message', onResp);
        alert('فشل إنشاء الرابط: انتهت المهلة');
        btn.disabled = false; btn.textContent = old;
      }, 20000);
    } catch(e){
      alert('فشل إنشاء الرابط: ' + (e.message || e));
      btn.disabled = false; btn.textContent = old;
    }
  };

  document.getElementById('__btn_wa_text').onclick = function(){
    openWa(getSummaryText());
  };

  document.getElementById('__btn_close').onclick = function(){
    if (${inline ? "true" : "false"}) {
      try { window.parent.postMessage({ type: 'lov-preview-close' }, '*'); } catch(e){}
    } else {
      window.close();
    }
  };
})();
</script>
`;

  // نحقن قبل </body>
  const finalHtml = html.includes("</body>")
    ? html.replace("</body>", toolbarHTML + "</body>")
    : html + toolbarHTML;

  return finalHtml;
}

/**
 * يفتح نافذة منبثقة بالمستند + شريط أدوات المعاينة. (السلوك القديم — يبقى للتوافق.)
 */
export function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const finalHtml = buildPrintWindowHtml(html, false);
  win.document.write(finalHtml);
  win.document.close();
}

