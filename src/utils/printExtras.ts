import { supabase } from "@/integrations/supabase/client";

/**
 * Format a number for display, falling back to a dash for empty/zero values
 * when the field is optional.
 */
const fmt = (n: number | null | undefined) => {
  const v = Number(n || 0);
  return v.toLocaleString();
};

const escapeHtml = (s: string | null | undefined) => {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

interface ExtraStrings {
  transportInfo?: string;
  packagingInfo?: string;
}

// In-memory cache (per-tab). Cleared on page reload.
const cache = new Map<string, { value: ExtraStrings; expires: number }>();
const TTL_MS = 60_000;

export function clearPrintExtrasCache(kind?: "invoice" | "quote", id?: string) {
  if (!kind) {
    cache.clear();
    return;
  }
  if (!id) {
    for (const key of Array.from(cache.keys())) {
      if (key.startsWith(`${kind}:`)) cache.delete(key);
    }
    return;
  }
  cache.delete(`${kind}:${id}`);
}

function getCached(key: string): ExtraStrings | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCached(key: string, value: ExtraStrings) {
  cache.set(key, { value, expires: Date.now() + TTL_MS });
}

function formatTransports(rows: any[]): string | undefined {
  if (!rows || rows.length === 0) return undefined;
  // بيانات الترحيلات المعروضة في ورقة الطباعة تقتصر على: الاسم، الهاتف، العنوان.
  // (رقم/نوع المركبة والسائق والتكلفة والتاريخ لا تظهر — لأسباب سرية العمل.)
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const r of rows) {
    const t = r.transporters || {};
    const name = t.name || r.transporter_name || "";
    if (!name) continue;
    const phone = t.phone || "";
    const address = t.address || "";
    const key = `${name}|${phone}|${address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parts: string[] = [`الاسم: ${escapeHtml(name)}`];
    if (phone)   parts.push(`الهاتف: ${escapeHtml(phone)}`);
    if (address) parts.push(`العنوان: ${escapeHtml(address)}`);
    blocks.push(parts.join(" | "));
  }
  if (blocks.length === 0) return undefined;
  return blocks.join("<br>");
}

function formatPackaging(rows: any[]): string | undefined {
  if (!rows || rows.length === 0) return undefined;
  const lines = rows.map((r) => {
    const type = r.packaging_types?.name || "";
    const qty = Number(r.quantity || 0);
    const packs = Number(r.packs_count || 0);
    const piecesPerPack = Number(r.pieces_per_pack || 0);
    const weight = Number(r.weight || 0);
    const dims = r.dimensions || "";
    const cost = Number(r.cost || 0);
    const parts: string[] = [];
    if (type) parts.push(`النوع: ${escapeHtml(type)}`);
    if (qty) parts.push(`الكمية: ${qty}`);
    if (packs) parts.push(`عدد الطرود: ${packs}`);
    if (piecesPerPack) parts.push(`قطع/طرد: ${piecesPerPack}`);
    if (weight) parts.push(`الوزن: ${weight}`);
    if (dims) parts.push(`الأبعاد: ${escapeHtml(dims)}`);
    let line = parts.join(" | ");
    if (cost > 0) line += ` — التكلفة: ${fmt(cost)}`;
    if (r.notes) line += `<br><span style="color:#666;font-size:11px;">${escapeHtml(r.notes)}</span>`;
    return line;
  });
  const totalCost = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
  let html = lines.join("<br>");
  if (totalCost > 0) {
    html += `<br><strong>الإجمالي: ${fmt(totalCost)}</strong>`;
  }
  return html;
}

export async function loadInvoiceExtras(invoiceId: string | undefined | null): Promise<ExtraStrings> {
  if (!invoiceId) return {};
  const key = `invoice:${invoiceId}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const [{ data: transports }, { data: packaging }] = await Promise.all([
      supabase
        .from("invoice_transports")
        .select("transporters(name, phone, address)")
        .eq("invoice_id", invoiceId),
      supabase
        .from("invoice_packaging")
        .select("quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_types(name)")
        .eq("invoice_id", invoiceId),
    ]);
    const value: ExtraStrings = {
      transportInfo: formatTransports(transports || []),
      packagingInfo: formatPackaging(packaging || []),
    };
    setCached(key, value);
    return value;
  } catch (e) {
    console.error("[printExtras] loadInvoiceExtras failed", e);
    return {};
  }
}

export async function loadQuoteExtras(quoteId: string | undefined | null): Promise<ExtraStrings> {
  if (!quoteId) return {};
  const key = `quote:${quoteId}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const [{ data: transports }, { data: packaging }] = await Promise.all([
      supabase
        .from("quote_transports")
        .select("transporters(name, phone, address)")
        .eq("quote_id", quoteId),
      supabase
        .from("quotes_packaging")
        .select("quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_types(name)")
        .eq("quote_id", quoteId),
    ]);
    const value: ExtraStrings = {
      transportInfo: formatTransports(transports || []),
      packagingInfo: formatPackaging(packaging || []),
    };
    setCached(key, value);
    return value;
  } catch (e) {
    console.error("[printExtras] loadQuoteExtras failed", e);
    return {};
  }
}
