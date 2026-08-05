import { supabase } from "@/integrations/supabase/client";
import {
  attachLookups,
  PACKAGING_TYPE_LOOKUP,
  TRANSPORTER_LOOKUP,
  DESTINATION_LOOKUP,
} from "@/utils/lookupJoin";

/**
 * القراءة الفاشلة تُذكر ولا تُبتلع.
 *
 * PostgREST لا يرمي استثناءً حين يرفض الاستعلام — يردّ `{ data: null, error }`.
 * فمن يستخرج `data` وحدها يقرأ «لا توجد بيانات» ولا يعرف أنه لم يقرأ شيئاً.
 * وهو ما أخفى عطل المفاتيح الأجنبية أشهراً.
 */
function reportQueryErrors(where: string, results: Record<string, { error?: any }>) {
  for (const [name, res] of Object.entries(results)) {
    if (res?.error) console.error(`[printExtras] ${where}: فشل استعلام ${name}`, res.error);
  }
}

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
    /**
     * سطران لا سطرٌ واحد بأربعة حقولٍ مفصولةٍ بـ`|`.
     *
     * طلبه صاحب المستودع: «اجعل تفاصيل الترحيل بسيطة». والحقول لم تُحذف —
     * حذفُ معلومةٍ عن العميل ليس تبسيطاً — بل رُتّبت بأهمّيتها: ما يحتاجه
     * العميل أوّلاً (إلى أين، ومع من) بخطٍّ واضح، وما يحتاجه عند الاستلام
     * (الهاتف والعنوان) تحته بخطٍّ أصغر.
     *
     * وتبقى الوسوم `span` و`br` لا `div`: المحتوى يُدرَج داخل `<p>` في
     * القالب، وعنصرُ كتلةٍ داخل فقرةٍ يخرج منها في المتصفّح فينكسر الترتيب.
     */
    const main: string[] = [];
    if (name) main.push(`الاسم: ${escapeHtml(name)}`);
    if (destination) main.push(`الوجهة: ${escapeHtml(destination)}`);
    const sub: string[] = [];
    if (phone) sub.push(`الهاتف: ${escapeHtml(phone)}`);
    if (address) sub.push(`العنوان: ${escapeHtml(address)}`);

    let block = `<span class="tr-main">${main.join(" — ")}</span>`;
    if (sub.length) block += `<br><span class="tr-sub">${sub.join(" · ")}</span>`;
    blocks.push(block);
  }
  if (blocks.length === 0) return undefined;
  return blocks.join("<br>");
}

/**
 * تفاصيل التغليف — **جدولٌ** كما طلبه صاحب المستودع (وأرسل صورته).
 *
 * ## الشكل المطلوب
 *     ┌───────┬──────────────────────────────────────┐
 *     │ العدد │ نوع التغليف                          │
 *     ├───────┼──────────────────────────────────────┤
 *     │   2   │ كرتونة كبيرة                          │
 *     │   1   │ ربطه باكم فرامل فوق جي ان        5X  │
 *     ├───────┼──────────────────────────────────────┤
 *     │  14   │ عدد القطع                            │
 *     └───────┴──────────────────────────────────────┘
 *
 * والعدد **إلى اليمين**: هو أوّل ما تقع عليه العين في RTL، وهو المطلوب عند
 * التحميل — تعدّ الطرود ثم تقرأ نوعها.
 *
 * سطرٌ لكل بند: النوع ومعه اسم الصنف إن وُجد، والعدد هو عدد الطرود. و«5X»
 * بالأحمر تعني خمس قطعٍ في الطرد الواحد — تُذكر حين تتجاوز الواحدة فقط، وإلا
 * كانت ضجيجاً على كل سطر. والذيل مجموع الطرود: «عدد القطع».
 *
 * وكان العرض سطوراً نصّية مفصولة بـ`|` («النوع: … | الصنف: … | عدد الطرود: …»)
 * — تُقرأ في بندين وتُرهق في عشرين، ولا تُقابَل أرقامها بالعين.
 *
 * ## من أين تُقرأ البيانات
 * التغليف مُخزَّنٌ في جدولين:
 *   `invoice_packaging`        → **ترويسة** تُنشئها الشاشة تلقائياً بمجرّد فتح
 *                                النافذة: `{ invoice_id, quantity: 1 }`.
 *   `invoices_packaging_items` → **بنود المستخدم**: النوع والصنف وعدد الطرود.
 *
 * فالبنود هي مصدر الجدول، والترويسة تُكمّل بحقول المستند وحدها (الوزن
 * والأبعاد والتكلفة) حين تُملأ — سطراً تحت الجدول لا صفّاً فيه.
 *
 * التنسيق داخل السمات لا في ورقة أنماط: هذه السلسلة تُحقن في قالبَي طباعةٍ
 * اثنين (المعاينة وورقة السقوط)، فلو اتّكلت على CSS خارجي لاختلف الشكلان.
 */
