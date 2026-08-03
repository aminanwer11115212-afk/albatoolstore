// قالب رابط العميل — **نفس ورقة الطباعة والمعاينة حرفياً**.
//
// This module is intentionally free of Deno / esm.sh imports so it can be
// imported from three places:
//   1. supabase/functions/document-share/index.ts        (Deno edge fn)
//   2. supabase/functions/document-share/index_test.ts   (Deno tests)
//   3. src/test/shareVsPrintTemplate.test.ts + e2e specs (Node / Playwright)
//
// ## لماذا نُسِخ القالب بدل استيراده
// الدالّة تعمل داخل Deno على الحافة، ولا تبلغها وحدات `src/`. فالمقابل الوحيد
// للاستيراد نسخةٌ محكومة بعقد: `shareVsPrintTemplate.test.ts` على جانب Node
// و`index_test.ts` على جانب Deno يفحصان أن القالبين يعطيان نفس البنية ونفس
// الأرقام. أي انحرافٍ بينهما يسقط في أحد الجانبين.
//
// ## العقود المفحوصة
//   * ترويسة وعنوان ومعلومات وجدول بنود بنفس أعمدة الطباعة
//   * ملخّص الحساب بخلايا Excel نفسها، و«رصيد العميل الحالي» **موقّعاً**
//     بإشارة العميل (`+` له أخضر، `−` عليه أحمر، «خالص» صفراً) — لا مقصوصاً
//     عند الصفر كما كان، وإلا قرأ العميل «مطلوب 0» وله رصيدٌ عندنا
//   * صندوقا التغليف والترحيل، والتواقيع، وكلها تحمل `data-section`
//   * `<meta name="lov-doc-label|lov-doc-number|lov-customer-name">`
//   * اسم ملف PDF: "<label> - <customer> - <number> - <amount>.pdf"

