// Pure customer-share HTML template.
//
// This module is intentionally free of Deno / esm.sh imports so it can be
// imported from three places:
//   1. supabase/functions/document-share/index.ts        (Deno edge fn)
//   2. supabase/functions/document-share/index_test.ts   (Deno tests)
//   3. src/test/shareVsPrintTemplate.test.ts + e2e specs (Node / Playwright)
//
// The share template MUST stay in lock-step with src/utils/printTemplate.ts
// for these contracts (checked by tests on both sides):
//   * `data-section="account-summary"` wraps the two summary boxes
//   * `data-section="paid-amount"`  → "المبلغ المدفوع" = paidAmount
//   * `data-section="final-total"`  → "المطلوب النهائي" = max(0, grandTotal - paidAmount)
//   * `<meta name="lov-doc-label|lov-doc-number|lov-customer-name">` for unified PDF naming
//   * PDF filename format: "<label> - <customer> - <number>.pdf"

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

export function buildDocHTML(args: {
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
  <div class="summary-row" data-section="account-summary" data-section-label="ملخص الحساب">
    <div class="summary-box" data-section="paid-amount" data-section-label="المبلغ المدفوع"><div class="summary-box-title">المبلغ المدفوع</div><div class="summary-box-value" style="color:#16a34a;">${fmt(paidAmount)}</div></div>
    <div class="summary-box" data-section="final-total" data-section-label="المطلوب النهائي" style="border-color:#2980b9;"><div class="summary-box-title">المطلوب النهائي</div><div class="summary-box-value blue">${fmt(finalTotal)}</div></div>
  </div>


  ${notes ? `<div class="notes-section" data-section="notes"><h4>📝 ملاحظات</h4><p>${attr(notes)}</p></div>` : ""}
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
(function(){
  // اسم ملف PDF يطابق قالب الطباعة الرسمية (buildWaFileName في printTemplate.ts):
  //   "<اسم المستند> - <اسم العميل> - <رقم المستند>.pdf"
  //   مثال: "فاتورة مبيعات - أحمد علي - INV-001.pdf"
  var __docLabel  = ${JSON.stringify(String(docTitle || "مستند"))};
  var __docNumber = ${JSON.stringify(String(docNumber || ""))};
  var __customer  = ${JSON.stringify(String(customer?.name || "بدون اسم"))};
  function __cleanName(s){
    s = (s || '').toString().trim();
    if (!s || s === '-' || s === '—' || s === '_' || s === 'undefined' || s === 'null') return '';
    s = s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }
  var __parts = [__cleanName(__docLabel) || 'مستند', __cleanName(__customer) || 'بدون اسم'];
  if (__cleanName(__docNumber)) __parts.push(__cleanName(__docNumber));
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