const PKG_BORDER = "1px solid #b8bcc4";
/**
 * كل خاصّية تُذكر في السمة صراحةً — القالبان يحملان قواعد `table` و`thead th`
 * و«تخطيط الصفوف الزوجية» عامّةً، فبلا تصريحٍ يختلف الشكل بين ورقةٍ وأخرى.
 */
/**
 * حشوٌ ضيّق وسطرٌ قريب — «الجدول ممتدّ ومطّاطي رغم أنّ العناصر فيه قليلة».
 *
 * كان 3px حشواً بلا `line-height`، فيرث سطرَ الجسم 1.5 — فيصير ارتفاع الصفّ
 * ضعفَ نصّه. والجدولُ الذي فيه سبعة أسطر كان يشغل نصف الورقة.
 */
const pkgCell = (align: "right" | "center") =>
  `border:${PKG_BORDER};padding:2px 6px;line-height:1.25;text-align:${align};`
  + `font-size:11.5px;background:#fff;color:#1a1a1a;font-weight:400;`;
const pkgHeadCell = (align: "right" | "center") =>
  `border:${PKG_BORDER};padding:2px 6px;line-height:1.25;text-align:${align};`
  + `font-size:11.5px;background:#5b4cad;color:#fff;font-weight:700;`;

export function formatPackaging(headers: any[], items: any[] = []): string | undefined {
  const typeName = (r: any) => r.packaging_types?.name || "";

  // 1) بنود المستخدم — صفٌّ لكلٍّ منها.
  const rows = (items || []).map((r) => {
    const type = typeName(r);
    const product = r.product_name || "";
    // النوع ثم الصنف: «كرتونه باكم فرامل فوق جي ان» — كما في الصورة.
    const label = [type, product].filter(Boolean).join(" ");
    // العدد = عدد الطرود، فإن لم يُسجَّل فالكمية (بيانات أُدخلت قبل العمود).
    const packs = Number(r.packs_count || 0) || Number(r.quantity || 0) || 0;
    const pieces = Number(r.pieces_per_pack || 0);
    return { label, packs, pieces, note: r.description || "" };
  }).filter((r) => r.label || r.packs);

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

  const realHeaders = (headers || []).filter((r) => !isAutoHeader(r));

  // ترويسةٌ فيها تغليفٌ ولا بنود: تصير صفّاً في الجدول كي لا تضيع.
  if (rows.length === 0) {
    for (const r of realHeaders) {
      const type = typeName(r);
      const packs = Number(r.packs_count || 0) || Number(r.quantity || 0) || 0;
      if (type || packs) {
        rows.push({ label: type, packs, pieces: Number(r.pieces_per_pack || 0), note: "" });
      }
    }
  }

  // 2) حقول المستند من الترويسة — سطرٌ تحت الجدول، تُذكر إن مُلئت فقط.
  const headerNotes = realHeaders.map((r) => {
    const parts: string[] = [];
    const weight = Number(r.weight || 0);
    const dims = r.dimensions || "";
    if (weight) parts.push(`الوزن: ${weight}`);
    if (dims) parts.push(`الأبعاد: ${escapeHtml(dims)}`);
    let line = parts.join(" | ");
    if (line && r.notes) line += `<br><span style="color:#666;font-size:11px;">${escapeHtml(r.notes)}</span>`;
    return line;
  }).filter(Boolean);

  if (rows.length === 0 && headerNotes.length === 0) return undefined;

  const body = rows.map((r) => {
    // «5X» تعني قطعاً في الطرد — بالأحمر وفي طرف الخانة كما في الصورة.
    const xMark = r.pieces > 1
      ? `<span style="color:#c0392b;font-weight:700;float:left;">${r.pieces}X</span>`
      : "";
    const note = r.note
      ? `<div style="color:#666;font-size:11px;font-weight:400;">${escapeHtml(r.note)}</div>`
      : "";
    return `<tr>`
      + `<td style="${pkgCell("center")}">${r.packs || ""}</td>`
      + `<td style="${pkgCell("right")}">${escapeHtml(r.label)}${xMark}${note}</td>`
      + `</tr>`;
  }).join("");

  const totalPacks = rows.reduce((s, r) => s + r.packs, 0);
  const totalCost = (headers || []).reduce((s, r) => s + Number(r.cost || 0), 0);
  const footCell = `${pkgCell("right")}color:#c0392b;font-weight:800;`;
  const footCellC = `${pkgCell("center")}color:#c0392b;font-weight:800;`;
  /**
   * صفُّ المجموع في **متن الجدول** لا في `<tfoot>`.
   *
   * ## العطل كما بلّغ عنه صاحب المستودع
   * «يظهر إجمالي عدد قطع التغليف (14 قطعة) في الصفحة الأولى، رغم أنّ بقيّة
   * أسطر التغليف في الصفحة الثانية».
   *
   * ## والسبب قاعدةٌ في قالب الطباعة
   * `tfoot { display: table-footer-group; }` تجعل المتصفّح يُكرّر الذيل في
   * **أسفل كل صفحة** يمتدّ إليها الجدول — وهو سلوكٌ مقصودٌ لذيول جداولٍ
   * أخرى. فظهر مجموعُ القطع في نهاية الصفحة الأولى قبل أن تنتهي البنود.
   *
   * فصار المجموع صفّاً عادياً آخرَ `tbody`: لا يتكرّر، ولا يظهر إلا بعد آخر
   * سطرٍ فعلاً — أي في الصفحة الأخيرة وحدها.
   *
   * ويُمنع انقسامه عن سطره السابق بـ`page-break-inside`، فلا يقع وحيداً في
   * أعلى صفحةٍ بلا ما يجمعه.
   */
  const foot = rows.length
    ? `<tr style="page-break-inside:avoid;break-inside:avoid;">`
      + `<td style="${footCellC}">${totalPacks}</td>`
      + `<td style="${footCell}">عدد القطع</td>`
      + `</tr>`
    : "";

  const table = rows.length
    // `data-pkg-rows` يُبلِّغ القالبَ عدد البنود: عند كثرتها يأخذ الصندوق
    // عرض الورقة كاملاً وينزل الترحيل تحته. والعدد يأتي من مُنتِجه لا من
    // عدٍّ للوسوم في القالب.
    ? `<table data-pkg-rows="${rows.length}" style="width:100%;border-collapse:collapse;border:${PKG_BORDER};margin:0;font-size:11.5px;color:#1a1a1a;">`
      + `<thead><tr>`
      + `<th style="${pkgHeadCell("center")}width:56px;">العدد</th>`
      + `<th style="${pkgHeadCell("right")}">نوع التغليف</th>`
      + `</tr></thead>`
      + `<tbody>${body}${foot}</tbody>`
      + `</table>`
    : "";

  const extras = [...headerNotes];
  if (totalCost > 0) extras.push(`<strong>الإجمالي: ${fmt(totalCost)}</strong>`);
  const tail = extras.length
    ? `<div style="margin-top:6px;font-size:11px;color:#444;">${extras.join("<br>")}</div>`
    : "";

  return `${table}${tail}` || undefined;
}

