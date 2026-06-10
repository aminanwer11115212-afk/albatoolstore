/**
 * DispatchPrintPreview — معاينة طباعة A4 لإدارة الترحيلات.
 *
 * شكل المعاينة عبارة عن "كشف ترحيلات" مدمج:
 *   - ترويسة شركة مصغّرة + عنوان "كشف الترحيلات" (مرّة واحدة أعلى الصفحة).
 *   - بطاقة مدمجة لكل فاتورة تعرض:
 *       رقم الفاتورة، التاريخ، الزبون، الوجهة، الناقل، بيانات التغليف،
 *       عدد الأصناف والإجمالي.
 *   - البطاقات تتدفق على الصفحة بحيث تستوعب الصفحة A4 الواحدة أكثر من فاتورة،
 *     حسب حجم بيانات التغليف لكل فاتورة (page-break-inside: avoid).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, Eye, Loader2 } from "lucide-react";

type Props = {
  selectedIds: Set<string>;
  company: any;
};

const EMPTY_IDS: string[] = [];

const escapeHtml = (s: any) => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const fmtNum = (n: any) => {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

const fmtDate = (d: any) => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("en-GB");
  } catch { return String(d); }
};

type DispatchDoc = {
  invoice: any;
  itemsCount: number;
  qtyTotal: number;
  transports: any[];
  packaging: any[];
};

async function loadDispatchDoc(id: string): Promise<DispatchDoc | null> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, invoice_number, date, total, status, notes, customers(name, phone, address)")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) return null;
  const [{ data: items }, { data: transports }, { data: packaging }, { data: packagingItems }, { data: transportItems }] = await Promise.all([
    supabase.from("invoice_items").select("quantity").eq("invoice_id", id),
    supabase.from("invoice_transports")
      .select("id, vehicle_number, driver_name, transport_date, cost, notes, transporters(name), destinations(name)")
      .eq("invoice_id", id),
    supabase.from("invoice_packaging")
      .select("id, quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_types(name)")
      .eq("invoice_id", id),
    supabase.from("invoices_packaging_items")
      .select("product_name, packs_count, pieces_per_pack, quantity, price, total, invoice_packaging_id")
      .eq("invoice_id", id),
    (supabase as any).from("invoices_transports_items")
      .select("product_name, packs_count, pieces_per_pack, quantity, price, total, invoice_transport_id")
      .eq("invoice_id", id),
  ]);
  const itemsCount = items?.length || 0;
  const qtyTotal = (items || []).reduce((s, it: any) => s + Number(it.quantity || 0), 0);

  const packagingWithItems = (packaging || []).map((p: any) => ({
    ...p,
    items: (packagingItems || []).filter((it: any) => it.invoice_packaging_id === p.id),
  }));
  const transportsWithItems = (transports || []).map((t: any) => ({
    ...t,
    items: (transportItems || []).filter((it: any) => it.invoice_transport_id === t.id),
  }));

  return {
    invoice,
    itemsCount,
    qtyTotal,
    transports: transportsWithItems,
    packaging: packagingWithItems,
  };
}

function renderTransportsHtml(rows: any[]): string {
  if (!rows.length) return `<span class="d-muted">—</span>`;
  return rows.map((r) => {
    const transporter = r.transporters?.name || "";
    const destination = r.destinations?.name || "";
    const vehicle = r.vehicle_number || "";
    const driver = r.driver_name || "";
    const date = fmtDate(r.transport_date);
    const cost = Number(r.cost || 0);
    const bits: string[] = [];
    if (transporter) bits.push(`<b>${escapeHtml(transporter)}</b>`);
    if (destination) bits.push(`→ ${escapeHtml(destination)}`);
    if (vehicle) bits.push(`مركبة: ${escapeHtml(vehicle)}`);
    if (driver) bits.push(`سائق: ${escapeHtml(driver)}`);
    if (date) bits.push(date);
    if (cost > 0) bits.push(`التكلفة: ${fmtNum(cost)}`);
    let html = bits.length ? `<div class="d-line">${bits.join(" • ")}</div>` : "";
    if (Array.isArray(r.items) && r.items.length) {
      html += `<div class="d-items">` + r.items.map((it: any) => {
        const name = it.product_name || "—";
        const ps = Number(it.packs_count || 0);
        const pp = Number(it.pieces_per_pack || 0);
        const q = Number(it.quantity || 0);
        return `<div class="d-item">• ${escapeHtml(name)} — ${ps}×${pp} = <b>${fmtNum(q)}</b></div>`;
      }).join("") + `</div>`;
    }
    return html;
  }).join("");
}

function renderPackagingHtml(rows: any[]): string {
  if (!rows.length) return `<span class="d-muted">—</span>`;
  const lines = rows.map((r) => {
    const type = r.packaging_types?.name || "";
    const qty = Number(r.quantity || 0);
    const packs = Number(r.packs_count || 0);
    const piecesPerPack = Number(r.pieces_per_pack || 0);
    const weight = Number(r.weight || 0);
    const dims = r.dimensions || "";
    const bits: string[] = [];
    if (type) bits.push(`<b>${escapeHtml(type)}</b>`);
    if (qty && !r.items?.length) bits.push(`كمية: ${qty}`);
    if (packs && !r.items?.length) bits.push(`طرود: ${packs}`);
    if (piecesPerPack && !r.items?.length) bits.push(`قطع/طرد: ${piecesPerPack}`);
    if (weight) bits.push(`الوزن: ${weight}`);
    if (dims) bits.push(`أبعاد: ${escapeHtml(dims)}`);
    let html = bits.length ? `<div class="d-line">${bits.join(" • ")}</div>` : "";
    if (Array.isArray(r.items) && r.items.length) {
      html += `<div class="d-items">` + r.items.map((it: any) => {
        const name = it.product_name || "—";
        const ps = Number(it.packs_count || 0);
        const pp = Number(it.pieces_per_pack || 0);
        const q = Number(it.quantity || 0);
        return `<div class="d-item">• ${escapeHtml(name)} — ${ps}×${pp} = <b>${fmtNum(q)}</b></div>`;
      }).join("") + `</div>`;
    }
    return html;
  });
  const totals = {
    packs: rows.reduce((s, r) => {
      const itemsPacks = (r.items || []).reduce((ss: number, it: any) => ss + Number(it.packs_count || 0), 0);
      return s + (itemsPacks || Number(r.packs_count || 0));
    }, 0),
    pieces: rows.reduce((s, r) => s + (r.items || []).reduce((ss: number, it: any) => ss + Number(it.quantity || 0), 0), 0),
    weight: rows.reduce((s, r) => s + Number(r.weight || 0), 0),
  };
  const parts: string[] = [];
  if (totals.packs > 0) parts.push(`إجمالي الطرود: <b>${totals.packs}</b>`);
  if (totals.pieces > 0) parts.push(`إجمالي القطع: <b>${fmtNum(totals.pieces)}</b>`);
  if (totals.weight > 0) parts.push(`إجمالي الوزن: <b>${fmtNum(totals.weight)}</b>`);
  const summary = parts.length ? `<div class="d-line d-line-sum">${parts.join(" • ")}</div>` : "";
  return lines.join("") + summary;
}

function renderCard(doc: DispatchDoc, idx: number): string {
  const inv = doc.invoice;
  const cust = inv.customers;
  return `
    <section class="d-card">
      <header class="d-card-head">
        <div class="d-card-num"><span class="d-idx">${idx + 1}</span> فاتورة #${escapeHtml(inv.invoice_number || "—")}</div>
        <div class="d-card-date">${fmtDate(inv.date)}</div>
      </header>
      <div class="d-card-body">
        <div class="d-row">
          <div class="d-cell">
            <div class="d-label">الزبون</div>
            <div class="d-value"><b>${escapeHtml(cust?.name || "—")}</b>${cust?.phone ? ` • ${escapeHtml(cust.phone)}` : ""}</div>
            ${cust?.address ? `<div class="d-value d-muted">${escapeHtml(cust.address)}</div>` : ""}
          </div>
          <div class="d-cell d-cell-side">
            <div class="d-label">الأصناف</div>
            <div class="d-value"><b>${doc.itemsCount}</b> <span class="d-muted">(كمية: ${fmtNum(doc.qtyTotal)})</span></div>
            <div class="d-label">الإجمالي</div>
            <div class="d-value d-total">${fmtNum(inv.total)}</div>
          </div>
        </div>
        <div class="d-section">
          <div class="d-label">الناقل والوجهة</div>
          ${renderTransportsHtml(doc.transports)}
        </div>
        <div class="d-section">
          <div class="d-label">بيانات التغليف</div>
          ${renderPackagingHtml(doc.packaging)}
        </div>
        ${inv.notes ? `<div class="d-section d-notes"><div class="d-label">ملاحظات</div><div class="d-value">${escapeHtml(inv.notes)}</div></div>` : ""}
      </div>
    </section>
  `;
}

function buildFullHTML(docs: DispatchDoc[], company: any): string {
  const companyName = company?.company_name || "";
  const address = company?.address || "";
  const phone = company?.phone || "";
  const logo = company?.logo_url || "";
  const today = new Date().toLocaleDateString("en-GB");

  const cardsHtml = docs.map((d, i) => renderCard(d, i)).join("");

  const grandTotal = docs.reduce((s, d) => s + Number(d.invoice.total || 0), 0);
  const totalPacks = docs.reduce((s, d) =>
    s + d.packaging.reduce((ss, p: any) => ss + Number(p.packs_count || 0), 0), 0);
  const totalWeight = docs.reduce((s, d) =>
    s + d.packaging.reduce((ss, p: any) => ss + Number(p.weight || 0), 0), 0);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>كشف الترحيلات</title>
  <style>
    @page { size: A4; margin: 10mm 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', 'Tajawal', Arial, sans-serif;
      color: #111; background: #fff;
      font-size: 12px; line-height: 1.45;
    }
    .d-page-header {
      display: flex; align-items: center; gap: 10px;
      padding-bottom: 6px; margin-bottom: 8px;
      border-bottom: 2px solid #111;
    }
    .d-logo { height: 44px; width: auto; object-fit: contain; }
    .d-company { flex: 1; }
    .d-company-name { font-size: 16px; font-weight: 800; }
    .d-company-meta { font-size: 10.5px; color: #444; }
    .d-doc-title {
      text-align: center; font-size: 15px; font-weight: 800;
      padding: 4px 10px; border: 1.5px solid #111; border-radius: 6px;
      background: #f3f4f6;
    }
    .d-summary {
      display: flex; justify-content: space-between; align-items: center;
      gap: 10px; font-size: 11.5px; margin-bottom: 8px;
      padding: 4px 8px; background: #f8fafc;
      border: 1px solid #cbd5e1; border-radius: 4px;
    }
    .d-summary b { font-weight: 800; }

    .d-card {
      border: 1.2px solid #111; border-radius: 6px;
      margin-bottom: 6px; overflow: hidden;
      page-break-inside: avoid; break-inside: avoid;
    }
    .d-card-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4px 8px; background: #1f2937; color: #fff;
      font-size: 12px; font-weight: 800;
    }
    .d-idx {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px;
      border-radius: 4px; background: #fff; color: #1f2937;
      font-size: 11px; margin-left: 4px;
    }
    .d-card-date { font-weight: 700; font-size: 11.5px; }
    .d-card-body { padding: 5px 8px; }
    .d-row { display: flex; gap: 8px; align-items: stretch; margin-bottom: 4px; }
    .d-cell { flex: 1; min-width: 0; }
    .d-cell-side {
      flex: 0 0 38%; text-align: left; direction: ltr;
      border-right: 1px dashed #cbd5e1; padding-right: 8px;
    }
    .d-cell-side .d-label, .d-cell-side .d-value { direction: rtl; text-align: right; }
    .d-section {
      margin-top: 3px; padding-top: 3px;
      border-top: 1px dashed #d1d5db;
    }
    .d-label {
      font-size: 10px; font-weight: 800; color: #475569;
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .d-value { font-size: 12px; }
    .d-line { font-size: 11.5px; padding: 1px 0; }
    .d-line-sum { font-weight: 800; color: #0f172a; margin-top: 2px; }
    .d-muted { color: #64748b; }
    .d-total { font-weight: 800; font-size: 13px; color: #b91c1c; }
    .d-notes .d-value { background: #fefce8; padding: 2px 6px; border-radius: 3px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="d-page-header">
    ${logo ? `<img class="d-logo" src="${escapeHtml(logo)}" />` : ""}
    <div class="d-company">
      <div class="d-company-name">${escapeHtml(companyName)}</div>
      <div class="d-company-meta">${escapeHtml(address)}${phone ? ` • ${escapeHtml(phone)}` : ""}</div>
    </div>
    <div class="d-doc-title">كشف الترحيلات</div>
  </div>

  <div class="d-summary">
    <div>التاريخ: <b>${today}</b></div>
    <div>عدد الفواتير: <b>${docs.length}</b></div>
    <div>إجمالي الطرود: <b>${totalPacks}</b></div>
    <div>إجمالي الوزن: <b>${fmtNum(totalWeight)}</b></div>
    <div>إجمالي القيمة: <b>${fmtNum(grandTotal)}</b></div>
  </div>

  ${cardsHtml}
</body>
</html>`;
}

export default function DispatchPrintPreview({ selectedIds, company }: Props) {
  const ids = useMemo(() => {
    const arr = Array.from(selectedIds);
    return arr.length ? arr : EMPTY_IDS;
  }, [selectedIds]);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["dispatch-preview-sheet", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const results = await Promise.all(ids.map((id) => loadDispatchDoc(id).catch(() => null)));
      return results.filter(Boolean) as DispatchDoc[];
    },
  });

  const html = useMemo(() => {
    if (!docs || docs.length === 0) return "";
    return buildFullHTML(docs, company);
  }, [docs, company]);

  const handlePrint = () => {
    if (!html) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      win.print();
      win.onafterprint = () => win.close();
    };
  };

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
          <div className="dpp-empty-sub">اختر فاتورة أو أكثر من القائمة لعرض كشف الترحيلات</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dpp-shell" dir="rtl">
      <PreviewStyles />

      <div className="dpp-header">
        <h3><Eye size={15} /> كشف الترحيلات</h3>
        <span className="dpp-pageinfo">{ids.length} فاتورة</span>
      </div>

      <div className="dpp-actions">
        <button
          type="button"
          className="dpp-btn dpp-btn-primary"
          onClick={handlePrint}
          disabled={isLoading || !html}
        >
          <Printer size={13} />
          طباعة الكشف
        </button>
      </div>

      <div className="dpp-viewport">
        {isLoading || !html ? (
          <div className="dpp-empty">
            <Loader2 className="animate-spin" size={18} />
            <div className="dpp-empty-title">جارٍ تحميل المعاينة…</div>
          </div>
        ) : (
          <iframe
            title="معاينة كشف الترحيلات"
            srcDoc={html}
            className="dpp-iframe"
          />
        )}
      </div>
    </div>
  );
}

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
      .dpp-pageinfo { font-size:11px; font-weight:700; background: rgba(255,255,255,0.18); padding: 3px 8px; border-radius: 6px; }
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
      .dpp-viewport {
        flex:1; min-height: 360px;
        background: hsl(var(--muted) / 0.4);
        display:flex; justify-content:stretch; align-items:stretch;
      }
      .dpp-iframe {
        flex:1; width:100%; height:100%;
        border: 0; background: #fff;
      }
      .dpp-empty {
        flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap: 8px; padding: 40px 14px; text-align:center;
        color: hsl(var(--muted-foreground));
      }
      .dpp-empty-ic { opacity: 0.25; }
      .dpp-empty-title { font-weight:800; font-size:13px; color: hsl(var(--foreground)); }
      .dpp-empty-sub { font-size:11px; }
    `}</style>
  );
}
