/**
 * dispatchReportPrint — قالب موحّد لتقرير "كشف الترحيلات".
 *
 * يُستخدم في:
 *  - معاينة الطباعة على يسار صفحة إدارة الترحيلات (DispatchPrintPreview).
 *  - زر "طباعة وتحويل" داخل ReadyToShipPanel (عبر DispatchPage).
 *
 * هوية بصرية مطابقة لطباعة الفاتورة/عرض السعر (شعار البتول مكرّر، شريط
 * accent، خط Cairo، A4) + بطاقة لكل فاتورة تحتوي: العميل وهاتفه،
 * الترحيلات بأسماء الناقلين والوجهات، وبيانات التغليف كما هي.
 */

import { supabase } from "@/integrations/supabase/client";

import { resolveLogoUrl } from "@/utils/albatoolLogo";

const ACCENT = "#16a34a";

export type DispatchDoc = {
  invoice: any;
  itemsCount: number;
  qtyTotal: number;
  transports: any[];
  packaging: any[];
  packagingItemsFlat: {
    type: string;
    product: string;
    packs_count: number | null;
    pieces_per_pack: number | null;
    quantity: number | null;
  }[];
};

export const esc = (s: any) => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const fmtDate = (d: any) => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("en-GB");
  } catch {
    return String(d);
  }
};

export async function loadDispatchDoc(id: string): Promise<DispatchDoc | null> {
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, date, total, status, notes, customers(name, phone, address)"
    )
    .eq("id", id)
    .maybeSingle();
  if (invErr) {
    console.error(`[loadDispatchDoc] invoice ${id} failed:`, invErr);
    return null;
  }
  if (!invoice) return null;

  const [
    { data: items, error: itemsErr },
    { data: transports, error: trErr },
    { data: packaging, error: pkErr },
    { data: packagingItems, error: piErr },
    { data: transportItems, error: tiErr },
  ] = await Promise.all([
    supabase.from("invoice_items").select("quantity").eq("invoice_id", id),
    supabase
      .from("invoice_transports")
      .select(
        "id, vehicle_number, driver_name, transport_date, cost, notes, transporters(name, phone, address), destinations(name)"
      )
      .eq("invoice_id", id),
    supabase
      .from("invoice_packaging")
      .select(
        "id, packaging_type_id, quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_types(name)"
      )
      .eq("invoice_id", id),
    supabase
      .from("invoices_packaging_items")
      .select(
        "product_name, packs_count, pieces_per_pack, quantity, price, total, invoice_packaging_id, packaging_type_id"
      )
      .eq("invoice_id", id),
    (supabase as any)
      .from("invoices_transports_items")
      .select(
        "product_name, packs_count, pieces_per_pack, quantity, price, total, invoice_transport_id"
      )
      .eq("invoice_id", id),
  ]);

  // أي sub-query فاشل يُسجَّل بوضوح حتى لا تطبع وثيقة ناقصة بصمت.
  // لا نُلغي العملية كاملة — نمضي ببيانات جزئية لأن المستخدم بحاجة لما توفّر.
  if (itemsErr) console.error(`[loadDispatchDoc] items ${id}:`, itemsErr);
  if (trErr) console.error(`[loadDispatchDoc] transports ${id}:`, trErr);
  if (pkErr) console.error(`[loadDispatchDoc] packaging ${id}:`, pkErr);
  if (piErr) console.error(`[loadDispatchDoc] packagingItems ${id}:`, piErr);
  if (tiErr) console.error(`[loadDispatchDoc] transportItems ${id}:`, tiErr);

  const itemsCount = items?.length || 0;
  const qtyTotal = (items || []).reduce(
    (s: number, it: any) => s + Number(it.quantity || 0),
    0
  );

  const typeNameByHeaderId: Record<string, string> = {};
  (packaging || []).forEach((p: any) => {
    typeNameByHeaderId[p.id] = p.packaging_types?.name || "";
  });

  const extraTypeIds = Array.from(
    new Set(
      (packagingItems || [])
        .map((r: any) => r.packaging_type_id)
        .filter(Boolean)
    )
  );
  const typeNameById: Record<string, string> = {};
  if (extraTypeIds.length) {
    const { data: types } = await supabase
      .from("packaging_types")
      .select("id, name")
      .in("id", extraTypeIds as string[]);
    (types || []).forEach((t: any) => {
      typeNameById[t.id] = t.name;
    });
  }

  const packagingItemsFlat = (packagingItems || []).map((r: any) => ({
    type:
      typeNameById[r.packaging_type_id] ||
      typeNameByHeaderId[r.invoice_packaging_id] ||
      "",
    product: r.product_name,
    packs_count: r.packs_count,
    pieces_per_pack: r.pieces_per_pack,
    quantity: r.quantity,
  }));

  const transportsWithItems = (transports || []).map((t: any) => ({
    ...t,
    items: (transportItems || []).filter(
      (it: any) => it.invoice_transport_id === t.id
    ),
  }));

  return {
    invoice,
    itemsCount,
    qtyTotal,
    transports: transportsWithItems,
    packaging: packaging || [],
    packagingItemsFlat,
  };
}

