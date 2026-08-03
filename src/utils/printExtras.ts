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

export function formatTransports(rows: any[]): string | undefined {
  if (!rows || rows.length === 0) return undefined;
  // بيانات الترحيلات المعروضة في ورقة الطباعة تقتصر على: الاسم، الهاتف، العنوان،
  // والوجهة. (رقم/نوع المركبة والسائق والتكلفة والتاريخ لا تظهر — لأسباب سرية
  // العمل.)
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const r of rows) {
    const t = r.transporters || {};
    const name = t.name || r.transporter_name || "";
    const destination = r.destinations?.name || "";
    // سطرُ ترحيلٍ بلا مرحّلٍ مسجَّل كان يُتخطّى فتُقرأ الورقة «لا توجد بيانات
    // ترحيل» رغم وجود الترحيل — والوجهة وحدها معلومةٌ تكفي العميل.
    if (!name && !destination) continue;
    const phone = t.phone || "";
    const address = t.address || "";
    const key = `${name}|${phone}|${address}|${destination}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parts: string[] = [];
    if (name)    parts.push(`الاسم: ${escapeHtml(name)}`);
    if (phone)   parts.push(`الهاتف: ${escapeHtml(phone)}`);
    if (address) parts.push(`العنوان: ${escapeHtml(address)}`);
    if (destination) parts.push(`الوجهة: ${escapeHtml(destination)}`);
    blocks.push(parts.join(" | "));
  }
  if (blocks.length === 0) return undefined;
  return blocks.join("<br>");
}

/**
 * تفاصيل التغليف كما أدخلها المستخدم.
 *
 * ## العطل الذي عالجَته
 * التغليف مُخزَّنٌ في جدولين: `invoice_packaging` **ترويسةٌ واحدة** تُنشئها
 * الشاشة تلقائياً بمجرّد فتح النافذة (`{ invoice_id, quantity: 1 }`)، و
 * `invoices_packaging_items` فيها **بنود المستخدم الحقيقية**: نوع التغليف
 * والصنف وعدد الطرود والقطع.
 *
 * وكانت الطباعة تقرأ الترويسة وحدها. فمن أدخل تغليفاً كاملاً يقرأ في ورقته
 * «لا توجد بيانات تغليف» — أو أسوأ: «الكمية: 1» وهي قيمة الترويسة الفارغة لا
 * تغليفه. فصارت البنود هي المصدر، والترويسة تُكمّل بحقول المستند وحدها
 * (الوزن والأبعاد والتكلفة) حين تُملأ.
 */
export function formatPackaging(headers: any[], items: any[] = []): string | undefined {
  const typeName = (r: any) => r.packaging_types?.name || "";

  // 1) بنود المستخدم — كلٌّ سطر: النوع والصنف وعدد الطرود والقطع والكمية.
  const itemLines = (items || []).map((r) => {
    const parts: string[] = [];
    const type = typeName(r);
    const packs = Number(r.packs_count || 0);
    const pieces = Number(r.pieces_per_pack || 0);
    const qty = Number(r.quantity || 0);
    if (type) parts.push(`النوع: ${escapeHtml(type)}`);
    if (r.product_name) parts.push(`الصنف: ${escapeHtml(r.product_name)}`);
    if (packs) parts.push(`عدد الطرود: ${packs}`);
    if (pieces) parts.push(`قطع/طرد: ${pieces}`);
    if (qty) parts.push(`الكمية: ${qty}`);
    let line = parts.join(" | ");
    if (r.description) line += `<br><span style="color:#666;font-size:11px;">${escapeHtml(r.description)}</span>`;
    return line;
  }).filter(Boolean);

  /**
   * الترويسة المُنشأة تلقائياً ليست تغليفاً.
   *
   * شاشة التغليف تكتب `{ invoice_id, quantity: 1 }` بمجرّد فتحها — قبل أن
   * يُدخل المستخدم شيئاً. فمن فتح النافذة وأغلقها كان يقرأ في فاتورته
   * «الكمية: 1» ويظنّها تغليفاً. والعلامة الفارقة أن ما عدا الكمية فارغٌ
   * كلّه: لا نوع ولا طرود ولا وزن ولا أبعاد ولا تكلفة ولا ملاحظة.
   */
  const isAutoHeader = (r: any) =>
    !typeName(r) && !Number(r.packs_count || 0) && !Number(r.pieces_per_pack || 0)
    && !Number(r.weight || 0) && !r.dimensions && !Number(r.cost || 0) && !r.notes;

  // 2) حقول المستند من الترويسة — تُذكر إن مُلئت فقط.
  const headerLines = (headers || []).filter((r) => !isAutoHeader(r)).map((r) => {
    const parts: string[] = [];
    const type = typeName(r);
    const weight = Number(r.weight || 0);
    const dims = r.dimensions || "";
    // النوع والكمية على الترويسة لا يُذكران إلا حين لا بنود أصلاً — وإلا
    // كُرِّرا فوق تفصيلٍ أدقّ منهما.
    if (itemLines.length === 0) {
      if (type) parts.push(`النوع: ${escapeHtml(type)}`);
      const qty = Number(r.quantity || 0);
      const packs = Number(r.packs_count || 0);
      const pieces = Number(r.pieces_per_pack || 0);
      if (qty) parts.push(`الكمية: ${qty}`);
      if (packs) parts.push(`عدد الطرود: ${packs}`);
      if (pieces) parts.push(`قطع/طرد: ${pieces}`);
    }
    if (weight) parts.push(`الوزن: ${weight}`);
    if (dims) parts.push(`الأبعاد: ${escapeHtml(dims)}`);
    let line = parts.join(" | ");
    const cost = Number(r.cost || 0);
    if (line && cost > 0) line += ` — التكلفة: ${fmt(cost)}`;
    if (line && r.notes) line += `<br><span style="color:#666;font-size:11px;">${escapeHtml(r.notes)}</span>`;
    return line;
  }).filter(Boolean);

  const lines = [...itemLines, ...headerLines];
  if (lines.length === 0) return undefined;

  let html = lines.join("<br>");
  const totalCost = (headers || []).reduce((s, r) => s + Number(r.cost || 0), 0);
  if (totalCost > 0) html += `<br><strong>الإجمالي: ${fmt(totalCost)}</strong>`;
  return html;
}

export async function loadInvoiceExtras(invoiceId: string | undefined | null): Promise<ExtraStrings> {
  if (!invoiceId) return {};
  const key = `invoice:${invoiceId}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const [{ data: transports }, { data: packaging }, { data: packagingItems }] = await Promise.all([
      supabase
        .from("invoice_transports")
        .select("transporters(name, phone, address), destinations(name)")
        .eq("invoice_id", invoiceId),
      supabase
        .from("invoice_packaging")
        .select("quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_types(name)")
        .eq("invoice_id", invoiceId),
      // بنود المستخدم الحقيقية — الترويسة وحدها لا تحمل تغليفاً. راجع `formatPackaging`.
      supabase
        .from("invoices_packaging_items")
        .select("product_name, packs_count, pieces_per_pack, quantity, description, packaging_types(name)")
        .eq("invoice_id", invoiceId)
        .order("created_at"),
    ]);
    const value: ExtraStrings = {
      transportInfo: formatTransports(transports || []),
      packagingInfo: formatPackaging(packaging || [], packagingItems || []),
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
    const [{ data: transports }, { data: packaging }, { data: packagingItems }] = await Promise.all([
      supabase
        .from("quote_transports")
        .select("transporters(name, phone, address), destinations(name)")
        .eq("quote_id", quoteId),
      supabase
        .from("quotes_packaging")
        .select("quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_types(name)")
        .eq("quote_id", quoteId),
      supabase
        .from("quotes_packaging_items")
        .select("product_name, packs_count, pieces_per_pack, quantity, description, packaging_types(name)")
        .eq("quote_id", quoteId)
        .order("created_at"),
    ]);
    const value: ExtraStrings = {
      transportInfo: formatTransports(transports || []),
      packagingInfo: formatPackaging(packaging || [], packagingItems || []),
    };
    setCached(key, value);
    return value;
  } catch (e) {
    console.error("[printExtras] loadQuoteExtras failed", e);
    return {};
  }
}
