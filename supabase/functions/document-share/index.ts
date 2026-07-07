// Public document viewer via share token.
// GET /functions/v1/document-share?token=...
// Returns full HTML page with the document and a single "Download PDF" button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// No logo fallback: only display the company logo if it has been uploaded
// in company settings. Otherwise, the header shows the company name only.

function attr(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function fmt(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString("en-US");
}

function buildDocHTML(args: {
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
}): string {
  const { docTitle, docNumber, date, customer, items, grandTotal, paidAmount = 0, notes, company, hiddenSections = [] } = args;
  const logoURL = company?.logo_url || "";
  const logoHTML = logoURL
    ? `<div class="header-logo"><img src="${attr(logoURL)}" alt="Logo" /></div>`
    : "";
  // نفس معادلة الطباعة الرسمية:
  // "المطلوب النهائي" = جملة الفاتورة − المبلغ المدفوع (لا يُجمع مع أي حساب قديم).
  const finalTotal = Math.max(0, Number(grandTotal || 0) - Number(paidAmount || 0));

  // Build CSS to hide sections that the document owner toggled off in the
  // preview before generating the share link. We use the same data-section
  // keys as the in-app preview toolbar so the customer sees an identical view.
  const hiddenCSS = hiddenSections.length
    ? `\n<style>${hiddenSections.map((k) => `[data-section="${attr(k).replace(/[^a-z0-9_-]/gi, "")}"]{display:none !important;}`).join("")}</style>`
    : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(docTitle)} ${attr(docNumber || "")}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a1a1a; background: #f3f4f6; padding: 80px 12px 24px; line-height: 1.5; font-size: 14px; }
  .toolbar { position: fixed; top: 0; right: 0; left: 0; z-index: 999; background: linear-gradient(135deg, #5b21b6, #7c3aed); color: #fff; padding: 12px; display: flex; justify-content: center; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .toolbar button { background: rgba(255,255,255,0.95); color: #5b21b6; border: 0; padding: 10px 22px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 10px; transition: all 0.2s; min-width: 180px; justify-content: center; }
  .toolbar button:hover:not(:disabled) { background: #fff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .toolbar button:disabled { opacity: 0.85; cursor: wait; background: #fff; }
  .toolbar button.success { background: #10b981; color: #fff; }
  .spinner { width: 16px; height: 16px; border: 2.5px solid rgba(91,33,182,0.25); border-top-color: #5b21b6; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  .toolbar button.success .spinner { display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .progress-bar { position: fixed; top: 60px; right: 0; left: 0; height: 3px; background: rgba(91,33,182,0.15); z-index: 998; overflow: hidden; display: none; }
  .progress-bar.active { display: block; }
  .progress-bar::after { content: ''; position: absolute; left: 0; top: 0; height: 100%; width: 30%; background: linear-gradient(90deg, #5b21b6, #7c3aed); animation: progress 1.2s ease-in-out infinite; }
  @keyframes progress { 0% { left: -30%; } 100% { left: 100%; } }
  .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; }
  .header { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #4a7c59; margin-bottom: 10px; }
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
  .summary-row { display: flex; justify-content: center; gap: 30px; margin: 16px 0; flex-wrap: wrap; }
  .summary-box { border: 2px solid #1a1a1a; border-radius: 6px; padding: 12px 30px; text-align: center; min-width: 200px; }
  .summary-box-title { font-size: 15px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
  .summary-box-value { font-size: 20px; font-weight: 900; }
  .summary-box-value.red { color: #c0392b; }
  .summary-box-value.blue { color: #2980b9; }
  .notes-section { margin: 10px 0; padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; }
  .notes-section h4 { font-size: 13px; color: #92400e; font-weight: 700; margin-bottom: 3px; }
  .notes-section p { font-size: 12px; color: #78350f; }
  @media print { body { padding: 0; background: #fff; } .toolbar { display: none !important; } .page { box-shadow: none; border-radius: 0; padding: 0; } }
</style>${hiddenCSS}
</head>
<body>
<div class="toolbar">
  <button id="__btn_pdf"><span id="__btn_label">⬇️ تحميل PDF</span></button>
</div>
<div class="progress-bar" id="__progress"></div>
<div class="page" id="__doc_root">
  <div class="header" data-section="header">
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
    <div class="right"><span class="info-label">اسم العميل:</span><span class="info-value">${attr(customer?.name || "كاش")}</span></div>
    <div class="left"><span class="info-label">التاريخ:</span><span class="info-value">${attr(date)}</span></div>
  </div>
  <div class="info-row">
    <div class="right">
      ${customer?.phone ? `<span class="info-label">الهاتف:</span><span class="info-value">${attr(customer.phone)}</span>` : ""}
      ${customer?.address ? `<span class="info-label" style="margin-right:15px;">العنوان:</span><span class="info-value">${attr(customer.address)}</span>` : ""}
    </div>
    <div class="left"><span class="info-label">الرقم:</span><span class="info-value-blue">${attr(docNumber || "")}</span></div>
  </div>
  <table data-section="items">
    <thead><tr><th style="width:35px;">#</th><th>اسم الصنف</th><th style="width:80px;">الكمية</th><th style="width:100px;">السعر</th><th style="width:110px;">الإجمالي</th></tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td class="product-name">${attr(it.product_name)}</td><td>${fmt(it.quantity)}</td><td>${fmt(it.unit_price)}</td><td style="font-weight:700;">${fmt(it.total)}</td></tr>`).join("")}
      <tr class="total-row" data-section="grand-total"><td colspan="2" style="text-align:right; padding-right:15px;">الإجمالي</td><td></td><td></td><td>${fmt(grandTotal)}</td></tr>
    </tbody>
  </table>
  <div class="summary-row" data-section="account-summary">
    <div class="summary-box" data-section="paid-amount"><div class="summary-box-title">المبلغ المدفوع</div><div class="summary-box-value" style="color:#16a34a;">${fmt(paidAmount)}</div></div>
    <div class="summary-box" data-section="final-total" style="border-color:#2980b9;"><div class="summary-box-title">المطلوب النهائي</div><div class="summary-box-value blue">${fmt(finalTotal)}</div></div>
  </div>

  ${notes ? `<div class="notes-section" data-section="notes"><h4>📝 ملاحظات</h4><p>${attr(notes)}</p></div>` : ""}
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
(function(){
  var fileName = ${JSON.stringify(`${docTitle}${docNumber ? " - " + docNumber : ""}.pdf`)};
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
      // Wait for images to load
      var imgs = document.querySelectorAll('#__doc_root img');
      await Promise.all(Array.from(imgs).map(function(img){
        if (img.complete) return Promise.resolve();
        return new Promise(function(res){ img.onload = img.onerror = res; });
      }));

      setState('loading', 'جاري إنشاء PDF...');
      var el = document.getElementById('__doc_root').cloneNode(true);
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

function buildStatementHTML(args: {
  kind: "customer" | "supplier";
  party: { name?: string; phone?: string; address?: string; balance?: number; credit_balance?: number } | null;
  company: any;
  invoices?: Array<{ invoice_number: string; date: string; total: number; paid_amount: number }>;
  quotes?: Array<{ quote_number: string; date: string; total: number; status?: string }>;
  returns?: Array<{ return_number: string; date: string; total: number; status?: string }>;
  orders?: Array<{ order_number: string; date: string; total: number; status?: string }>;
  transactions?: Array<{ date: string; type?: string; amount: number; description?: string }>;
}): string {
  const { kind, party, company, invoices = [], quotes = [], returns = [], orders = [], transactions = [] } = args;
  const logoURL = company?.logo_url || "";
  const logoHTML = logoURL
    ? `<div class="header-logo"><img src="${attr(logoURL)}" alt="Logo" /></div>`
    : "";
  const title = kind === "customer" ? "كشف حساب عميل" : "كشف حساب مورد";
  const partyLabel = kind === "customer" ? "العميل" : "المورد";
  const invoiceTotal = invoices.reduce((s, r) => s + Number(r.total || 0), 0);
  const paidTotal = invoices.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
  const ordersTotal = orders.reduce((s, r) => s + Number(r.total || 0), 0);
  const balance = Number(party?.balance || (kind === "customer" ? invoiceTotal - paidTotal : ordersTotal));
  const credit = Number(party?.credit_balance || 0);
  const net = balance - credit; // >0 owes, <0 has credit
  const netLabel = kind === "customer"
    ? (net > 0.001 ? "صافي المطلوب منكم" : net < -0.001 ? "رصيد دائن لكم" : "الحساب مسدّد بالكامل")
    : (net > 0.001 ? "صافي المستحق لكم" : net < -0.001 ? "مدفوع زيادة" : "الحساب مسدّد");
  const netColor = net > 0.001 ? "#c0392b" : net < -0.001 ? "#15803d" : "#1a1a1a";
  const netValue = Math.abs(net);

  const rows = (items: any[], cols: string[], render: (r: any, i: number) => string) => items.length
    ? `<table><thead><tr><th>#</th>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${items.map(render).join("")}</tbody></table>`
    : `<div class="empty">لا توجد بيانات</div>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(title)} - ${attr(party?.name || "")}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a1a1a; background: #f3f4f6; padding: 80px 12px 24px; line-height: 1.5; font-size: 14px; }
  .toolbar { position: fixed; top: 0; right: 0; left: 0; z-index: 999; background: linear-gradient(135deg, #5b21b6, #7c3aed); color: #fff; padding: 12px; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .toolbar button { background: rgba(255,255,255,0.95); color: #5b21b6; border: 0; padding: 10px 22px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 14px; min-width: 180px; }
  .toolbar button:disabled { opacity: 0.85; cursor: wait; }
  .spinner { width: 16px; height: 16px; border: 2.5px solid rgba(91,33,182,0.25); border-top-color: #5b21b6; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-radius: 8px; }
  .header { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #4a7c59; margin-bottom: 10px; }
  .header-logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .header-logo img { height: 75px; object-fit: contain; }
  .header-title { font-size: 22px; font-weight: 900; color: #c0392b; margin-bottom: 4px; }
  .header-address { font-size: 13px; color: #333; line-height: 1.6; }
  .header-phones { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }
  .doc-title { text-align: center; margin: 14px 0 10px; }
  .doc-title h1 { font-size: 22px; color: #2c3e50; font-weight: 800; display: inline-block; border-bottom: 3px solid #5b2c8e; padding-bottom: 3px; }
  .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px; flex-wrap: wrap; gap: 8px; }
  .info-label { color: #1a1a1a; font-weight: 700; }
  .info-value { color: #c0392b; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; border: 2px solid #1a1a1a; }
  th { background: #5b4cad; color: #fff; padding: 8px 10px; font-size: 13px; border: 1px solid #1a1a1a; }
  td { padding: 7px 10px; text-align: center; font-size: 13px; border: 1px solid #999; }
  tbody tr:nth-child(even) { background: #f8f8f8; }
  .summary-row { display: flex; justify-content: center; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
  .summary-box { border: 2px solid #1a1a1a; border-radius: 6px; padding: 12px 24px; text-align: center; min-width: 170px; flex: 1; }
  .summary-box-title { font-size: 13px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
  .summary-box-value { font-size: 20px; font-weight: 900; color: #2980b9; }
  .section-title { font-size: 15px; font-weight: 900; color: #5b2c8e; margin: 18px 0 6px; }
  .empty { text-align: center; padding: 12px; color: #777; background: #fafafa; border: 1px dashed #ccc; border-radius: 6px; margin: 8px 0; }
  @media print { body { padding: 0; background: #fff; } .toolbar { display: none !important; } .page { box-shadow: none; border-radius: 0; padding: 0; } }
</style></head><body>
<div class="toolbar"><button id="__btn_pdf"><span id="__btn_label">⬇️ تحميل PDF</span></button></div>
<div class="page" id="__doc_root">
  <div class="header"><div class="header-logos">${logoHTML}<div><div class="header-title">${attr(company?.company_name || "")}</div><div class="header-address">${attr(company?.address || "")}</div><div class="header-phones">${attr(company?.phone || "")}</div></div>${logoHTML}</div></div>
  <div class="doc-title"><h1>${attr(title)}</h1></div>
  <div class="info-row"><div><span class="info-label">${partyLabel}:</span> <span class="info-value">${attr(party?.name || "")}</span></div><div><span class="info-label">الرصيد:</span> <span class="info-value">${fmt(balance)}</span></div></div>
  <div class="info-row"><div>${party?.phone ? `<span class="info-label">الهاتف:</span> <span class="info-value">${attr(party.phone)}</span>` : ""}</div><div>${party?.address ? `<span class="info-label">العنوان:</span> <span class="info-value">${attr(party.address)}</span>` : ""}</div></div>
  <div style="margin:10px 0 14px;padding:14px 18px;border:2px solid ${netColor};border-radius:10px;background:#fafafa;display:flex;justify-content:space-between;align-items:center;font-size:15px"><span style="font-weight:800;color:${netColor}">${netLabel}</span><strong style="font-size:22px;color:${netColor}">${fmt(netValue)}</strong></div>
  <div class="summary-row">${kind === "customer" ? `<div class="summary-box"><div class="summary-box-title">إجمالي الفواتير</div><div class="summary-box-value">${fmt(invoiceTotal)}</div></div><div class="summary-box"><div class="summary-box-title">المدفوع</div><div class="summary-box-value">${fmt(paidTotal)}</div></div><div class="summary-box"><div class="summary-box-title">المتبقي</div><div class="summary-box-value">${fmt(invoiceTotal - paidTotal)}</div></div><div class="summary-box"><div class="summary-box-title">رصيد دائن</div><div class="summary-box-value">${fmt(credit)}</div></div>` : `<div class="summary-box"><div class="summary-box-title">إجمالي أوامر الشراء</div><div class="summary-box-value">${fmt(ordersTotal)}</div></div><div class="summary-box"><div class="summary-box-title">الرصيد</div><div class="summary-box-value">${fmt(balance)}</div></div>`}</div>
  ${kind === "customer" ? `<div class="section-title">الفواتير</div>${rows(invoices, ["رقم الفاتورة", "التاريخ", "الإجمالي", "المدفوع", "المتبقي"], (r, i) => `<tr><td>${i + 1}</td><td>${attr(r.invoice_number)}</td><td>${attr(r.date)}</td><td>${fmt(r.total)}</td><td>${fmt(r.paid_amount)}</td><td>${fmt(Number(r.total || 0) - Number(r.paid_amount || 0))}</td></tr>`)}<div class="section-title">عروض الأسعار</div>${rows(quotes, ["رقم العرض", "التاريخ", "الإجمالي", "الحالة"], (r, i) => `<tr><td>${i + 1}</td><td>${attr(r.quote_number)}</td><td>${attr(r.date)}</td><td>${fmt(r.total)}</td><td>${attr(r.status || "-")}</td></tr>`)}<div class="section-title">المرتجعات</div>${rows(returns, ["رقم المرتجع", "التاريخ", "الإجمالي", "الحالة"], (r, i) => `<tr><td>${i + 1}</td><td>${attr(r.return_number)}</td><td>${attr(r.date)}</td><td>${fmt(r.total)}</td><td>${attr(r.status || "-")}</td></tr>`)}` : `<div class="section-title">أوامر الشراء</div>${rows(orders, ["رقم الأمر", "التاريخ", "الإجمالي", "الحالة"], (r, i) => `<tr><td>${i + 1}</td><td>${attr(r.order_number)}</td><td>${attr(r.date)}</td><td>${fmt(r.total)}</td><td>${attr(r.status || "-")}</td></tr>`)}`}
  <div class="section-title">المعاملات</div>${rows(transactions, ["التاريخ", "النوع", "المبلغ", "الوصف"], (r, i) => `<tr><td>${i + 1}</td><td>${attr(r.date)}</td><td>${attr(r.type || "-")}</td><td>${fmt(r.amount)}</td><td>${attr(r.description || "-")}</td></tr>`)}
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>(function(){var btn=document.getElementById('__btn_pdf');var label=document.getElementById('__btn_label');btn.onclick=async function(){btn.disabled=true;label.innerHTML='<span class="spinner"></span> جاري إنشاء PDF...';try{var blob=await window.html2pdf().set({margin:8,filename:${JSON.stringify(title + ".pdf")},image:{type:'jpeg',quality:.95},html2canvas:{scale:2,useCORS:true,logging:false},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}).from(document.getElementById('__doc_root')).outputPdf('blob');var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=${JSON.stringify(title + ".pdf")};document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1000);label.textContent='✓ تم التحميل';setTimeout(function(){btn.disabled=false;label.textContent='⬇️ تحميل PDF';},2000);}catch(e){btn.disabled=false;label.textContent='⬇️ تحميل PDF';alert('فشل توليد PDF: '+(e&&e.message||e));}};})();</script>
</body></html>`;
}

function buildPackagingHTML(args: {
  docTitle: string;
  docNumber: string;
  date: string;
  customer: { name?: string; phone?: string; address?: string } | null;
  company: any;
  rows: Array<{
    packaging_type: string;
    product_name: string;
    packs_count: number;
    pieces_per_pack: number;
    quantity: number;
    weight?: number | string | null;
    dimensions?: string | null;
    cost?: number | null;
    notes?: string | null;
  }>;
  hiddenSections?: string[];
}): string {
  const { docTitle, docNumber, date, customer, company, rows } = args;
  const hidden = new Set((args.hiddenSections || []).map((s) => String(s)));
  const isHidden = (key: string) => hidden.has(key);
  const totalQty = rows.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalCost = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  const accent = "#0d9488";
  const LOGO_FALLBACK = "https://vifrecsqxdbwqtcfkdyb.supabase.co/storage/v1/object/public/company-assets/logo.png";
  const logoURL = company?.logo_url || LOGO_FALLBACK;

  const hasVal = (v: any) => v !== null && v !== undefined && String(v).trim() !== "" && String(v).trim() !== "-" && Number(v) !== 0;
  const hasWeight = !isHidden("col-weight") && rows.some((r) => hasVal(r.weight));
  const hasDimensions = !isHidden("col-dimensions") && rows.some((r) => hasVal(r.dimensions));
  const hasCost = !isHidden("col-cost") && rows.some((r) => Number(r.cost || 0) > 0);
  const hasNotes = !isHidden("col-notes") && rows.some((r) => hasVal(r.notes));
  const showIndex = !isHidden("col-index");
  const showType = !isHidden("col-type");
  const showProduct = !isHidden("col-product");
  const showPacks = !isHidden("col-packs");
  const showPieces = !isHidden("col-pieces");
  const showTotal = !isHidden("col-total");
  const showSummaryBox = hasCost && totalCost > 0;

  const headHTML = `<tr>
    ${showIndex ? `<th style="width:35px;">#</th>` : ""}
    ${showType ? `<th>نوع التغليف</th>` : ""}
    ${showProduct ? `<th>الصنف</th>` : ""}
    ${showPacks ? `<th style="width:70px;">العدد</th>` : ""}
    ${showPieces ? `<th style="width:80px;">عدد القطع</th>` : ""}
    ${showTotal ? `<th style="width:80px;">الإجمالي</th>` : ""}
    ${hasWeight ? `<th style="width:80px;">الوزن</th>` : ""}
    ${hasDimensions ? `<th style="width:110px;">الأبعاد</th>` : ""}
    ${hasCost ? `<th style="width:100px;">التكلفة</th>` : ""}
    ${hasNotes ? `<th>ملاحظات</th>` : ""}
  </tr>`;

  const bodyHTML = rows.length === 0
    ? `<tr><td colspan="10" style="padding:18px;color:#666">لا توجد بنود تغليف</td></tr>`
    : rows.map((r, i) => {
      const packs = Number(r.packs_count ?? 1);
      const pieces = Number(r.pieces_per_pack ?? r.quantity ?? 1);
      const totalQ = Number(r.quantity ?? packs * pieces);
      return `<tr>
        ${showIndex ? `<td>${i + 1}</td>` : ""}
        ${showType ? `<td class="product-name">${attr(r.packaging_type) || "-"}</td>` : ""}
        ${showProduct ? `<td>${attr(r.product_name) || "-"}</td>` : ""}
        ${showPacks ? `<td>${packs}</td>` : ""}
        ${showPieces ? `<td>${pieces}</td>` : ""}
        ${showTotal ? `<td style="font-weight:700;">${totalQ}</td>` : ""}
        ${hasWeight ? `<td>${r.weight ? attr(String(r.weight)) + " كجم" : "-"}</td>` : ""}
        ${hasDimensions ? `<td>${attr(r.dimensions || "-")}</td>` : ""}
        ${hasCost ? `<td style="font-weight:700;">${fmt(Number(r.cost || 0))}</td>` : ""}
        ${hasNotes ? `<td>${attr(r.notes || "-")}</td>` : ""}
      </tr>`;
    }).join("");

  const totalsHTML = `<tr class="total-row">
    ${showIndex ? `<td></td>` : ""}
    ${showType ? `<td></td>` : ""}
    ${showProduct ? `<td style="text-align:right; padding-right:15px;">الإجماليات</td>` : ""}
    ${showPacks ? `<td></td>` : ""}
    ${showPieces ? `<td></td>` : ""}
    ${showTotal ? `<td>${totalQty}</td>` : ""}
    ${hasWeight ? `<td></td>` : ""}
    ${hasDimensions ? `<td></td>` : ""}
    ${hasCost ? `<td>${fmt(totalCost)}</td>` : ""}
    ${hasNotes ? `<td></td>` : ""}
  </tr>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(docTitle)} ${attr(docNumber)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color:#1a1a1a; background:#fff; padding:20px; line-height:1.5; font-size:14px; }
  .toolbar { position: fixed; top: 0; right: 0; left: 0; z-index: 999; background: linear-gradient(135deg, #5b21b6, #7c3aed); color: #fff; padding: 10px; display: flex; justify-content: center; gap: 12px; }
  .toolbar button { background: #fff; color: #5b21b6; border: 0; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px; }
  .page { max-width: 800px; margin: 70px auto 0; }
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
  .signatures { display:flex; justify-content:space-between; padding:20px 50px 10px; margin-top:20px; }
  .sig-box { text-align:center; width:180px; }
  .sig-line { border-top:1px solid #999; margin-top:45px; padding-top:5px; font-size:12px; color:#555; font-weight:600; }
  @media print { .toolbar { display: none !important; } body { padding:0; } .page { margin-top: 0; } }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>
  <div class="page">
    <div class="header">
      <div class="header-logos">
        <div class="header-logo"><img src="${attr(logoURL)}" alt="Logo" /></div>
        <div>
          <div class="header-title">${attr(company?.company_name || company?.name || "")}</div>
          <div class="header-address">${attr(company?.address || "")}</div>
          <div class="header-phones">${attr(company?.phone || "")}</div>
        </div>
        <div class="header-logo"><img src="${attr(logoURL)}" alt="Logo" /></div>
      </div>
    </div>
    <div class="doc-title"><h1>${attr(docTitle)} رقم ${attr(docNumber)}</h1></div>
    <div class="info-row">
      <div class="right">
        <span class="info-label">اسم العميل:</span>
        <span class="info-value">${attr(customer?.name || "كاش")}</span>
      </div>
      <div class="left">
        <span class="info-label">التاريخ:</span>
        <span class="info-value">${attr(date || "")}</span>
      </div>
    </div>
    <div class="info-row">
      <div class="right">
        ${customer?.phone ? `<span class="info-label">الهاتف:</span><span class="info-value">${attr(customer.phone)}</span>` : ""}
        ${customer?.address ? `<span style="margin-right:15px;" class="info-label">العنوان:</span><span class="info-value">${attr(customer.address)}</span>` : ""}
      </div>
      <div class="left">
        <span class="info-label">رقم المستند:</span>
        <span class="info-value-blue">${attr(docNumber)}</span>
      </div>
    </div>

    ${rows.length === 0 ? `<div style="text-align:center; padding:30px; color:#888; font-size:14px; background:#fafafa; border:1px dashed #ccc; border-radius:6px;">لا توجد سجلات تغليف</div>` : `
    <table>
      <thead>${headHTML}</thead>
      <tbody>${bodyHTML}${totalsHTML}</tbody>
    </table>
    ${showSummaryBox ? `<div class="summary-box">
      <div class="summary-box-title">إجمالي تكاليف التغليف</div>
      <div class="summary-box-value">${fmt(totalCost)}</div>
    </div>` : ""}
    `}

    <div class="signatures">
      <div class="sig-box"><div class="sig-line">توقيع المستلم</div></div>
      <div class="sig-box"><div class="sig-line">توقيع المسؤول</div></div>
      <div class="sig-box"><div class="sig-line">ختم الشركة</div></div>
    </div>
  </div>
</body>
</html>`;
}

function buildErrorHTML(message: string, status: number): Response {
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>خطأ</title>
<style>body{font-family:Tahoma,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,.1);text-align:center;max-width:420px}
h2{color:#c0392b;margin-bottom:12px}p{color:#555}</style></head>
<body><div class="box"><h2>تعذّر فتح المستند</h2><p>${attr(message)}</p></div></body></html>`;
  return new Response(html, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = (url.searchParams.get("token") || "").trim();
    if (!token) return buildErrorHTML("رابط غير صالح", 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tk } = await supabase
      .from("document_share_tokens")
      .select("doc_type, doc_id, expires_at, hidden_sections")
      .eq("token", token)
      .maybeSingle();

    if (!tk) return buildErrorHTML("الرابط غير موجود", 404);
    if (new Date(tk.expires_at as string) <= new Date()) {
      return buildErrorHTML("انتهت صلاحية الرابط", 410);
    }

    const { data: companyArr } = await supabase.from("company_settings").select("*").limit(1);
    const company = Array.isArray(companyArr) ? companyArr[0] : null;

    let docTitle = "مستند";
    let docNumber = "";
    let date = "";
    let customer: any = null;
    let items: any[] = [];
    let grandTotal = 0;
    let paidAmount = 0;

    let notes: string | null = null;
    let statementHtml: string | null = null;

    if (tk.doc_type === "invoice") {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*, customers(name, phone, address, balance)")
        .eq("id", tk.doc_id)
        .maybeSingle();
      if (!inv) return buildErrorHTML("الفاتورة غير موجودة", 404);
      docTitle = (inv as any).type === "cash" ? "فاتورة كاش" : "فاتورة مبيعات";
      docNumber = (inv as any).invoice_number || "";
      date = (inv as any).date || "";
      const c = (inv as any).customers;
      customer = c ? { name: c.name, phone: c.phone, address: c.address } : null;
      paidAmount = Number((inv as any).paid_amount || 0);
      grandTotal = Number((inv as any).total || 0);

      notes = (inv as any).notes || null;
      const { data: rows } = await supabase.from("invoice_items").select("*").eq("invoice_id", tk.doc_id);
      items = (rows || []).map((r: any) => ({
        product_name: r.product_name, quantity: r.quantity, unit_price: r.unit_price, total: r.total,
      }));
    } else if (tk.doc_type === "quote") {
      const { data: q } = await supabase
        .from("quotes")
        .select("*, customers(name, phone, address, balance)")
        .eq("id", tk.doc_id)
        .maybeSingle();
      if (!q) return buildErrorHTML("عرض السعر غير موجود", 404);
      docTitle = "عرض سعر";
      docNumber = (q as any).quote_number || "";
      date = (q as any).date || "";
      const c = (q as any).customers;
      customer = c ? { name: c.name, phone: c.phone, address: c.address } : null;
      paidAmount = 0;
      grandTotal = Number((q as any).total || 0);

      notes = (q as any).notes || null;
      const { data: rows } = await supabase.from("quote_items").select("*").eq("quote_id", tk.doc_id);
      items = (rows || []).map((r: any) => ({
        product_name: r.product_name, quantity: r.quantity, unit_price: r.unit_price, total: r.total,
      }));
    } else if (tk.doc_type === "return") {
      const { data: r } = await supabase
        .from("stock_returns")
        .select("*, customers(name, phone, address, balance)")
        .eq("id", tk.doc_id)
        .maybeSingle();
      if (!r) return buildErrorHTML("المرتجع غير موجود", 404);
      docTitle = "مرتجع مبيعات";
      docNumber = (r as any).return_number || "";
      date = (r as any).date || "";
      const c = (r as any).customers;
      customer = c ? { name: c.name, phone: c.phone, address: c.address } : null;
      paidAmount = Number((r as any).paid_amount || 0);
      grandTotal = Number((r as any).total || 0);

      notes = (r as any).reason || null;
      const { data: rows } = await supabase.from("stock_return_items").select("*").eq("stock_return_id", tk.doc_id);
      items = (rows || []).map((x: any) => ({
        product_name: x.product_name, quantity: x.quantity, unit_price: x.unit_price, total: x.total,
      }));
    } else if (tk.doc_type === "statement-customer") {
      const [customerRes, invoicesRes, quotesRes, returnsRes, transactionsRes] = await Promise.all([
        supabase.from("customers").select("name, phone, address, balance, credit_balance").eq("id", tk.doc_id).maybeSingle(),
        supabase.from("invoices").select("invoice_number, date, total, paid_amount").eq("customer_id", tk.doc_id).order("date", { ascending: false }),
        supabase.from("quotes").select("quote_number, date, total, status").eq("customer_id", tk.doc_id).order("date", { ascending: false }),
        supabase.from("stock_returns").select("return_number, date, total, status").eq("customer_id", tk.doc_id).order("date", { ascending: false }),
        supabase.from("transactions").select("date, type, amount, description").eq("customer_id", tk.doc_id).order("date", { ascending: false }),
      ]);
      if (!customerRes.data) return buildErrorHTML("العميل غير موجود", 404);
      statementHtml = buildStatementHTML({
        kind: "customer",
        party: customerRes.data as any,
        company,
        invoices: (invoicesRes.data || []) as any[],
        quotes: (quotesRes.data || []) as any[],
        returns: (returnsRes.data || []) as any[],
        transactions: (transactionsRes.data || []) as any[],
      });
    } else if (tk.doc_type === "statement-supplier") {
      const [supplierRes, ordersRes, transactionsRes] = await Promise.all([
        supabase.from("suppliers").select("name, phone, address, balance").eq("id", tk.doc_id).maybeSingle(),
        supabase.from("purchase_orders").select("order_number, date, total, status").eq("supplier_id", tk.doc_id).order("date", { ascending: false }),
        supabase.from("transactions").select("date, type, amount, description").eq("supplier_id", tk.doc_id).order("date", { ascending: false }),
      ]);
      if (!supplierRes.data) return buildErrorHTML("المورد غير موجود", 404);
      statementHtml = buildStatementHTML({
        kind: "supplier",
        party: supplierRes.data as any,
        company,
        orders: (ordersRes.data || []) as any[],
        transactions: (transactionsRes.data || []) as any[],
      });
    } else if (tk.doc_type === "packaging-invoice" || tk.doc_type === "packaging-quote") {
      const isInv = tk.doc_type === "packaging-invoice";
      const parentTable = isInv ? "invoices" : "quotes";
      const numField = isInv ? "invoice_number" : "quote_number";
      const pkgHeaderTable = isInv ? "invoice_packaging" : "quotes_packaging";
      const pkgItemsTable = isInv ? "invoices_packaging_items" : "quotes_packaging_items";
      const pkgFk = isInv ? "invoice_packaging_id" : "quote_packaging_id";
      const idCol = isInv ? "invoice_id" : "quote_id";
      const { data: doc } = await supabase
        .from(parentTable)
        .select(`*, customers(name, phone, address)`)
        .eq("id", tk.doc_id)
        .maybeSingle();
      if (!doc) return buildErrorHTML("المستند غير موجود", 404);
      const { data: headers } = await supabase
        .from(pkgHeaderTable).select("id").eq(idCol, tk.doc_id);
      const headerIds = (headers || []).map((h: any) => h.id);
      let pkgRows: any[] = [];
      if (headerIds.length) {
        const { data } = await supabase
          .from(pkgItemsTable)
          .select("*, packaging_types(name)")
          .in(pkgFk, headerIds)
          .order("created_at", { ascending: true });
        pkgRows = data || [];
      }
      docTitle = isInv ? "تقرير تغليف فاتورة" : "تقرير تغليف عرض سعر";
      docNumber = (doc as any)[numField] || "";
      date = (doc as any).date || "";
      const c = (doc as any).customers;
      customer = c ? { name: c.name, phone: c.phone, address: c.address } : null;
      const hiddenSectionsForPkg = Array.isArray((tk as any).hidden_sections)
        ? ((tk as any).hidden_sections as unknown[]).filter((s) => typeof s === "string") as string[]
        : [];
      statementHtml = buildPackagingHTML({
        docTitle, docNumber, date, customer, company,
        rows: pkgRows.map((r: any) => ({
          packaging_type: r.packaging_types?.name || "—",
          product_name: r.product_name || "—",
          packs_count: Number(r.packs_count || 0),
          pieces_per_pack: Number(r.pieces_per_pack || 0),
          quantity: Number(r.quantity || 0),
          weight: r.weight ?? null,
          dimensions: r.dimensions ?? null,
          cost: r.total ?? r.cost ?? 0,
          notes: r.notes ?? null,
        })),
        hiddenSections: hiddenSectionsForPkg,
      });
    } else if (tk.doc_type === "unavailable-invoice" || tk.doc_type === "unavailable-quote") {
      const isInv = tk.doc_type === "unavailable-invoice";
      const parentTable = isInv ? "invoices" : "quotes";
      const numField = isInv ? "invoice_number" : "quote_number";
      const archiveTable = isInv ? "deleted_invoice_items" : "deleted_quote_items";
      const fkCol = isInv ? "invoice_id" : "quote_id";
      const { data: doc } = await supabase
        .from(parentTable)
        .select(`*, customers(name, address)`)
        .eq("id", tk.doc_id)
        .maybeSingle();
      if (!doc) return buildErrorHTML("المستند غير موجود", 404);
      const { data: archived } = await supabase
        .from(archiveTable)
        .select("product_name, quantity, unit, unit_price, total, deleted_at")
        .eq(fkCol, tk.doc_id)
        .order("deleted_at", { ascending: false });
      docTitle = isInv ? "أصناف غير متوفرة - فاتورة" : "أصناف غير متوفرة - عرض سعر";
      docNumber = (doc as any)[numField] || "";
      date = (doc as any).date || "";
      const c = (doc as any).customers;
      // Important: do NOT include customer phone in any printed/preview output.
      customer = c ? { name: c.name, address: c.address } : null;
      const aRows = (archived || []) as any[];
      const logoURL = company?.logo_url || "";
      const logoHTML = logoURL ? `<div class="header-logo"><img src="${attr(logoURL)}" alt="Logo"/></div>` : "";
      const bodyHTML = aRows.length === 0
        ? `<tr><td colspan="3" style="padding:18px;color:#666">لا توجد أصناف</td></tr>`
        : aRows.map((r: any, i: number) => `<tr>
            <td style="width:35px">${i + 1}</td>
            <td class="product-name">${attr(r.product_name || "-")}</td>
            <td style="width:140px;font-weight:700">${attr(r.quantity ?? "-")}${r.unit ? " " + attr(r.unit) : ""}</td>
          </tr>`).join("");
      statementHtml = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(docTitle)} ${attr(docNumber)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:20px;line-height:1.5;font-size:14px}
  .toolbar{position:fixed;top:0;right:0;left:0;z-index:999;background:linear-gradient(135deg,#5b21b6,#7c3aed);color:#fff;padding:10px;display:flex;justify-content:center;gap:12px}
  .toolbar button{background:#fff;color:#5b21b6;border:0;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px}
  .page{max-width:800px;margin:70px auto 0}
  .header{text-align:center;padding-bottom:10px;border-bottom:3px solid #c0392b;margin-bottom:10px}
  .header-logos{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .header-logo img{height:75px;object-fit:contain}
  .header-title{font-size:22px;font-weight:900;color:#c0392b;margin-bottom:4px}
  .header-address{font-size:13px;color:#333;line-height:1.6}
  .header-phones{font-size:14px;font-weight:700;color:#1a1a1a;margin-top:2px}
  .doc-title{text-align:center;margin:14px 0 10px}
  .doc-title h1{font-size:22px;color:#c0392b;font-weight:800;display:inline-block;border-bottom:3px solid #c0392b;padding-bottom:3px}
  .info-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:14px}
  .info-label{color:#1a1a1a;font-weight:700}
  .info-value{color:#c0392b;font-weight:700}
  table{width:100%;border-collapse:collapse;margin:12px 0;border:2px solid #1a1a1a}
  thead th{background:#c0392b;color:#fff;padding:8px 10px;font-size:13px;font-weight:700;text-align:center;border:1px solid #1a1a1a}
  tbody td{padding:7px 10px;text-align:center;font-size:13px;border:1px solid #999}
  tbody tr:nth-child(even){background:#fdf6f6}
  .product-name{text-align:right;font-weight:600}
  .footer-note{margin:20px 0 10px;padding:12px;border:1px dashed #c0392b;background:#fdf6f6;border-radius:6px;text-align:center;font-weight:700;color:#7a1f1f}
  @media print{.toolbar{display:none!important}body{padding:0}.page{margin-top:0}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>
<div class="page">
  <div class="header"><div class="header-logos">${logoHTML}<div>
    <div class="header-title">${attr(company?.company_name || "")}</div>
    <div class="header-address">${attr(company?.address || "")}</div>
    <div class="header-phones">${attr(company?.phone || "")}</div>
  </div>${logoHTML}</div></div>
  <div class="doc-title"><h1>${attr(docTitle)} ${docNumber ? "رقم " + attr(docNumber) : ""}</h1></div>
  <div class="info-row">
    <div><span class="info-label">اسم العميل:</span> <span class="info-value">${attr(customer?.name || "—")}</span></div>
    <div><span class="info-label">التاريخ:</span> <span class="info-value">${attr(date)}</span></div>
  </div>
  <table><thead><tr><th style="width:35px">#</th><th>الصنف</th><th style="width:140px">الكمية المطلوبة</th></tr></thead>
  <tbody>${bodyHTML}</tbody></table>
  <div class="footer-note">نأسف لعدم توفر هذه الأصناف حالياً، نرجو إفادتنا بالبدائل المناسبة أو الموافقة على استبعادها من الطلب.</div>
</div></body></html>`;
    } else if (tk.doc_type === "credit-charge") {
      const { data: tx } = await supabase
        .from("transactions")
        .select("id, amount, date, method, description, allocation, customers(name, phone, address, balance, credit_balance)")
        .eq("id", tk.doc_id)
        .maybeSingle();
      if (!tx) return buildErrorHTML("الإيصال غير موجود", 404);
      const c = (tx as any).customers;
      const cust = c ? { name: c.name, phone: c.phone, address: c.address } : { name: "—" };
      const alloc = (tx as any).allocation || {};
      const amount = Number((tx as any).amount || 0);
      const balanceBefore = Number(alloc.balance_before ?? 0);
      const balanceAfter = Number(alloc.balance_after ?? Math.max(0, balanceBefore - amount));
      const freshBalance = Number(c?.balance || 0);
      const freshCredit = Number(c?.credit_balance || 0);
      const netNow = freshBalance - freshCredit;
      const netLabel = netNow > 0.001 ? "صافي المطلوب منكم بعد الشحن" : netNow < -0.001 ? "رصيد دائن لكم بعد الشحن" : "تم تسديد الحساب بالكامل ✅";
      const netColor = netNow > 0.001 ? "#c0392b" : "#15803d";
      const netValue = Math.abs(netNow);
      const methodTxt = (tx as any).method === "bank_transfer" ? "تحويل بنكي" : (tx as any).method === "card" ? "بطاقة" : "نقدي";
      const items: Array<{ invoice_number: string; applied: number }> = Array.isArray(alloc.items) ? alloc.items : [];
      const leftover = Number(alloc.leftover || 0);
      const logoURL = company?.logo_url || "";
      const logoHTML = logoURL ? `<div class="header-logo"><img src="${attr(logoURL)}" alt="Logo"/></div>` : "";
      const allocRows = items.length === 0
        ? `<tr><td colspan="2" style="padding:14px;color:#666;text-align:center">لا توجد فواتير مسدّدة — أُضيف المبلغ كرصيد دائن.</td></tr>`
        : items.map((r, i) => `<tr>
            <td style="width:60px">${i + 1}</td>
            <td>#${attr(r.invoice_number)}</td>
            <td style="width:160px;font-weight:700">${Number(r.applied || 0).toLocaleString()}</td>
          </tr>`).join("");
      statementHtml = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>إيصال شحن رصيد - ${attr(cust.name)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:20px;line-height:1.55;font-size:14px}
  .toolbar{position:fixed;top:0;right:0;left:0;z-index:999;background:linear-gradient(135deg,#15803d,#16a34a);color:#fff;padding:10px;display:flex;justify-content:center;gap:12px}
  .toolbar button{background:#fff;color:#15803d;border:0;padding:8px 18px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px}
  .page{max-width:800px;margin:70px auto 0}
  .header{text-align:center;padding-bottom:10px;border-bottom:3px solid #15803d;margin-bottom:12px}
  .header-logos{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .header-logo img{height:75px;object-fit:contain}
  .header-title{font-size:22px;font-weight:900;color:#15803d;margin-bottom:4px}
  .header-address{font-size:13px;color:#333;line-height:1.6}
  .doc-title{text-align:center;margin:12px 0 14px}
  .doc-title h1{font-size:22px;color:#15803d;font-weight:800;display:inline-block;border-bottom:3px solid #15803d;padding-bottom:3px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin:10px 0 16px;font-size:14px}
  .info-grid .lbl{color:#555;font-weight:700}
  .info-grid .val{color:#15803d;font-weight:800}
  .amount-box{margin:14px 0;padding:18px;border:2px dashed #15803d;background:#f0fdf4;border-radius:10px;text-align:center}
  .amount-box .lbl{font-size:14px;color:#15803d;font-weight:700;margin-bottom:6px}
  .amount-box .val{font-size:30px;font-weight:900;color:#15803d}
  table{width:100%;border-collapse:collapse;margin:8px 0;border:2px solid #1a1a1a}
  thead th{background:#15803d;color:#fff;padding:8px 10px;font-size:13px;font-weight:700;text-align:center;border:1px solid #1a1a1a}
  tbody td{padding:7px 10px;text-align:center;font-size:13px;border:1px solid #999}
  tbody tr:nth-child(even){background:#f7fff9}
  .balance-row{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin:8px 0;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-size:14px}
  .balance-row.after{background:#f0fdf4;border-color:#86efac}
  .footer-note{margin-top:16px;padding:10px;text-align:center;font-size:12px;color:#555}
  @media print{.toolbar{display:none!important}body{padding:0}.page{margin-top:0}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>
<div class="page">
  <div class="header"><div class="header-logos">${logoHTML}<div>
    <div class="header-title">${attr(company?.company_name || "")}</div>
    <div class="header-address">${attr(company?.address || "")}</div>
    <div class="header-address">${attr(company?.phone || "")}</div>
  </div>${logoHTML}</div></div>
  <div class="doc-title"><h1>إيصال شحن رصيد</h1></div>
  <div class="info-grid">
    <div><span class="lbl">العميل:</span> <span class="val">${attr(cust.name)}</span></div>
    <div><span class="lbl">التاريخ:</span> <span class="val">${attr((tx as any).date || "")}</span></div>
    <div><span class="lbl">طريقة الدفع:</span> <span class="val">${attr(methodTxt)}</span></div>
    <div><span class="lbl">رقم الإيصال:</span> <span class="val">${attr(String((tx as any).id).slice(0, 8).toUpperCase())}</span></div>
  </div>
  <div class="amount-box">
    <div class="lbl">المبلغ المشحون</div>
    <div class="val">${amount.toLocaleString()}</div>
  </div>
  <div class="balance-row"><span>الرصيد قبل الشحن</span><strong>${balanceBefore.toLocaleString()}</strong></div>
  <h3 style="margin:14px 0 6px;color:#15803d">الفواتير المسدّدة من هذه الدفعة</h3>
  <table><thead><tr><th>#</th><th>رقم الفاتورة</th><th>المبلغ المخصّص</th></tr></thead>
  <tbody>${allocRows}</tbody></table>
  ${leftover > 0 ? `<div style="margin:8px 0;padding:10px;border-radius:8px;background:#fefce8;border:1px solid #fde047;text-align:center;font-weight:700">رصيد دائن متبقٍ لصالحك: ${leftover.toLocaleString()}</div>` : ""}
  <div class="balance-row after"><span>الرصيد بعد الشحن</span><strong>${balanceAfter.toLocaleString()}</strong></div>
  <div style="margin:14px 0 4px;padding:16px 20px;border:2px solid ${netColor};border-radius:12px;background:#fafafa;display:flex;justify-content:space-between;align-items:center"><span style="font-weight:800;font-size:15px;color:${netColor}">${netLabel}</span><strong style="font-size:24px;color:${netColor}">${netValue.toLocaleString()}</strong></div>
  <div class="footer-note">شكراً لتعاملكم معنا — هذا الإيصال صادر إلكترونياً ومعتمد بدون توقيع.</div>
</div></body></html>`;
    } else {
      return buildErrorHTML("نوع المستند غير مدعوم", 400);
    }

    const hiddenSections = Array.isArray((tk as any).hidden_sections)
      ? ((tk as any).hidden_sections as unknown[]).filter((s) => typeof s === "string") as string[]
      : [];
    const html = statementHtml || buildDocHTML({ docTitle, docNumber, date, customer, items, grandTotal, paidAmount, notes, company, hiddenSections });
    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e: any) {
    return buildErrorHTML("خطأ في الخادم: " + (e?.message || String(e)), 500);
  }
});