/**
 * إجمالي "عدد القطع" = Σ packs_count من سجلات التغليف
 * (وليس عدد القطع داخل الربطة الواحدة).
 */
function totalPacksFor(doc: DispatchDoc): number {
  const flat = doc.packagingItemsFlat || [];
  if (flat.length) {
    return flat.reduce((s, r) => s + Number(r.packs_count ?? 1), 0);
  }
  return (doc.packaging || []).reduce(
    (s: number, r: any) => s + Number(r.packs_count ?? 1),
    0
  );
}

function renderTransports(rows: any[]): string {
  if (!rows.length)
    return `<div class="d-empty-line">لا يوجد ترحيل مضاف لهذه الفاتورة</div>`;
  return rows
    .map((r) => {
      const transporter = r.transporters?.name || "";
      const transporterPhone = r.transporters?.phone || "";
      const transporterAddress = r.transporters?.address || "";
      const destination = r.destinations?.name || "";
      const vehicle = r.vehicle_number || "";
      const driver = r.driver_name || "";
      const date = fmtDate(r.transport_date);
      const cost = Number(r.cost || 0);
      const notes = r.notes || "";
      const isPreview = r.__preview === true;
      const parts: string[] = [];
      if (transporter) {
        let t = `الناقل: <b>${esc(transporter)}</b>`;
        if (transporterPhone) t += ` • ☎ ${esc(transporterPhone)}`;
        parts.push(t);
      }
      if (transporterAddress) parts.push(`📍 عنوان الترحيلات: <b>${esc(transporterAddress)}</b>`);
      if (destination) parts.push(`الوجهة: <b>${esc(destination)}</b>`);
      if (vehicle) parts.push(`مركبة: ${esc(vehicle)}`);
      if (driver) parts.push(`سائق: ${esc(driver)}`);
      if (date) parts.push(`📅 ${date}`);
      if (cost > 0) parts.push(`التكلفة: <b>${cost.toLocaleString()}</b>`);
      const main = parts.length
        ? `<div class="d-line">${parts.join(" • ")}</div>`
        : "";
      const note = notes
        ? `<div class="d-line d-muted">ملاحظة: ${esc(notes)}</div>`
        : "";
      const previewTag = isPreview
        ? `<span class="d-preview-tag">معاينة — لم يُثبَّت بعد</span>`
        : "";
      return `<div class="d-tn-row${isPreview ? " d-tn-preview" : ""}">${previewTag}${main}${note}</div>`;
    })
    .join("");
}

