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
 * عددُ أعمدة أسطر التغليف.
 *
 * ## العطل الذي عالجه
 * صار للتغليف سطرُه وحده بعرض الورقة، فخرجت سبعةُ بنودٍ عموداً نحيلاً من
 * اليمين وإلى جانبه أربعةُ أخماس الصندوق بياضاً. وأربعون بنداً تنزل أربعين
 * سطراً فتمتدّ صفحةً كاملة — والورقة عندها بنودها وترحيلها وحسابها.
 *
 * فالأسطر تتوزّع أعمدةً: عرضُ الصندوق يُملأ، والطولُ يقصر إلى الثلث.
 * أربعون بنداً تصير أربعةَ عشرَ سطراً في ثلاثة أعمدة.
 *
 * ## والحدود
 * العمودُ الواحد لبندٍ أو بندين — عمودان لسطرٍ واحدٍ في كلٍّ منهما تبعثرٌ لا
 * تنسيق. وثلاثةٌ حدُّ الأعلى: أضيقُ من ذلك يكسر السطر («4 جوال طبلون جي ان
 * ‎*‎15» أطولُ ما يقع) فيصير بندٌ واحدٌ سطرين — وقراءةُ البند أهمّ من ملء
 * العرض.
 */
/** لونُ عنوان الصندوق — يتبعه شريطُ المجموع وخطُّ الفصل فتُقرأ الكتلة واحدة. */
const PKG_ACCENT = "#5b2c8e";
/** وخطُّ الفصل بين الأعمدة من اللون نفسه مخفَّفاً — ظاهرٌ على الورق لا باهت. */
const PKG_RULE = "#a08cc9";

export function packagingColumns(rowCount: number): number {
  if (rowCount <= 3) return 1;
  if (rowCount <= 10) return 2;
  return 3;
}

