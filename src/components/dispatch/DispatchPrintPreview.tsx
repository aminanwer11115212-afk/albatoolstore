/**
 * DispatchPrintPreview — لوحة معاينة طباعة A4 للفواتير الجاهزة للرفع المختارة.
 * تعرض لكل فاتورة: ترويسة + جدول التغليف + بيانات الجهة المُرحَّل إليها + جدول الترحيلات.
 * تُقسِّم الكروت على عدة صفحات A4 تلقائيًا حسب الارتفاع المقاس، مع تنقل وطباعة.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, ChevronRight, ChevronLeft, Eye } from "lucide-react";

type Props = {
  selectedIds: Set<string>;
  company: any;
};

// A4 portrait @ 96dpi
const A4_WIDTH = 794;
const A4_HEIGHT = 1123;
const PAGE_PADDING = 38; // ~10mm in px
const USABLE_HEIGHT = A4_HEIGHT - PAGE_PADDING * 2;

const fmtDateAr = (d?: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function DispatchPrintPreview({ selectedIds, company }: Props) {
  const ids = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const { data, isLoading } = useQuery({
    queryKey: ["dispatch-preview-invoices", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select(
          `id, invoice_number, date, total, currency_code, customer_id,
           customers(id, name, phone),
           invoice_packaging(
             id, packs_count, pieces_per_pack, quantity, notes,
             packaging_types(id, name)
           ),
           invoice_transports(
             id, transport_date, driver_name, vehicle_number, status, cost,
             transporters(id, name),
             destinations(id, name)
           )`
        )
        .in("id", ids);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  const invoices = data ?? EMPTY_INVOICES;

  // Measure card heights after render → distribute to pages
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [pages, setPages] = useState<string[][]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reset page when selection changes
  useEffect(() => {
    setCurrentPage(0);
  }, [ids.length, ids.join(",")]);

  // Compute pagination after invoices render
  useLayoutEffect(() => {
    if (invoices.length === 0) {
      setPages([]);
      return;
    }
    const heights: Record<string, number> = {};
    for (const inv of invoices) {
      const el = cardRefs.current.get(inv.id);
      heights[inv.id] = el ? el.getBoundingClientRect().height + 12 /* gap */ : 300;
    }
    const result: string[][] = [];
    let current: string[] = [];
    let used = 0;
    for (const inv of invoices) {
      const h = heights[inv.id] || 300;
      if (current.length > 0 && used + h > USABLE_HEIGHT) {
        result.push(current);
        current = [];
        used = 0;
      }
      current.push(inv.id);
      used += h;
    }
    if (current.length > 0) result.push(current);
    setPages(result);
    setCurrentPage((p) => Math.min(p, Math.max(0, result.length - 1)));
  }, [invoices]);

  // Scale page to fit container width
  useLayoutEffect(() => {
    const recalc = () => {
      const w = containerRef.current?.clientWidth || A4_WIDTH;
      const s = Math.min(1, (w - 16) / A4_WIDTH);
      setScale(s);
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  const invoiceById = useMemo(() => {
    const m = new Map<string, any>();
    invoices.forEach((i) => m.set(i.id, i));
    return m;
  }, [invoices]);

  const handlePrint = (mode: "current" | "all") => {
    const pagesToPrint = mode === "current" ? [pages[currentPage] || []] : pages;
    if (pagesToPrint.length === 0 || pagesToPrint[0].length === 0) return;
    const html = buildPrintHTML(
      pagesToPrint.map((ids) => ids.map((id) => invoiceById.get(id)).filter(Boolean)),
      company
    );
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.print();
      win.onafterprint = () => win.close();
    };
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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

  const totalPages = Math.max(pages.length, 1);
  const currentInvoiceIds = pages[currentPage] || [];

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
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            title="الصفحة السابقة"
          >
            <ChevronRight size={14} />
          </button>
          <span className="dpp-pageinfo">
            صفحة <b>{currentPage + 1}</b> من <b>{totalPages}</b>
          </span>
          <button
            type="button"
            className="dpp-nav-btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            title="الصفحة التالية"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="dpp-actions">
        <button
          type="button"
          className="dpp-btn dpp-btn-primary"
          onClick={() => handlePrint("current")}
          disabled={isLoading || pages.length === 0}
        >
          <Printer size={13} />
          طباعة الصفحة الحالية
        </button>
        <button
          type="button"
          className="dpp-btn dpp-btn-ghost"
          onClick={() => handlePrint("all")}
          disabled={isLoading || pages.length === 0}
        >
          <Printer size={13} />
          طباعة الكل ({totalPages})
        </button>
      </div>

      {/* A4 visible page */}
      <div className="dpp-viewport" ref={containerRef}>
        {isLoading ? (
          <div className="dpp-empty"><div className="dpp-empty-title">جارٍ التحميل…</div></div>
        ) : (
          <div className="dpp-scale" style={{ transform: `scale(${scale})`, width: A4_WIDTH }}>
            <div className="a4-page">
              <PageHeader company={company} />
              <div className="a4-body">
                {currentInvoiceIds.map((id) => {
                  const inv = invoiceById.get(id);
                  if (!inv) return null;
                  return (
                    <InvoiceCard
                      key={id}
                      invoice={inv}
                    />
                  );
                })}
              </div>
              <div className="a4-footer">
                {company?.name || "البتول ستور"} — صفحة {currentPage + 1} / {totalPages}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden measure pool (off-screen) for accurate height calc */}
      <div className="dpp-measure" aria-hidden="true">
        <div style={{ width: A4_WIDTH }}>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              ref={(el) => {
                if (el) cardRefs.current.set(inv.id, el);
              }}
            >
              <InvoiceCard invoice={inv} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Invoice card ─────────────────────────────────────────────────────────────
function InvoiceCard({ invoice }: { invoice: any }) {
  const packaging = invoice.invoice_packaging || [];
  const transports = invoice.invoice_transports || [];
  const totalPieces = packaging.reduce(
    (s: number, p: any) => s + (Number(p.packs_count || 0) * Number(p.pieces_per_pack || 0)),
    0
  );
  const firstT = transports[0];

  return (
    <div className="inv-card">
      <div className="inv-card-head">
        <div className="inv-card-num">فاتورة #{invoice.invoice_number}</div>
        <div className="inv-card-cust">{invoice.customers?.name || "كاش"}</div>
        <div className="inv-card-date">{fmtDateAr(invoice.date)}</div>
      </div>

      {/* الجهة المرحَّل إليها */}
      <div className="inv-card-dest">
        <span className="lbl">الجهة المُرحَّل إليها:</span>
        <span><b>الناقل:</b> {firstT?.transporters?.name || "—"}</span>
        <span><b>الوجهة:</b> {firstT?.destinations?.name || "—"}</span>
        {firstT?.driver_name && <span><b>السائق:</b> {firstT.driver_name}</span>}
        {firstT?.vehicle_number && <span><b>المركبة:</b> {firstT.vehicle_number}</span>}
      </div>

      {/* جدول التغليف */}
      <div className="inv-card-section-title">التغليف</div>
      {packaging.length === 0 ? (
        <div className="inv-card-empty">لا يوجد تغليف مُسجَّل</div>
      ) : (
        <table className="inv-card-table">
          <thead>
            <tr>
              <th className="w-8">#</th>
              <th>نوع التغليف</th>
              <th className="w-20">عدد الطرود</th>
              <th className="w-24">قطع/الطرد</th>
              <th className="w-20">الإجمالي</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {packaging.map((p: any, i: number) => {
              const sub = Number(p.packs_count || 0) * Number(p.pieces_per_pack || 0);
              return (
                <tr key={p.id}>
                  <td className="ta-c">{i + 1}</td>
                  <td>{p.packaging_types?.name || "—"}</td>
                  <td className="ta-c">{p.packs_count || 0}</td>
                  <td className="ta-c">{p.pieces_per_pack || 0}</td>
                  <td className="ta-c"><b>{sub}</b></td>
                  <td className="muted">{p.notes || ""}</td>
                </tr>
              );
            })}
            <tr className="inv-card-total-row">
              <td colSpan={4} className="ta-l"><b>إجمالي القطع</b></td>
              <td className="ta-c"><b>{totalPieces}</b></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      )}

      {/* جدول الترحيلات (إن تعددت) */}
      {transports.length > 1 && (
        <>
          <div className="inv-card-section-title">الترحيلات</div>
          <table className="inv-card-table">
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>الناقل</th>
                <th>الوجهة</th>
                <th className="w-24">التاريخ</th>
                <th className="w-20">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((t: any, i: number) => (
                <tr key={t.id}>
                  <td className="ta-c">{i + 1}</td>
                  <td>{t.transporters?.name || "—"}</td>
                  <td>{t.destinations?.name || "—"}</td>
                  <td className="ta-c">{fmtDateAr(t.transport_date)}</td>
                  <td className="ta-c">{t.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────────────────
function PageHeader({ company }: { company: any }) {
  const dateStr = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <div className="a4-header">
      <div className="a4-header-right">
        {company?.logo_url && (
          <img src={company.logo_url} alt="logo" className="a4-logo" />
        )}
        <div>
          <div className="a4-company-name">{company?.name || "أولاد جابر — البتول ستور"}</div>
          {company?.phone && <div className="a4-company-sub">{company.phone}</div>}
        </div>
      </div>
      <div className="a4-header-left">
        <div className="a4-title">تقرير ترحيل الفواتير</div>
        <div className="a4-date">{dateStr}</div>
      </div>
    </div>
  );
}

// ── Print HTML builder ───────────────────────────────────────────────────────
function buildPrintHTML(pages: any[][], company: any) {
  const dateStr = new Date().toLocaleDateString("ar-SA", {
    year: "numeric", month: "long", day: "numeric",
  });
  const fmt = (d?: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const renderCard = (inv: any) => {
    const packaging = inv.invoice_packaging || [];
    const transports = inv.invoice_transports || [];
    const totalPieces = packaging.reduce(
      (s: number, p: any) => s + (Number(p.packs_count || 0) * Number(p.pieces_per_pack || 0)),
      0
    );
    const firstT = transports[0];

    const packRows = packaging.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#888;padding:8px">لا يوجد تغليف مُسجَّل</td></tr>`
      : packaging.map((p: any, i: number) => {
          const sub = Number(p.packs_count || 0) * Number(p.pieces_per_pack || 0);
          return `<tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${p.packaging_types?.name || "—"}</td>
            <td style="text-align:center">${p.packs_count || 0}</td>
            <td style="text-align:center">${p.pieces_per_pack || 0}</td>
            <td style="text-align:center"><b>${sub}</b></td>
            <td style="color:#666">${p.notes || ""}</td>
          </tr>`;
        }).join("") + `<tr style="background:#f4f4f4">
            <td colspan="4" style="text-align:right"><b>إجمالي القطع</b></td>
            <td style="text-align:center"><b>${totalPieces}</b></td>
            <td></td>
          </tr>`;

    const transRows = transports.length > 1
      ? `<div class="section-title">الترحيلات</div>
         <table class="card-table">
           <thead><tr>
             <th style="width:28px">#</th><th>الناقل</th><th>الوجهة</th>
             <th style="width:90px">التاريخ</th><th style="width:80px">الحالة</th>
           </tr></thead>
           <tbody>${transports.map((t: any, i: number) => `
             <tr>
               <td style="text-align:center">${i + 1}</td>
               <td>${t.transporters?.name || "—"}</td>
               <td>${t.destinations?.name || "—"}</td>
               <td style="text-align:center">${fmt(t.transport_date)}</td>
               <td style="text-align:center">${t.status || "—"}</td>
             </tr>`).join("")}</tbody>
         </table>`
      : "";

    return `<div class="inv-card">
      <div class="inv-head">
        <div><b>فاتورة #${inv.invoice_number}</b></div>
        <div>${inv.customers?.name || "كاش"}</div>
        <div>${fmt(inv.date)}</div>
      </div>
      <div class="inv-dest">
        <span class="lbl">الجهة المُرحَّل إليها:</span>
        <span><b>الناقل:</b> ${firstT?.transporters?.name || "—"}</span>
        <span><b>الوجهة:</b> ${firstT?.destinations?.name || "—"}</span>
        ${firstT?.driver_name ? `<span><b>السائق:</b> ${firstT.driver_name}</span>` : ""}
        ${firstT?.vehicle_number ? `<span><b>المركبة:</b> ${firstT.vehicle_number}</span>` : ""}
      </div>
      <div class="section-title">التغليف</div>
      <table class="card-table">
        <thead><tr>
          <th style="width:28px">#</th><th>نوع التغليف</th>
          <th style="width:70px">عدد الطرود</th><th style="width:80px">قطع/الطرد</th>
          <th style="width:70px">الإجمالي</th><th>ملاحظات</th>
        </tr></thead>
        <tbody>${packRows}</tbody>
      </table>
      ${transRows}
    </div>`;
  };

  const totalPages = pages.length;
  const pagesHTML = pages.map((invs, idx) => `
    <div class="a4-page">
      <div class="a4-header">
        <div class="a4-header-right">
          ${company?.logo_url ? `<img src="${company.logo_url}" class="logo" />` : ""}
          <div>
            <div class="company">${company?.name || "أولاد جابر — البتول ستور"}</div>
            ${company?.phone ? `<div class="company-sub">${company.phone}</div>` : ""}
          </div>
        </div>
        <div class="a4-header-left">
          <div class="title">تقرير ترحيل الفواتير</div>
          <div class="date">${dateStr}</div>
        </div>
      </div>
      <div class="a4-body">${invs.map(renderCard).join("")}</div>
      <div class="a4-footer">${company?.name || "البتول ستور"} — صفحة ${idx + 1} / ${totalPages}</div>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>تقرير ترحيل الفواتير - ${dateStr}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; color:#1a1a1a; font-weight:600; font-size:12px; line-height:1.45; }
  .a4-page { width: 100%; padding: 0; page-break-after: always; }
  .a4-page:last-child { page-break-after: auto; }
  .a4-header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:8px; border-bottom:2px solid #1f2937; margin-bottom:10px; }
  .a4-header-right { display:flex; gap:8px; align-items:center; }
  .logo { width:48px; height:48px; object-fit:contain; }
  .company { font-size:14px; font-weight:800; }
  .company-sub { font-size:10px; color:#666; }
  .a4-header-left { text-align:left; }
  .title { font-size:13px; font-weight:800; color:#1f2937; }
  .date { font-size:10px; color:#666; }
  .a4-body { display:flex; flex-direction:column; gap:10px; }
  .a4-footer { margin-top:10px; padding-top:6px; border-top:1px solid #ddd; font-size:9px; color:#888; text-align:center; }
  .inv-card { border:1px solid #d6d6d6; border-radius:6px; overflow:hidden; }
  .inv-head { display:flex; justify-content:space-between; padding:5px 8px; background:#eef2ff; border-bottom:1px solid #d6d6d6; font-size:11px; }
  .inv-dest { display:flex; flex-wrap:wrap; gap:8px 14px; padding:5px 8px; background:#fafafa; border-bottom:1px solid #eee; font-size:10px; }
  .inv-dest .lbl { color:#666; }
  .section-title { padding:4px 8px; background:#fbfbfb; font-size:10.5px; font-weight:800; color:#374151; border-bottom:1px solid #eee; }
  .card-table { width:100%; border-collapse:collapse; font-size:10px; }
  .card-table th { background:#f3f4f6; padding:4px 6px; text-align:right; border-bottom:1px solid #e0e0e0; font-weight:800; font-size:10px; }
  .card-table td { padding:4px 6px; border-bottom:1px solid #f0f0f0; }
</style>
</head>
<body>
${pagesHTML}
</body>
</html>`;
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
        flex:1; overflow:auto; padding: 12px;
        background: hsl(var(--muted) / 0.4);
        display:flex; justify-content:center; align-items:flex-start;
      }
      .dpp-scale { transform-origin: top center; }
      .dpp-empty {
        flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap: 8px; padding: 40px 14px; text-align:center;
        color: hsl(var(--muted-foreground));
      }
      .dpp-empty-ic { opacity: 0.25; }
      .dpp-empty-title { font-weight:800; font-size:13px; color: hsl(var(--foreground)); }
      .dpp-empty-sub { font-size:11px; }

      .dpp-measure { position:absolute; left:-99999px; top:0; visibility:hidden; pointer-events:none; }

      /* A4 page (visible preview) */
      .a4-page {
        width: ${A4_WIDTH}px; min-height: ${A4_HEIGHT}px;
        background: hsl(0 0% 100%);
        color: #1a1a1a;
        padding: ${PAGE_PADDING}px;
        box-shadow: 0 0 8px rgba(0,0,0,0.15);
        font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
        font-size: 12px; line-height: 1.45; font-weight:600;
        display:flex; flex-direction:column;
      }
      .a4-header {
        display:flex; justify-content:space-between; align-items:flex-start;
        padding-bottom: 8px; border-bottom: 2px solid #1f2937; margin-bottom: 10px;
      }
      .a4-header-right { display:flex; gap:8px; align-items:center; }
      .a4-logo { width: 48px; height:48px; object-fit:contain; }
      .a4-company-name { font-size:14px; font-weight:800; }
      .a4-company-sub { font-size:10px; color:#666; }
      .a4-header-left { text-align:left; }
      .a4-title { font-size:13px; font-weight:800; color:#1f2937; }
      .a4-date { font-size:10px; color:#666; }
      .a4-body { flex:1; display:flex; flex-direction:column; gap:10px; }
      .a4-footer { margin-top: 10px; padding-top: 6px; border-top:1px solid #ddd; font-size:9px; color:#888; text-align:center; }

      .inv-card { border:1px solid #d6d6d6; border-radius:6px; overflow:hidden; }
      .inv-card-head {
        display:flex; justify-content:space-between; gap:8px;
        padding: 5px 8px; background: #eef2ff;
        border-bottom: 1px solid #d6d6d6; font-size:11px;
      }
      .inv-card-num { font-weight:800; color:#1f2937; }
      .inv-card-cust { font-weight:700; }
      .inv-card-date { color:#555; }
      .inv-card-dest {
        display:flex; flex-wrap:wrap; gap: 8px 14px;
        padding: 5px 8px; background:#fafafa;
        border-bottom: 1px solid #eee; font-size: 10px;
      }
      .inv-card-dest .lbl { color:#666; }
      .inv-card-section-title {
        padding: 4px 8px; background:#fbfbfb;
        font-size: 10.5px; font-weight:800; color:#374151;
        border-bottom: 1px solid #eee;
      }
      .inv-card-empty { padding: 8px; text-align:center; color:#888; font-size:10px; }
      .inv-card-table { width:100%; border-collapse:collapse; font-size:10px; }
      .inv-card-table th {
        background:#f3f4f6; padding: 4px 6px; text-align:right;
        border-bottom: 1px solid #e0e0e0; font-weight:800;
      }
      .inv-card-table td { padding: 4px 6px; border-bottom: 1px solid #f0f0f0; }
      .inv-card-table .ta-c { text-align:center; }
      .inv-card-table .ta-l { text-align:left; }
      .inv-card-table .muted { color:#888; }
      .inv-card-total-row td { background:#f4f4f4; font-weight:800; }
      .w-8 { width: 28px; }
      .w-20 { width: 60px; }
      .w-24 { width: 80px; }
    `}</style>
  );
}