function renderPackagingLines(doc: DispatchDoc): string {
  type Line = { packs: number; type: string; product: string; pieces: number };
  const flat = doc.packagingItemsFlat || [];

  const lines: Line[] = flat.length
    ? flat.map((it: any) => ({
        packs: Number(it.packs_count ?? 1),
        type: it.type || "",
        product: it.product || "",
        pieces: Number(it.pieces_per_pack ?? it.quantity ?? 1),
      }))
    : (doc.packaging || []).map((r: any) => ({
        packs: Number(r.packs_count ?? 1),
        type: r.packaging_types?.name || "",
        product: "",
        pieces: Number(r.pieces_per_pack ?? r.quantity ?? 1),
      }));

  if (!lines.length)
    return `<div class="d-empty-line">لا توجد بيانات تغليف</div>`;

  return `<div class="d-pk-lines">${lines
    .map((l, i) => {
      const typePart = l.type ? `<b>${esc(l.type)}</b>` : "";
      const productPart = l.product ? ` ${esc(l.product)}` : "";
      const piecesPart = l.pieces > 1 ? ` — × ${l.pieces}` : "";
      return `<div class="d-pk-line">
        <span class="d-pk-i">${i + 1})</span>
        <span class="d-pk-p">${l.packs}</span>
        <span class="d-pk-sep">—</span>
        <span class="d-pk-t">${typePart}${productPart}${piecesPart}</span>
      </div>`;
    })
    .join("")}</div>`;
}

function renderCard(doc: DispatchDoc, idx: number): string {
  const inv = doc.invoice;
  const cust = inv.customers;
  const totalPacks = totalPacksFor(doc);
  return `
    <section class="d-card">
      <header class="d-card-head">
        <div class="d-card-num"><span class="d-idx">${idx + 1}</span> فاتورة #${esc(
    inv.invoice_number || "—"
  )}</div>
        <div class="d-card-date">📅 ${fmtDate(inv.date)}</div>
      </header>

      <div class="d-card-body">
        <div class="d-cust-row">
          <div><span class="d-label-inline">العميل:</span> <b>${esc(
            cust?.name || "عميل نقدي"
          )}</b></div>
        </div>
        ${
          cust?.address
            ? `<div class="d-line d-muted">📍 ${esc(cust.address)}</div>`
            : ""
        }

        <div class="d-section">
          <div class="d-label">🚚 الترحيلات المضافة</div>
          ${renderTransports(doc.transports)}
        </div>

        <div class="d-section d-section-pk">
          <div class="d-label d-label-pk">📦 بيانات التغليف</div>
          ${renderPackagingLines(doc)}
          <div class="d-pk-total">
            <span>إجمالي عدد القطع:</span>
            <b>${totalPacks}</b>
          </div>
        </div>

        ${
          inv.notes
            ? `<div class="d-section d-notes"><span class="d-label-inline">ملاحظات:</span> ${esc(
                inv.notes
              )}</div>`
            : ""
        }
      </div>
    </section>
  `;
}

function headerHTML(company: any): string {
  const logo = resolveLogoUrl(company?.logo_url);
  const name =
    company?.company_name || "اولاد جابر لاسبيرات المواتر والتكاتك";
  const address = company?.address || "";
  const phone = company?.phone || "";
  const tax = company?.tax_number || "";
  return `
  <div class="d-header">
    <div class="d-header-row">
      <div class="d-header-logo"><img src="${esc(logo)}" alt="logo" /></div>
      <div class="d-header-center">
        <div class="d-header-title">${esc(name)}</div>
        ${address ? `<div class="d-header-meta">${esc(address)}</div>` : ""}
        ${phone ? `<div class="d-header-phones">${esc(phone)}</div>` : ""}
        ${tax ? `<div class="d-header-meta">الرقم الضريبي: ${esc(tax)}</div>` : ""}
      </div>
      <div class="d-header-logo"><img src="${esc(logo)}" alt="logo" /></div>
    </div>
  </div>`;
}

function signaturesHTML(): string {
  return `
  <div class="d-signatures">
    <div class="d-sig-box"><div class="d-sig-line">توقيع المستلم</div></div>
    <div class="d-sig-box"><div class="d-sig-line">توقيع السائق / الناقل</div></div>
    <div class="d-sig-box"><div class="d-sig-line">ختم الشركة</div></div>
  </div>`;
}