/**
 * تفاصيل التغليف — **أسطرٌ** كما أرسل صاحب المستودع صورتها.
 *
 * ## من أين تُقرأ البيانات
 * التغليف مُخزَّنٌ في جدولين:
 *   `invoice_packaging`        → **ترويسة** تُنشئها الشاشة تلقائياً بمجرّد فتح
 *                                النافذة: `{ invoice_id, quantity: 1 }`.
 *   `invoices_packaging_items` → **بنود المستخدم**: النوع والصنف وعدد الطرود.
 *
 * فالبنود هي مصدر الأسطر، والترويسة تُكمّل بحقول المستند وحدها (الوزن
 * والأبعاد والتكلفة) حين تُملأ — سطراً تحت الكتلة لا صفّاً فيها.
 *
 * التنسيق داخل السمات لا في ورقة أنماط: هذه السلسلة تُحقن في قالبَي طباعةٍ
 * اثنين (المعاينة وورقة السقوط)، فلو اتّكلت على CSS خارجي لاختلف الشكلان.
 */
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

  /**
   * ## الشكل كما أرسله صاحب المستودع بصورةٍ من ورقةٍ مطبوعة
   *
   *     الــتــفــاصــيــل
   *     2 كرتونة بطارية *10
   *     2 ربطة لستك 16 *10
   *     1 كرتونة فانوس *20
   *     ...
   *     20 قطعة
   *
   * أسطرٌ لا جدولٌ بعمودين: «العدد ثمّ النوع ثمّ الصنف ثمّ ‎*‎عدد القطع في
   * الطرد»، ثمّ المجموع سطراً أخيراً تحته خطّ.
   *
   * وكان جدولاً بعمودين وترويسةٍ بنفسجية — يقرأ رقمين متقابلين. والصورة تريد
   * سطراً واحداً يُقرأ كما يُنطق: «اثنان كرتونة بطارية، عشرٌ في الكرتونة».
   * فالسطر أقصر على الورق، وأقرب إلى ما يكتبه الموظّف بيده.
   *
   * والخطّ **عريضٌ في كل الصفحات** كما طُلب: هذه ورقةٌ تُقرأ في المخزن على
   * ضوءٍ ضعيف، لا على شاشة.
   */
  /*
   * ## ولا خلفيةَ للسطر — وهي كانت تقصّ نصفَ كلّ بندٍ في ملفّ العميل
   *
   * الخلفيةُ البيضاء بقيّةٌ من زمنٍ كان التغليفُ فيه جدولاً: تُبطل تظليلَ
   * الصفوف الزوجية وتوسيطَ الخلايا. وهو اليوم `div` لا صفّ، فلا قاعدةَ
   * جدوليّةٌ تصل إليه — والخلفيةُ باقيةٌ بلا عمل.
   *
   * إلا أنها لم تكن بلا ضرر: html2canvas يرسم في ترتيب المستند، وحين تفيض
   * حروفُ سطرٍ عن صندوقه (وهو ما يقع حين يختلف الخطُّ المتاح عن المطلوب)
   * تأتي **خلفيةُ السطر التالي فتطمس ما فاض**. فيصل العميلَ ملفٌّ نصفُ كلّ
   * بندٍ فيه مقطوع، ولا يسلم إلا آخرُ سطرٍ في كل عمود — إذ لا سطرَ بعده.
   *
   * قيس بعدّ البكسلات الداكنة في الصندوق: 12,995 بالخلفية، و**17,324**
   * بدونها — وهو عينُ ما يُرسم حين لا يكون هناك تداخلٌ أصلاً.
   */
  const lineStyle = "font-size:12.5px;font-weight:700;color:#1a1a1a;line-height:1.6;"
    + "padding:1px 0;border:0;text-align:right;";

  const lines = rows.map((r) => {
    // «*10» عددُ القطع في الطرد الواحد — تُذكر حين تتجاوز الواحدة فقط
    const xMark = r.pieces > 1 ? ` *${r.pieces}` : "";
    const note = r.note
      ? `<div style="color:#666;font-size:11px;font-weight:400;">${escapeHtml(r.note)}</div>`
      : "";
    // السطرُ لا ينقسم بين عمودين ولا بين صفحتين — نصفُ بندٍ لا يُقرأ
    return `<div data-pkg-line style="${lineStyle}page-break-inside:avoid;break-inside:avoid;">`
      + `${r.packs || ""} ${escapeHtml(r.label)}${xMark}`
      + `${note}</div>`;
  });

  const totalCost = (headers || []).reduce((s, r) => s + Number(r.cost || 0), 0);

  /**
   * ## شريطُ المجموع — «مجموع القطع خلّيه واضح، ووضّح للعميل أنّ هذا عدد قطع»
   *
   * كان سطراً كسائر الأسطر تحته خطّ: رقمٌ في آخر عمودٍ طويل لا تقع عليه
   * العين، وهو أهمُّ رقمٍ في الصندوق — عليه يُستلم الشحن ويُعدّ. فصار شريطاً
   * بعرض الصندوق: أرضيةٌ بنفسجية فاتحة بإطارٍ من لونه، والوصفُ يميناً
   * والرقمُ يساراً بخطٍّ أكبر.
   *
   * ## والرقمُ كان مسمّىً بغير اسمه
   * «136 قطعة» لم تكن قطعاً بل **طروداً**: مجموعُ `packs_count` وحده. والسطر
   * يقول «1 كرتونة بطارية ‎*‎10» — كرتونةٌ واحدة فيها عشرُ قطع. فمن جمع
   * الكرتونات وسمّاها قطعاً أخطأ في ورقةٍ يستلم بها العميلُ بضاعته.
   *
   * ولمّا طُلب أن يُوضَّح للعميل أنّ هذا عددُ قطع، لم يصحّ أن يُلصق الوصفُ
   * الصحيح برقمٍ خاطئ. فصار الرقمُ قطعاً فعلاً:
   *
   *     إجمالي عدد القطع        2,696 قطعة
   *
   * ## والطرودُ لا تُذكر — قرارُ صاحب المستودع
   * عُرضت إلى جانبها («2,696 قطعة · 136 طرداً») فطلب إخفاءها. والطرودُ
   * محسوبةٌ في الأسطر فوقها على أي حال: كلُّ سطرٍ يبدأ بعددها («2 كرتونة
   * بطارية ‎*‎10»)، فمن أراد عدّها عدّها من مواضعها.
   */
  const totalPieces = rows.reduce((s, r) => s + r.packs * (r.pieces > 0 ? r.pieces : 1), 0);
  const foot = rows.length
    ? `<div data-pkg-line style="margin-top:8px;padding:5px 10px;`
      + `background:#f1eefb;border:1px solid ${PKG_ACCENT};border-radius:5px;`
      + `display:flex;justify-content:space-between;align-items:center;`
      + `page-break-inside:avoid;break-inside:avoid;">`
      + `<span style="font-size:12px;font-weight:800;color:${PKG_ACCENT};">إجمالي عدد القطع</span>`
      // الفصلُ بهامشٍ لا بفراغ: المصوِّر يُسقط الفراغَ بين الرقم ووحدته —
      // ولا يُنجيه `&nbsp;` — فيخرج «108قطعة» ملتصقةً في ملفّ العميل، وهو
      // أهمُّ رقمٍ في الصندوق. والهامشُ تخطيطٌ لا حرفٌ يُسقَط.
      /*
       * الرقمُ ووحدتُه في وعاءٍ مرنٍ بفجوةٍ صريحة — لا فراغٍ ولا هامش.
       *
       * جُرّبت أربعُ صيغٍ بالتصوير الحقيقي: الفراغُ العادي والهامشُ المنطقي
       * كلاهما يخرج «42قطعة» ملتصقةً أو متراكبة، والحشوُ على أخوين يباعد
       * بينهما بعرض الصندوق. والفجوةُ وحدها تخرج «42 قطعة» كما تُكتب.
       *
       * ووعاءٌ واحد لا أخوان: الشريطُ موزَّعٌ بـspace-between، وثلاثةُ أبناءٍ
       * فيه تتباعد فيقع الرقمُ في وسط الصندوق بعيداً عن وحدته.
       */
      + `<span style="display:flex;gap:6px;align-items:baseline;`
      + `font-size:15px;font-weight:900;color:${PKG_ACCENT};letter-spacing:0.3px;">`
      + `<span>${fmt(totalPieces)}</span><span>قطعة</span></span>`
      + `</div>`
    : "";

  /**
   * الكتلةُ لا تنقسم بين صفحتين — والتصريحُ سطريّ لا في ورقة أنماط.
   *
   * الأعمدةُ قصّرتها إلى الثلث، فصارت تسعُ صفحةً كاملةً دائماً تقريباً. ولولا
   * المنعُ لانقسمت على حرفٍ من الصفحة: بندٌ أو بندان والمجموعُ وحدهما أعلى
   * الصفحة التالية — وهو أقبحُ من دفع الكتلة كلّها.
   *
   * وكان المنعُ متعذّراً قبل الأعمدة: أربعون بنداً في عمودٍ واحد أطولُ من
   * صفحة، والمتصفّح يتجاهل المنعَ عندئذٍ ويقسم — وهو نفسُه المخرجُ الآمن لو
   * جاءت مئتا بند.
   *
   * والتصريحُ هنا لا في CSS لأن السلسلة تُحقن في قالبين، وقاعدةُ
   * «page-break-inside: auto» على الصندوق مكتوبةٌ في كليهما فتغلب أيَّ صنف.
   */
  /**
   * خطٌّ فاصلٌ بين الأعمدة — أشّر عليه صاحب المستودع بقلمٍ أخضر على الصورة.
   *
   * وله سببٌ يتجاوز الزينة: الأعمدة متلاصقةٌ بفراغٍ وحده، والسطر فيها يبدأ
   * من اليمين وينتهي حيث ينتهي نصّه — فتختلط نهايةُ سطرٍ في عمودٍ ببداية
   * سطرٍ في العمود الذي يليه، ويُقرأ البندان بنداً واحداً. والخطُّ يفصلهما
   * فصلاً لا يحتاج تدقيقاً.
   */
  /**
   * ## الأعمدةُ مبنيّةٌ صراحةً لا بـ`column-count`
   *
   * كانت الأعمدةُ بخاصّية `column-count` — وهي صحيحةٌ على الشاشة وفي الطباعة،
   * لكنّ **html2canvas لا يدعمها**. فكلُّ ملفّ PDF فيه أكثرُ من ثلاثة بنود
   * تغليفٍ كان يخرج بأسطرٍ **مقطوعةٍ من نصفها**: لا يسلم منها إلا آخرُ سطرٍ
   * في كلّ عمود. صُوِّر بثمانية بنود فخرجت ستّةٌ منها مبتورة.
   *
   * وهو عطلٌ في ورقة العميل لا في المعاينة — أي في المخرج الذي لا يراه
   * صاحبُ المستودع إلا بعد أن يصل الزبون.
   *
   * فتُبنى الأعمدةُ عناصرَ صريحةً في سطرِ مرونة: يفهمها html2canvas، ويبقى
   * الشكلُ على الشاشة والورق كما كان. والتوزيعُ عموديٌّ كما كان
   * (`column-fill: balance`): أوّلُ البنود في العمود الأوّل.
   *
   * ## والخطُّ الفاصل بخصائصَ فيزيائية لا منطقية
   * أشّر عليه صاحب المستودع بقلمٍ أخضر، وله سببٌ يتجاوز الزينة: الأعمدة
   * متلاصقةٌ بفراغٍ وحده، والسطر فيها يبدأ من اليمين وينتهي حيث ينتهي نصّه —
   * فتختلط نهايةُ سطرٍ في عمودٍ ببداية سطرٍ في العمود الذي يليه. والورقةُ
   * دائماً RTL، فاليسارُ هو نهايةُ العمود — و`border-left` يفهمه المصوِّر
   * بينما `border-inline-end` قد لا يفهمه.
   */
  const columns = packagingColumns(rows.length);
  const perCol = Math.ceil(lines.length / columns) || 1;
  const colsHtml = Array.from({ length: columns }, (_, c) => {
    const part = lines.slice(c * perCol, (c + 1) * perCol).join("");
    if (!part) return "";
    // خطٌّ ظاهرٌ لا تلميحٌ باهت: يُطبع على ورقٍ ويُقرأ في مخزن، والرمادي
    // الفاتح يختفي في النسخ والتصوير — أشّر عليه صاحب المستودع بقلمٍ عريض.
    const rule = c < columns - 1 ? `border-left:1px solid ${PKG_RULE};padding-left:13px;` : "";
    const pad = c > 0 ? "padding-right:13px;" : "";
    return `<div data-pkg-col="${c + 1}" style="flex:1 1 0;min-width:0;${rule}${pad}">${part}</div>`;
  }).join("");

  const table = rows.length
    // `data-pkg-rows` يُبلِّغ القالبَ عدد البنود — تقرؤه الكثافة.
    ? `<div data-pkg-rows="${rows.length}" style="page-break-inside:avoid;break-inside:avoid;">`
      + `<div data-pkg-cols="${columns}" style="display:flex;align-items:flex-start;">${colsHtml}</div>`
      + `${foot}</div>`
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