export async function loadInvoiceExtras(invoiceId: string | undefined | null): Promise<ExtraStrings> {
  if (!invoiceId) return {};
  const key = `invoice:${invoiceId}`;
  const cached = getCached(key);
  if (cached) return cached;
  try {
    // بلا ربطٍ داخل `select`: الجداول الثلاثة بلا مفاتيح أجنبية في القاعدة
    // الحيّة، فأيّ `packaging_types(name)` هنا يردّ خطأً و`data` فارغة
    // صامتة — وهو ما كان يُقرأ «لا توجد بيانات تغليف». راجع `lookupJoin.ts`.
    const [transportsRes, packagingRes, itemsRes] = await Promise.all([
      supabase
        .from("invoice_transports")
        .select("transporter_id, destination_id")
        .eq("invoice_id", invoiceId),
      supabase
        .from("invoice_packaging")
        .select("quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_type_id")
        .eq("invoice_id", invoiceId),
      // بنود المستخدم الحقيقية — الترويسة وحدها لا تحمل تغليفاً. راجع `formatPackaging`.
      supabase
        .from("invoices_packaging_items")
        .select("product_name, packs_count, pieces_per_pack, quantity, description, packaging_type_id")
        .eq("invoice_id", invoiceId)
        .order("created_at"),
    ]);
    reportQueryErrors("loadInvoiceExtras", { transports: transportsRes, packaging: packagingRes, items: itemsRes });

    const [transports, packaging, packagingItems] = await Promise.all([
      attachLookups(transportsRes.data as any[], [TRANSPORTER_LOOKUP, DESTINATION_LOOKUP]),
      attachLookups(packagingRes.data as any[], [PACKAGING_TYPE_LOOKUP]),
      attachLookups(itemsRes.data as any[], [PACKAGING_TYPE_LOOKUP]),
    ]);

    const value: ExtraStrings = {
      transportInfo: formatTransports(transports),
      packagingInfo: formatPackaging(packaging, packagingItems),
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
    // نفس علّة الفواتير: جداول العروض كذلك بلا مفاتيح أجنبية.
    const [transportsRes, packagingRes, itemsRes] = await Promise.all([
      supabase
        .from("quote_transports")
        .select("transporter_id, destination_id")
        .eq("quote_id", quoteId),
      supabase
        .from("quotes_packaging")
        .select("quantity, packs_count, pieces_per_pack, weight, dimensions, cost, notes, packaging_type_id")
        .eq("quote_id", quoteId),
      supabase
        .from("quotes_packaging_items")
        .select("product_name, packs_count, pieces_per_pack, quantity, description, packaging_type_id")
        .eq("quote_id", quoteId)
        .order("created_at"),
    ]);
    reportQueryErrors("loadQuoteExtras", { transports: transportsRes, packaging: packagingRes, items: itemsRes });

    const [transports, packaging, packagingItems] = await Promise.all([
      attachLookups(transportsRes.data as any[], [TRANSPORTER_LOOKUP, DESTINATION_LOOKUP]),
      attachLookups(packagingRes.data as any[], [PACKAGING_TYPE_LOOKUP]),
      attachLookups(itemsRes.data as any[], [PACKAGING_TYPE_LOOKUP]),
    ]);

    const value: ExtraStrings = {
      transportInfo: formatTransports(transports),
      packagingInfo: formatPackaging(packaging, packagingItems),
    };
    setCached(key, value);
    return value;
  } catch (e) {
    console.error("[printExtras] loadQuoteExtras failed", e);
    return {};
  }
}