export type LiveOverlayEntry = {
  transporterName?: string;
  transporterPhone?: string;
  transporterAddress?: string;
  destinationName?: string;
};

export function buildDispatchSheetHTML(
  docs: DispatchDoc[],
  company: any,
  liveOverlay?: Record<string, LiveOverlayEntry>
): string {
  const today = new Date().toLocaleDateString("en-GB");

  // Merge live (unsaved) choices for invoices that don't yet have any saved
  // transport record. Each becomes a synthetic preview row marked `__preview`.
  const mergedDocs: DispatchDoc[] = docs.map((d) => {
    const overlay = liveOverlay?.[d.invoice?.id];
    if (!overlay) return d;
    if ((d.transports || []).length > 0) return d;
    if (!overlay.transporterName && !overlay.destinationName) return d;
    const previewRow = {
      __preview: true,
      transporters: overlay.transporterName
        ? { name: overlay.transporterName, phone: overlay.transporterPhone, address: overlay.transporterAddress }
        : null,
      destinations: overlay.destinationName ? { name: overlay.destinationName } : null,
      transport_date: null,
      cost: 0,
      notes: null,
    };
    return { ...d, transports: [previewRow] };
  });

  const cardsHtml = mergedDocs.map((d, i) => renderCard(d, i)).join("");
  const totalPacksAll = mergedDocs.reduce((s, d) => s + totalPacksFor(d), 0);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>كشف الترحيلات — ${today}</title>
  <style>
    @page { size: A4; margin: 7mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #fff; }
    body {
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      color: #111; font-size: 10px; line-height: 1.35; padding: 4px;
      font-weight: 600;
    }

    /* Header — same identity as invoice/quote print */
    .d-header {
      padding-bottom: 5px;
      border-bottom: 2px solid ${ACCENT};
      margin-bottom: 5px;
    }
    .d-header-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .d-header-logo img {
      height: 46px; width: auto; object-fit: contain;
    }
    .d-header-center { text-align: center; flex: 1; }
    .d-header-title {
      font-size: 15px; font-weight: 900; color: #c0392b; margin-bottom: 2px;
    }
    .d-header-meta { font-size: 10px; color: #333; line-height: 1.35; }
    .d-header-phones { font-size: 10.5px; font-weight: 800; color: #1a1a1a; margin-top: 1px; }

    .d-doc-title {
      text-align: center; margin: 4px 0 6px;
    }
    .d-doc-title h1 {
      display: inline-block;
      font-size: 14px; font-weight: 900; color: #2c3e50;
      padding: 2px 10px;
      border: 1.5px solid ${ACCENT}; border-radius: 5px;
      background: #f0fdf4;
    }

    .d-summary {
      display: flex; justify-content: space-between; align-items: center; gap: 8px;
      font-size: 10px; margin-bottom: 6px;
      padding: 4px 8px; background: #f8fafc;
      border: 1px solid #cbd5e1; border-radius: 5px;
    }
    .d-summary b { font-weight: 900; color: ${ACCENT}; }

    /* Card per invoice */
    .d-card {
      border: 1px solid #111; border-radius: 5px;
      margin-bottom: 5px; overflow: hidden;
      page-break-inside: avoid; break-inside: avoid;
    }
    .d-card-head {
      display: flex; justify-content: space-between; align-items: center;
      padding: 3px 7px; background: ${ACCENT}; color: #fff;
      font-size: 11px; font-weight: 900;
    }
    .d-idx {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 16px; height: 16px; padding: 0 5px;
      border-radius: 3px; background: #fff; color: ${ACCENT};
      font-size: 9.5px; margin-left: 5px; font-weight: 900;
    }
    .d-card-date { font-weight: 800; font-size: 10px; }

    .d-card-body { padding: 4px 6px; font-size: 10px; }
    .d-cust-row {
      display: flex; gap: 12px; flex-wrap: wrap; align-items: center;
      padding: 2px 0 3px;
      border-bottom: 1px dashed #d1d5db;
    }
    .d-label-inline { font-size: 9.5px; font-weight: 800; color: #475569; margin-left: 2px; }
    .d-section { margin-top: 3px; padding-top: 3px; border-top: 1px dashed #d1d5db; }
    .d-section-pk { background: #fafafa; padding: 3px 5px; border-radius: 3px; border-top: 1px solid #cbd5e1; }
    .d-label { font-size: 10px; font-weight: 900; color: #0f172a; margin-bottom: 2px; }
    .d-label-pk { color: #0f172a; }
    .d-line { font-size: 10px; padding: 1px 0; }
    .d-muted { color: #64748b; }
    .d-empty-line { font-size: 9.5px; color: #94a3b8; padding: 2px 0; font-style: italic; }

    .d-tn-row { padding: 1px 0; border-bottom: 1px dotted #e5e7eb; }
    .d-tn-row:last-child { border-bottom: none; }
    .d-tn-preview { background: #fffbeb; padding: 2px 4px; border-radius: 3px; border: 1px dashed #f59e0b; }
    .d-preview-tag { display: inline-block; font-size: 8.5px; font-weight: 800; color: #b45309; background: #fef3c7; padding: 0 4px; border-radius: 2px; margin-bottom: 1px; }

    .d-pk-lines { display: block; margin-top: 1px; }
    .d-pk-line {
      display: flex; align-items: baseline; gap: 4px;
      font-size: 10px; padding: 1px 0;
      border-bottom: 1px dotted #e5e7eb;
    }
    .d-pk-line:last-child { border-bottom: none; }
    .d-pk-i { color: #64748b; font-weight: 800; min-width: 16px; }
    .d-pk-p { font-weight: 900; color: ${ACCENT}; min-width: 18px; text-align: center; }
    .d-pk-sep { color: #94a3b8; }
    .d-pk-t { flex: 1; }
    .d-pk-total {
      display: flex; justify-content: flex-end; gap: 6px; align-items: center;
      margin-top: 3px; padding-top: 2px; border-top: 1px solid #1a1a1a;
      font-size: 10.5px; font-weight: 800;
    }
    .d-pk-total b { color: ${ACCENT}; font-size: 12px; font-weight: 900; }

    .d-notes {
      font-size: 9.5px; background: #fefce8; padding: 2px 5px;
      border-radius: 3px; border: 1px solid #fde68a;
    }

    .d-signatures {
      display: flex; justify-content: space-between;
      padding: 12px 30px 2px; margin-top: 8px;
      page-break-inside: avoid;
    }
    .d-sig-box { text-align: center; width: 140px; }
    .d-sig-line {
      border-top: 1px solid #999; margin-top: 26px;
      padding-top: 3px; font-size: 10px; color: #555; font-weight: 700;
    }

    .d-footer {
      margin-top: 5px; padding-top: 3px; border-top: 1px solid #ddd;
      font-size: 8.5px; color: #888; text-align: center;
    }


    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
    }
  </style>
</head>
<body>
  ${headerHTML(company)}

  <div class="d-doc-title"><h1>كشف الترحيلات</h1></div>

  <div class="d-summary">
    <div>📅 التاريخ: <b>${today}</b></div>
    <div>عدد الفواتير: <b>${docs.length}</b></div>
    <div>إجمالي عدد القطع: <b>${totalPacksAll}</b></div>
  </div>

  ${cardsHtml}

  ${signaturesHTML()}

  <div class="d-footer">تم إنشاء هذا الكشف من نظام أولاد جابر — البتول ستور — ${today}</div>
</body>
</html>`;
}

/**
 * Helper: حمّل الـ docs لمجموعة معرّفات فواتير ثم ابنِ HTML الكشف.
 */
export async function buildDispatchSheetForInvoiceIds(
  ids: string[],
  company: any,
  liveOverlay?: Record<string, LiveOverlayEntry>
): Promise<string> {
  const docs = (
    await Promise.all(ids.map((id) => loadDispatchDoc(id).catch(() => null)))
  ).filter(Boolean) as DispatchDoc[];
  return buildDispatchSheetHTML(docs, company, liveOverlay);
}