export function attr(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Matches printTemplate.ts .toLocaleString() defaults (max 3 fraction digits).
export function fmt(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString("en-US");
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** ألوان الإشارة — مطابقة لـ`TONE_COLOR` في قالب الطباعة. */
const TONE_COLOR = { credit: "#16a34a", debit: "#c0392b", settled: "#111" } as const;

/**
 * نصّ المبلغ بإشارة **العميل**: موجب لصالحه أخضر، سالب عليه أحمر، صفر «خالص».
 * نسخةٌ من `signedAmountText` في `buildCustomerAccountView`.
 */
export function signedAmountText(shown: number): { text: string; tone: keyof typeof TONE_COLOR } {
  const n = r2(shown);
  if (Math.abs(n) < 0.01) return { text: "خالص", tone: "settled" };
  if (n > 0) return { text: `+${n.toLocaleString("en-US")}`, tone: "credit" };
  return { text: `−${Math.abs(n).toLocaleString("en-US")}`, tone: "debit" };
}

/** تنظيف نصّ التغليف/الترحيل — نسخة من `cleanExtraHTML` في قالب الطباعة. */
function cleanExtraHTML(s?: string | null): string | undefined {
  if (!s) return undefined;
  const out = String(s)
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

export interface ShareDocArgs {
  docTitle: string;
  docNumber?: string;
  date: string;
  customer: { name?: string; phone?: string; address?: string } | null;
  items: Array<{ product_name: string; quantity: number; unit_price: number; total: number }>;
  grandTotal: number;
  paidAmount?: number;
  notes?: string | null;
  company: any;
  hiddenSections?: string[];
  /** قيمة البنود قبل الخصم — تُعرض في سطر «الجملة» */
  subtotal?: number | null;
  /** الخصم العام على المستند */
  discountTotal?: number | null;
  /** رصيد العميل المدين قبل هذا المستند */
  previousDebt?: number | null;
  /** رصيد العميل الدائن قبل هذا المستند */
  previousCredit?: number | null;
  /** صافي حساب العميل الآن بإشارة الدفاتر (موجب = عليه) */
  currentNet?: number | null;
  /** عرض السعر لا يدخل حساب العميل — راجع الملخّص أدناه */
  isQuote?: boolean;
  packagingInfo?: string | null;
  transportInfo?: string | null;
}

export function buildDocHTML(args: ShareDocArgs): string {
  const {
    docTitle, docNumber, date, customer, items, grandTotal, paidAmount = 0,
    notes, company, hiddenSections = [],
    subtotal = null, discountTotal = 0,
    previousDebt = 0, previousCredit = 0, currentNet = null,
    isQuote = false, packagingInfo, transportInfo,
  } = args;

  const isHidden = (k: string) => hiddenSections.includes(k);
  const logoURL = company?.logo_url || "";
  const logoHTML = logoURL
    ? `<div class="header-logo"><img src="${attr(logoURL)}" alt="Logo" /></div>`
    : "";

  const showPackaging = !isHidden("packaging");
  const showTransport = !isHidden("transport");
  const showExtras = showPackaging || showTransport;
  const showSignatures = !isHidden("signatures");
  const cleanPackaging = cleanExtraHTML(packagingInfo);
  const cleanTransport = cleanExtraHTML(transportInfo);
  const docNoun = isQuote ? "لعرض السعر هذا" : "لهذه الفاتورة";

  // ===== ملخّص الحساب — نفس معادلات قالب الطباعة =====
  const prevNet = r2(Number(previousDebt) || 0) - r2(Number(previousCredit) || 0);
  const hasPrev = Math.abs(prevNet) > 0.01;
  const generalDiscount = Math.max(0, r2(Number(discountTotal) || 0));
  const invoiceValue = Math.max(
    (Number(grandTotal) || 0) + generalDiscount,
    Number(subtotal) || 0,
    Number(grandTotal) || 0,
  );
  const netValue = Number(grandTotal) || 0;
  const jomlaHesab = isQuote ? netValue : r2(netValue + prevNet);
  const netProvided = currentNet != null && !Number.isNaN(Number(currentNet));
  const finalNet = isQuote
    ? r2(prevNet)
    : netProvided ? r2(Number(currentNet)) : r2(jomlaHesab - (Number(paidAmount) || 0));
  const derivedPaid = netProvided ? Math.max(0, r2(jomlaHesab - finalNet)) : r2(Number(paidAmount) || 0);
  const paidValue = isQuote ? 0 : Math.max(0, derivedPaid);
  const finalSigned = signedAmountText(-finalNet);
  const finalBadge = Math.abs(finalNet) <= 0.01 ? "" : finalNet > 0 ? "عليه" : "له";
  const finalColor = TONE_COLOR[finalSigned.tone];

  const cellR = "padding:3px 6px;text-align:right;font-weight:700;color:#111;background:#f4f6f8;border:1px solid #b8bcc4;line-height:1.1;font-size:10px;";
  const cellL = "padding:3px 6px;text-align:left;font-weight:800;color:#111;background:#ffffff;border:1px solid #b8bcc4;line-height:1.1;font-family:'Consolas','Courier New',monospace;font-size:10.5px;letter-spacing:0.2px;";
  const sumRow = (o: { section: string; label: string; value: string; valColor?: string; strong?: boolean; sideBadge?: string; badgeColor?: string }) => `
    <tr data-section="${o.section}" data-section-label="${attr(o.label)}">
      <td style="${cellR}${o.strong ? "background:#e8eef7;" : ""}">${attr(o.label)}</td>
      <td class="summary-box-value" style="${cellL}${o.valColor ? `color:${o.valColor};` : ""}${o.strong ? "background:#eef4fb;font-size:11.5px;" : ""}">${o.value}</td>
      <td style="border:none;padding:0 4px;text-align:right;font-weight:800;font-size:9.5px;color:${o.badgeColor || "#111"};white-space:nowrap;">${o.sideBadge || ""}</td>
    </tr>`;

  const hiddenCSS = hiddenSections.length
    ? `\n<style>${hiddenSections.map((k) => `[data-section="${attr(k).replace(/[^a-z0-9_-]/gi, "")}"]{display:none !important;}`).join("")}</style>`
    : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="lov-doc-label" content="${attr(docTitle)}">
<meta name="lov-doc-number" content="${attr(docNumber || "")}">
<meta name="lov-customer-name" content="${attr(customer?.name || "")}">
<meta name="lov-doc-total" content="${attr(String(r2(Number(grandTotal) || 0)))}">
<title>${attr(docTitle)} ${attr(docNumber || "")}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  table { page-break-inside: auto; }
  thead { display: table-header-group; }
  tr, td, th { page-break-inside: avoid; break-inside: avoid; }
  .total-row, .summary-row, .summary-box, .extra-row, .signatures { page-break-inside: avoid; break-inside: avoid; }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1a1a1a; background: #f3f4f6; padding: 80px 12px 24px; line-height: 1.5;
    font-size: 14px;
  }

  /* شريط الأدوات — لا يُطبع ولا يدخل الـPDF */
  .toolbar { position: fixed; top: 0; right: 0; left: 0; z-index: 999; background: linear-gradient(135deg, #5b21b6, #7c3aed); color: #fff; padding: 10px 12px; display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .toolbar button { background: rgba(255,255,255,0.95); color: #5b21b6; border: 0; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
  .toolbar button:hover:not(:disabled) { background: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .toolbar button:disabled { opacity: 0.85; cursor: wait; background: #fff; }
  .toolbar button.success { background: #10b981; color: #fff; }
  .zoom-group { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.15); border-radius: 8px; padding: 3px 6px; }
  .zoom-group button { min-width: 34px; padding: 6px 10px; font-size: 16px; line-height: 1; }
  .zoom-level { font-size: 13px; font-weight: 800; min-width: 46px; text-align: center; }
  .spinner { width: 16px; height: 16px; border: 2.5px solid rgba(91,33,182,0.25); border-top-color: #5b21b6; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  .toolbar button.success .spinner { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .progress-bar { position: fixed; top: 60px; right: 0; left: 0; height: 3px; background: rgba(91,33,182,0.15); z-index: 998; overflow: hidden; display: none; }
  .progress-bar.active { display: block; }
  .progress-bar::after { content: ''; position: absolute; left: 0; top: 0; height: 100%; width: 30%; background: linear-gradient(90deg, #5b21b6, #7c3aed); animation: progress 1.2s ease-in-out infinite; }
  @keyframes progress { 0% { left: -30%; } 100% { left: 100%; } }

  /* الورقة — نفس مقاسات الطباعة، والتكبير يتمّ بـzoom على الحاوية */
  .sheet-wrap { display: flex; justify-content: center; }
  .page { width: 800px; max-width: 100%; background: #fff; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; transform-origin: top center; }

  .header { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #4a7c59; margin-bottom: 10px; position: relative; }
  .header-logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .header-logo img { height: 75px; object-fit: contain; }
  .header-title { font-size: 22px; font-weight: 900; color: #c0392b; margin-bottom: 4px; }
  .header-address { font-size: 13px; color: #333; line-height: 1.6; }
  .header-phones { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }

  .doc-title { text-align: center; margin: 14px 0 10px; }
  .doc-title h1 { font-size: 22px; color: #2c3e50; font-weight: 800; display: inline-block; border-bottom: 3px solid #5b2c8e; padding-bottom: 3px; }

  .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px; flex-wrap: wrap; gap: 8px; }
  .info-row .right, .info-row .left { display: flex; gap: 8px; flex-wrap: wrap; }
  .info-label { color: #1a1a1a; font-weight: 700; }
  .info-value { color: #c0392b; font-weight: 700; }
  .info-value-blue { color: #2980b9; font-weight: 800; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 2px solid #1a1a1a; }
  thead th { background: #5b4cad; color: #fff; padding: 8px 10px; font-size: 13px; font-weight: 700; text-align: center; border: 1px solid #1a1a1a; }
  tbody td { padding: 7px 10px; text-align: center; font-size: 13px; border: 1px solid #999; }
  tbody tr:nth-child(even) { background: #f8f8f8; }
  .total-row td { font-weight: 800; font-size: 14px; border: 2px solid #1a1a1a; background: #f0f0f0; }
  .product-name { text-align: right; font-weight: 600; }

  .summary-box-value { font-size: 20px; font-weight: 900; }
  .summary-table { width: 38%; max-width: 260px; margin: 6px 0 4px; border-collapse: collapse; font-size: 10px; border: none; }
  .summary-table td { border: none; }

  .extra-row { display: flex; gap: 16px; margin: 16px 0; }
  .extra-box { flex: 1; border: 2px solid #999; border-radius: 6px; padding: 12px 16px; min-height: 80px; }
  .extra-box-title { font-size: 14px; font-weight: 800; color: #5b2c8e; border-bottom: 2px dashed #5b2c8e; padding-bottom: 4px; margin-bottom: 8px; }
  .extra-box p { font-size: 12px; color: #666; }

  .notes-section { margin: 10px 0; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; }
  .notes-section h4 { font-size: 13px; color: #92400e; font-weight: 700; margin-bottom: 3px; }
  .notes-section p { font-size: 12px; color: #78350f; }

  .signatures { display: flex; justify-content: space-between; padding: 20px 50px 10px; margin-top: 20px; }
  .sig-box { text-align: center; width: 150px; }
  .sig-line { border-top: 1px solid #999; margin-top: 45px; padding-top: 5px; font-size: 12px; color: #555; font-weight: 600; }

  @media print {
    body { padding: 0; background: #fff; }
    .toolbar, .progress-bar { display: none !important; }
    .page { box-shadow: none; border-radius: 0; padding: 0; width: auto; max-width: none; transform: none !important; }
  }
</style>${hiddenCSS}
</head>
<body>
<div class="toolbar">
  <span class="zoom-group">
    <button type="button" id="__zoom_out" title="تصغير" aria-label="تصغير">−</button>
    <span class="zoom-level" id="__zoom_level">100%</span>
    <button type="button" id="__zoom_in" title="تكبير" aria-label="تكبير">+</button>
    <button type="button" id="__zoom_reset" title="الحجم الطبيعي" aria-label="الحجم الطبيعي">⤾</button>
  </span>
  <button type="button" id="__btn_print">🖨️ طباعة</button>
  <button type="button" id="__btn_pdf"><span id="__btn_label">⬇️ تحميل PDF</span></button>
</div>
<div class="progress-bar" id="__progress"></div>
<div class="sheet-wrap">
<div class="page" id="__doc_root">

<div class="header" data-section="header" data-section-label="الترويسة">
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

<div class="doc-title"><h1>${attr(docTitle)}</h1></div>

<div class="info-row">
  <div class="right">
    <span class="info-label">اسم العميل:</span>
    <span class="info-value">${attr(customer?.name || "كاش")}</span>
  </div>
  <div class="left">
    <span class="info-label">التاريخ:</span>
    <span class="info-value">${attr(date)}</span>
  </div>
</div>
<div class="info-row">
  <div class="right">
    ${customer?.phone ? `<span class="info-label">الهاتف:</span><span class="info-value">${attr(customer.phone)}</span>` : ""}
    ${customer?.address ? `<span class="info-label" style="margin-right:15px;">العنوان:</span><span class="info-value">${attr(customer.address)}</span>` : ""}
  </div>
  <div class="left">
    <span class="info-label">الرقم:</span>
    <span class="info-value-blue">${attr(docNumber || "")}</span>
  </div>
</div>

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
    ${items.map((it, i) => `<tr><td>${i + 1}</td><td class="product-name">${attr(it.product_name)}</td><td>${fmt(it.quantity)}</td><td>${fmt(it.unit_price)}</td><td style="font-weight:700;">${fmt(it.total)}</td></tr>`).join("")}
    <tr class="total-row" data-section="grand-total" data-section-label="الجملة">
      <td colspan="2" style="text-align:right; padding-right:15px;">جملة ${isQuote ? "عرض السعر" : "الفاتورة"}</td>
      <td></td>
      <td></td>
      <td>${fmt(Number(subtotal) || (Number(grandTotal) || 0) + generalDiscount)}</td>
    </tr>
  </tbody>
</table>

<table class="summary-table" data-section="account-summary" data-section-label="ملخص الحساب">
  <tbody>
    ${sumRow({ section: "invoice-value", label: isQuote ? "قيمة عرض السعر" : "قيمة الفاتورة", value: fmt(invoiceValue) })}
    ${generalDiscount > 0.01 ? sumRow({ section: "discount-row", label: isQuote ? "الخصم على العرض" : "الخصم على الفاتورة", value: `− ${fmt(generalDiscount)}`, valColor: "#c0392b" }) : ""}
    ${!isQuote && hasPrev ? (() => {
      const s = signedAmountText(-prevNet);
      return sumRow({
        section: "prev-account-row", label: "الحساب القديم", value: s.text,
        valColor: TONE_COLOR[s.tone], sideBadge: prevNet > 0 ? "عليه" : "له", badgeColor: TONE_COLOR[s.tone],
      });
    })() : ""}
    ${sumRow({ section: "majmoo-row", label: isQuote ? "إجمالي عرض السعر" : "جملة الحساب", value: fmt(jomlaHesab), strong: true })}
    ${isQuote ? "" : sumRow({ section: "paid-amount", label: "المدفوع", value: fmt(paidValue), valColor: paidValue > 0 ? "#16a34a" : "#111" })}
    ${isQuote && !hasPrev ? "" : `
    <tr data-section="final-status" data-section-label="رصيد العميل الحالي">
      <td style="${cellR}background:#e8eef7;">رصيد العميل الحالي</td>
      <td data-section="final-total" data-section-label="رصيد العميل الحالي" class="summary-box-value" style="${cellL}background:#eef4fb;font-size:11.5px;color:${finalColor};">${finalSigned.text}</td>
      <td style="border:none;padding:0 4px;text-align:right;font-weight:800;font-size:9.5px;color:${finalColor};white-space:nowrap;">${finalBadge}</td>
    </tr>`}
  </tbody>
</table>

${showExtras ? `
<div class="extra-row">
  ${showPackaging ? `
  <div class="extra-box" data-section="packaging" data-section-label="تفاصيل التغليف">
    <div class="extra-box-title">تفاصيل التغليف</div>
    <p>${cleanPackaging || `لا توجد بيانات تغليف ${docNoun}`}</p>
  </div>` : ""}
  ${showTransport ? `
  <div class="extra-box" data-section="transport" data-section-label="معلومات الترحيل">
    <div class="extra-box-title">معلومات الترحيل</div>
    <p>${cleanTransport || `لا توجد بيانات ترحيل ${docNoun}`}</p>
  </div>` : ""}
</div>
` : ""}

${notes ? `<div class="notes-section" data-section="notes" data-section-label="الملاحظات"><h4>📝 ملاحظات</h4><p>${attr(notes)}</p></div>` : ""}

${showSignatures ? `
<div class="signatures" data-section="signatures" data-section-label="التواقيع">
  <div class="sig-box"><div class="sig-line">توقيع المستلم</div></div>
  <div class="sig-box"><div class="sig-line">توقيع المسؤول</div></div>
</div>
` : ""}

</div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
(function(){
  // ===== التكبير/التصغير — نفس وظيفة شاشة المعاينة في التطبيق =====
  // يُحفظ الاختيار محلياً فلا يعود العميل إلى 100% كلما فتح الرابط.
  var ZOOM_KEY = '__lov_share_zoom__';
  var root = document.getElementById('__doc_root');
  var levelEl = document.getElementById('__zoom_level');
  var zoom = 1;
  try { var saved = parseFloat(localStorage.getItem(ZOOM_KEY) || '1'); if (saved >= 0.5 && saved <= 2.5) zoom = saved; } catch (e) {}
  function applyZoom(){
    root.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')';
    // بلا ضبط الارتفاع يبقى تحت الورقة فراغُ حجمها الأصلي عند التصغير.
    root.style.marginBottom = zoom < 1 ? (root.offsetHeight * (zoom - 1)) + 'px' : '0';
    levelEl.textContent = Math.round(zoom * 100) + '%';
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch (e) {}
  }
  function setZoom(z){ zoom = Math.min(2.5, Math.max(0.5, Math.round(z * 100) / 100)); applyZoom(); }
  document.getElementById('__zoom_in').onclick = function(){ setZoom(zoom + 0.1); };
  document.getElementById('__zoom_out').onclick = function(){ setZoom(zoom - 0.1); };
  document.getElementById('__zoom_reset').onclick = function(){ setZoom(1); };
  applyZoom();

  document.getElementById('__btn_print').onclick = function(){ window.print(); };

  // اسم ملف PDF يطابق قالب الطباعة الرسمية (buildWaFileName في printTemplate.ts):
  //   "<اسم المستند> - <اسم العميل> - <رقم المستند> - <المبلغ>.pdf"
  var __docLabel  = ${JSON.stringify(String(docTitle || "مستند"))};
  var __docNumber = ${JSON.stringify(String(docNumber || ""))};
  var __customer  = ${JSON.stringify(String(customer?.name || "بدون اسم"))};
  var __docTotal  = ${JSON.stringify(String(r2(Number(grandTotal) || 0)))};
  function __cleanName(s){
    s = (s || '').toString().trim();
    if (!s || s === '-' || s === '—' || s === '_' || s === 'undefined' || s === 'null') return '';
    // NFC + إزالة محارف الاتجاه/العرض الصفري — غير مرئية لكنها تصل واتساب رموزاً
    try { s = s.normalize('NFC'); } catch (e) { /* بيئة بلا normalize */ }
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, '');
    s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }
  var __parts = [__cleanName(__docLabel) || 'مستند', __cleanName(__customer) || 'بدون اسم'];
  if (__cleanName(__docNumber)) __parts.push(__cleanName(__docNumber));
  // تنسيق المبلغ مطابق حرفياً لـ formatAmountPart في الواجهة: الصحيح بلا كسور،
  // وغيره بخانتين. كان هنا toLocaleString الافتراضي (ثلاث خانات)، فيخرج الملف
  // من صفحة المشاركة باسم يختلف عن اسمه من التطبيق للمبلغ نفسه.
  var __amt = Number(__docTotal);
  if (isFinite(__amt) && __amt > 0) {
    __parts.push(
      Math.round(__amt * 100) / 100 === Math.round(__amt)
        ? Math.round(__amt).toLocaleString('en-US')
        : __amt.toLocaleString('en-US', { maximumFractionDigits: 2 })
    );
  }
  var fileName = __parts.join(' - ').slice(0, 120) + '.pdf';
  // اسم الملف يتوفر أيضاً في DOM لاختبارات e2e (data-attr على زر التحميل).
  var __btnEl = document.getElementById('__btn_pdf');
  if (__btnEl) __btnEl.setAttribute('data-filename', fileName);

  var btn = document.getElementById('__btn_pdf');
  var label = document.getElementById('__btn_label');
  var progress = document.getElementById('__progress');

  function setState(state, text){
    if (state === 'loading') {
      btn.disabled = true;
      btn.classList.remove('success');
      label.innerHTML = '<span class="spinner"></span> ' + text;
      progress.classList.add('active');
    } else if (state === 'success') {
      btn.disabled = true;
      btn.classList.add('success');
      label.textContent = '✓ ' + text;
      progress.classList.remove('active');
    } else {
      btn.disabled = false;
      btn.classList.remove('success');
      label.textContent = text;
      progress.classList.remove('active');
    }
  }

  btn.onclick = async function(){
    setState('loading', 'جاري تجهيز الملف...');
    try {
      var imgs = document.querySelectorAll('#__doc_root img');
      await Promise.all(Array.from(imgs).map(function(img){
        if (img.complete) return Promise.resolve();
        return new Promise(function(res){ img.onload = img.onerror = res; });
      }));

      setState('loading', 'جاري إنشاء PDF...');
      var el = document.getElementById('__doc_root').cloneNode(true);
      // الـPDF بالحجم الأصلي دائماً — التكبير للقراءة على الشاشة لا للورقة.
      el.style.transform = '';
      el.style.marginBottom = '0';
      var wrap = document.createElement('div'); wrap.appendChild(el);
      var blob = await window.html2pdf().set({
        margin: 8, filename: fileName,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(wrap).outputPdf('blob');

      setState('loading', 'جاري التحميل...');
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);

      setState('success', 'تم التحميل');
      setTimeout(function(){ setState('idle', '⬇️ تحميل PDF'); }, 2500);
    } catch(e){
      setState('idle', '⬇️ تحميل PDF');
      alert('فشل توليد PDF: ' + (e && e.message || e));
    }
  };
})();
</script>
</body></html>`;
}
