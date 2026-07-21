import { supabase } from "@/integrations/supabase/client";

export interface PrintMove {
  date: string;
  created_at: string;
  type: string;
  typeLabel: string;
  product_name: string;
  warehouse_name: string;
  qty: number;
  balance_after: number | null;
  doc_number: string;
  doc_ref?: string | null;
  party_name: string;
  reason?: string | null;
}

export interface StockPrintOptions {
  from: string;
  to: string;
  rows: PrintMove[];
  totals: { incoming: number; outgoing: number; net: number; opening: number | null; closing: number | null };
  filters: {
    product?: string | null;
    warehouse?: string | null;
    types?: string[];
    query?: string;
  };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("ar-EG-u-nu-latn");

const arDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "medium" }).format(new Date(iso));

/** Builds the A4 landscape HTML document (used by both print preview and PDF export). */
export async function renderStockMovementsHTML(opts: StockPrintOptions, includeToolbar = false): Promise<string> {
  const { data: companyArr } = await (supabase as any)
    .from("company_settings").select("name, logo_url, phone, address").limit(1);
  const company = Array.isArray(companyArr) ? companyArr[0] : null;

  const filterBits: string[] = [];
  if (opts.filters.product) filterBits.push(`المنتج: ${esc(opts.filters.product)}`);
  if (opts.filters.warehouse) filterBits.push(`المستودع: ${esc(opts.filters.warehouse)}`);
  if (opts.filters.types?.length) filterBits.push(`الأنواع: ${opts.filters.types.map(esc).join("، ")}`);
  if (opts.filters.query) filterBits.push(`بحث: ${esc(opts.filters.query)}`);

  const rowsHtml = opts.rows.map((m, i) => {
    const isIn = m.qty > 0;
    const refBit = m.doc_ref ? `<div class="small mono">#${esc(m.doc_ref)}</div>` : "";
    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="c nowrap">${esc(m.date)}</td>
        <td><span class="badge ${isIn ? "in" : "out"}">${esc(m.typeLabel)}</span></td>
        <td>${esc(m.product_name)}</td>
        <td>${esc(m.warehouse_name)}</td>
        <td class="c num ${isIn ? "pos" : "neg"}">${isIn ? "+" : ""}${fmt(m.qty)}</td>
        <td class="c num">${fmt(m.balance_after)}</td>
        <td class="nowrap"><div>${esc(m.doc_number)}</div>${refBit}</td>
        <td>${esc(m.party_name)}</td>
        <td class="small">${esc(m.reason || "")}</td>
      </tr>`;
  }).join("");

  const toolbar = includeToolbar ? `
    <div class="toolbar noprint">
      <button onclick="window.print()" class="tb-btn primary">🖨️ طباعة</button>
      <button onclick="window.close()" class="tb-btn">إغلاق</button>
      <span class="tb-hint">معاينة قبل الطباعة — راجع التقرير ثم اضغط طباعة</span>
    </div>` : "";

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>تقرير حركات المخزون — ${esc(opts.from)} إلى ${esc(opts.to)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Cairo", "Tajawal", Arial, sans-serif; font-weight: 600; color: #0f172a; margin: 0; padding: 12px; font-size: 12px; background:#f8fafc; }
  .sheet { background:#fff; max-width: 297mm; margin: 0 auto; padding: 10mm; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .toolbar { position: sticky; top: 0; z-index: 50; background:#0f172a; color:#fff; padding:8px 12px; display:flex; align-items:center; gap:10px; margin: -12px -12px 12px; }
  .tb-btn { background:#fff; color:#0f172a; border:1px solid #cbd5e1; border-radius:6px; padding:6px 12px; font-family:inherit; font-weight:700; cursor:pointer; font-size:12px; }
  .tb-btn.primary { background:#059669; color:#fff; border-color:#047857; }
  .tb-btn:hover { opacity:.9; }
  .tb-hint { color:#cbd5e1; font-size:11px; margin-inline-start:auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
  .header .co { display: flex; align-items: center; gap: 10px; }
  .header img { height: 48px; }
  .header h1 { margin: 0; font-size: 18px; }
  .header .meta { text-align: left; font-size: 11px; color: #475569; }
  .filters { font-size: 11px; color: #334155; margin-bottom: 8px; padding: 6px 8px; background: #f1f5f9; border-radius: 6px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
  .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; }
  .card .l { font-size: 10px; color: #64748b; }
  .card .v { font-size: 16px; font-weight: 800; margin-top: 2px; }
  .card.in .v { color: #059669; }
  .card.out .v { color: #dc2626; }
  .card.pri .v { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: right; vertical-align: top; }
  th { background: #0f172a; color: #fff; font-weight: 700; font-size: 11px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .c { text-align: center; }
  .nowrap { white-space: nowrap; }
  .num { font-variant-numeric: tabular-nums; font-weight: 700; }
  .pos { color: #059669; }
  .neg { color: #dc2626; }
  .small { font-size: 10px; color: #475569; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: -0.3px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 700; border: 1px solid; }
  .badge.in { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }
  .badge.out { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
  .footer { margin-top: 10px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
  .empty { text-align: center; padding: 30px; color: #64748b; font-size: 13px; }
  @media print {
    body { background:#fff; padding:0; }
    .sheet { box-shadow:none; padding:0; max-width:none; }
    .noprint { display: none !important; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
${toolbar}
<div class="sheet">
  <div class="header">
    <div class="co">
      ${company?.logo_url ? `<img src="${esc(company.logo_url)}" alt="logo" />` : ""}
      <div>
        <h1>${esc(company?.name || "تقرير حركات المخزون")}</h1>
        <div class="small">${esc(company?.phone || "")} ${company?.address ? " · " + esc(company.address) : ""}</div>
      </div>
    </div>
    <div class="meta">
      <div><b>تقرير حركات المخزون</b></div>
      <div>الفترة: ${esc(arDate(opts.from))} — ${esc(arDate(opts.to))}</div>
      <div>تاريخ الطباعة: ${esc(arDate(new Date().toISOString().slice(0, 10)))}</div>
    </div>
  </div>

  ${filterBits.length ? `<div class="filters">${filterBits.join(" · ")}</div>` : ""}

  <div class="cards">
    <div class="card"><div class="l">رصيد افتتاحي</div><div class="v">${fmt(opts.totals.opening)}</div></div>
    <div class="card in"><div class="l">وارد</div><div class="v">+${fmt(opts.totals.incoming)}</div></div>
    <div class="card out"><div class="l">صادر</div><div class="v">−${fmt(opts.totals.outgoing)}</div></div>
    <div class="card pri"><div class="l">رصيد ختامي</div><div class="v">${fmt(opts.totals.closing)}</div></div>
  </div>

  ${opts.rows.length === 0 ? `<div class="empty">لا توجد حركات مطابقة للفلاتر المحددة.</div>` : `
  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th style="width:90px">التاريخ</th>
        <th style="width:90px">النوع</th>
        <th>المنتج</th>
        <th style="width:110px">المستودع</th>
        <th style="width:70px">الكمية</th>
        <th style="width:80px">الرصيد بعد</th>
        <th style="width:130px">المستند / المرجع</th>
        <th style="width:130px">الجهة</th>
        <th style="width:130px">ملاحظات</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <th colspan="5" class="c">الإجمالي (${fmt(opts.rows.length)} حركة)</th>
        <th class="c num">صافي: ${opts.totals.net >= 0 ? "+" : ""}${fmt(opts.totals.net)}</th>
        <th colspan="4"></th>
      </tr>
    </tfoot>
  </table>`}

  <div class="footer">
    <span>عدد الحركات: ${fmt(opts.rows.length)}</span>
    <span>${esc(company?.name || "")}</span>
  </div>
</div>
</body>
</html>`;
}

/** Opens a print preview window with a toolbar — user clicks طباعة to trigger print. */
export async function printStockMovements(opts: StockPrintOptions): Promise<void> {
  const html = await renderStockMovementsHTML(opts, true);
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) throw new Error("تعذّر فتح نافذة المعاينة — تحقق من إعدادات المتصفح");
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Downloads the same report as a PDF (A4 landscape) using html2pdf. */
export async function downloadStockMovementsPdf(opts: StockPrintOptions): Promise<void> {
  const html = await renderStockMovementsHTML(opts, false);
  // Build an offscreen iframe so styles apply cleanly.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1200px";
  iframe.style.height = "800px";
  document.body.appendChild(iframe);
  const idoc = iframe.contentDocument!;
  idoc.open(); idoc.write(html); idoc.close();
  // Wait for images (logo) to load.
  await new Promise<void>((resolve) => {
    const imgs = Array.from(idoc.images);
    if (imgs.length === 0) return resolve();
    let left = imgs.length;
    const done = () => { if (--left <= 0) resolve(); };
    imgs.forEach((img) => {
      if (img.complete) done();
      else { img.onload = done; img.onerror = done; }
    });
    setTimeout(resolve, 1500);
  });
  try {
    const html2pdf = (await import("html2pdf.js")).default as any;
    const target = idoc.body.querySelector(".sheet") as HTMLElement || idoc.body;
    await html2pdf()
      .from(target)
      .set({
        margin: 5,
        filename: `stock-movements-${opts.from}_${opts.to}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .save();
  } finally {
    iframe.remove();
  }
}
