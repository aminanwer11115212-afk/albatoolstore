/**
 * قياسُ عرضِ المحتوى في ورقةٍ مولَّدة — بالتعاقب الفعليّ لا بوجود السطر.
 *
 * ## لماذا لا يكفي البحثُ عن نصّ القاعدة
 * العطلُ الذي أخرج هذا الملفَّ كان **قاعدةً موجودةً لا تعمل**:
 *
 *     @media print { body { padding: 0; } }   ← مكتوبةٌ أوّلاً
 *     body { padding: 20px; }                 ← ثمّ هذه، فتغلبها
 *
 * فبحثٌ عن `padding: 0` في نصّ القالب يجده ويطمئنّ، والورقةُ تُطبع بهامشٍ
 * زائد. فلا يُحرَس هذا إلا بحسابِ الغالبِ في التعاقب: أهمّيةٌ، ثمّ أولويّةُ
 * المُحدِّد، ثمّ الترتيب — وهو ما يفعله المتصفّح.
 *
 * والحسابُ هنا مقصورٌ على ما يحدّد عرضَ الورقة: هوامشُ `body` و`.page`
 * وعرضُهما. لا محرّكَ CSS كاملاً — قياسٌ لسؤالٍ واحد.
 */

const MM_PER_PX = 25.4 / 96;

export type Media = "screen" | "print";

/** كلُّ ما يُقاس من ورقةٍ واحدة في وسيطٍ واحد. */
export interface SheetGeometry {
  /** هامشُ `@page` بالمليمتر. */
  pageMarginMm: number;
  landscape: boolean;
  /** عرضُ الورقة الكامل (210 أو 297). */
  sheetWidthMm: number;
  /** هامشُ `body` الأفقي الغالب في هذا الوسيط. */
  bodyPadMm: number;
  /** هامشُ `.page` الأفقي الغالب. */
  pagePadMm: number;
  /** عرضُ `.page` الصريح، أو null إن كان تابعاً لأبيه. */
  pageWidthMm: number | null;
  /** عرضُ المحتوى الصالح — الرقمُ الذي يجب أن يتطابق بين المعاينة والورق. */
  contentMm: number;
}

/* ─────────────────────────── تحليلُ النصّ ─────────────────────────── */

function styleText(html: string): string {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
}

interface Decl {
  prop: string;
  value: string;
  important: boolean;
  spec: number;
  order: number;
}

/**
 * أولويّةُ المُحدِّد — تقريبٌ يكفي لما هنا: معرِّفٌ 100، صنفٌ أو سمةٌ أو
 * صنفٌ زائف 10، وسمُ عنصرٍ 1، والشاملُ `*` صفر.
 */
function specificity(sel: string): number {
  const s = sel.trim();
  if (s === "*") return 0;
  let n = 0;
  n += (s.match(/#[\w-]+/g) || []).length * 100;
  n += (s.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || []).length * 10;
  n += (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+/g, "").match(/[a-z][\w-]*/gi) || []).length;
  return n;
}

/** هل يطابق مُحدِّدٌ العنصرَ المطلوب؟ (`body` أو `.page` أو `*`) */
function matches(selectorText: string, target: string): boolean {
  return selectorText
    .split(",")
    .map((s) => s.trim())
    .some((s) => s === target || s === "*");
}

/** هل يسري استعلامُ الوسيط على الوسيط المطلوب؟ */
function mediaApplies(mediaText: string, media: Media): boolean {
  const t = mediaText.trim().toLowerCase();
  if (!t || t === "all") return true;
  return t.split(",").map((s) => s.trim()).includes(media);
}

/** يُطابق ما يفعله المتصفّح: أهمّيةٌ، ثمّ أولويّة، ثمّ ترتيب. */
function winner(decls: Decl[]): Decl | undefined {
  return decls.reduce<Decl | undefined>((best, d) => {
    if (!best) return d;
    if (d.important !== best.important) return d.important ? d : best;
    if (d.spec !== best.spec) return d.spec > best.spec ? d : best;
    return d.order >= best.order ? d : best;
  }, undefined);
}

/* ─────────────────────────── الوحدات ─────────────────────────── */

/** يحوّل قيمةَ طولٍ إلى مليمتر. `auto`/`none`/غيرُ المفهوم ⇒ null. */
export function toMm(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (v === "0") return 0;
  if (v === "auto" || v === "none") return null;
  const m = v.match(/^(-?[\d.]+)(mm|cm|px|in|pt)$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case "mm": return n;
    case "cm": return n * 10;
    case "in": return n * 25.4;
    case "pt": return (n * 25.4) / 72;
    default: return n * MM_PER_PX;
  }
}

/** يفكّ اختصارَ `padding` إلى يمينٍ ويسار. */
function shorthandSides(value: string): { left: string; right: string } {
  const parts = value.trim().split(/\s+/);
  const [t, r = t, , l = r] = parts;
  return { left: l, right: r };
}

/* ─────────────────────────── القياس ─────────────────────────── */

function collect(css: string): { rules: Array<{ media: string; sel: string; style: CSSStyleDeclaration }>; pageRule: CSSStyleDeclaration | null } {
  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
  const sheet = el.sheet as CSSStyleSheet;
  const rules: Array<{ media: string; sel: string; style: CSSStyleDeclaration }> = [];
  let pageRule: CSSStyleDeclaration | null = null;

  const walk = (list: CSSRuleList, media: string) => {
    for (const rule of Array.from(list)) {
      const any = rule as any;
      if (any.cssRules && any.media) {
        walk(any.cssRules as CSSRuleList, any.media.mediaText);
      } else if (any.selectorText) {
        // jsdom يقرأ `@page` كقاعدةِ نمطٍ اسمُها `@page`
        if (String(any.selectorText).trim() === "@page") pageRule = any.style;
        else rules.push({ media, sel: any.selectorText, style: any.style });
      }
    }
  };
  walk(sheet.cssRules, "all");
  document.head.removeChild(el);
  return { rules, pageRule };
}

/** الهامشُ الأفقي الغالب لعنصرٍ في وسيط. */
function horizontalPadding(
  rules: Array<{ media: string; sel: string; style: CSSStyleDeclaration }>,
  target: string,
  media: Media
): number {
  const sides: Record<"left" | "right", Decl[]> = { left: [], right: [] };
  rules.forEach((r, order) => {
    if (!mediaApplies(r.media, media) || !matches(r.sel, target)) return;
    const spec = Math.max(...r.sel.split(",").filter((s) => matches(s, target)).map(specificity));
    const push = (side: "left" | "right", value: string, prop: string) => {
      if (!value) return;
      sides[side].push({ prop, value, important: r.style.getPropertyPriority(prop) === "important", spec, order });
    };
    const short = r.style.getPropertyValue("padding");
    if (short) {
      const { left, right } = shorthandSides(short);
      push("left", left, "padding");
      push("right", right, "padding");
    }
    push("left", r.style.getPropertyValue("padding-left"), "padding-left");
    push("right", r.style.getPropertyValue("padding-right"), "padding-right");
  });
  const l = toMm(winner(sides.left)?.value) ?? 0;
  const r = toMm(winner(sides.right)?.value) ?? 0;
  return l + r;
}

/** قيمةُ خاصّيةٍ طولية غالبة، بالمليمتر (null = auto/none/غير مصرَّح). */
function lengthOf(
  rules: Array<{ media: string; sel: string; style: CSSStyleDeclaration }>,
  target: string,
  media: Media,
  prop: string
): number | null {
  const decls: Decl[] = [];
  rules.forEach((r, order) => {
    if (!mediaApplies(r.media, media) || !matches(r.sel, target)) return;
    const value = r.style.getPropertyValue(prop);
    if (!value) return;
    const spec = Math.max(...r.sel.split(",").filter((s) => matches(s, target)).map(specificity));
    decls.push({ prop, value, important: r.style.getPropertyPriority(prop) === "important", spec, order });
  });
  return toMm(winner(decls)?.value);
}

/**
 * الإعلانُ الغالب لخاصّيةٍ على عنصرٍ في وسيط — قيمتُه وهل هو `!important`.
 *
 * يلزم حين يكتب سكربتُ الورقة قيمةً **سطرية**: السطريُّ يغلب كلَّ قاعدةٍ في
 * التنسيق إلا المُعلَّمةَ بـ`!important`. فلا يكفي وجودُ قاعدةٍ تُلغيه —
 * يلزم أن تكون مُعلَّمة.
 */
export function winningDeclaration(
  html: string,
  media: Media,
  target: string,
  prop: string
): { value: string; important: boolean } | null {
  const { rules } = collect(styleText(html));
  const decls: Decl[] = [];
  rules.forEach((r, order) => {
    if (!mediaApplies(r.media, media) || !matches(r.sel, target)) return;
    const value = r.style.getPropertyValue(prop);
    if (!value) return;
    const spec = Math.max(...r.sel.split(",").filter((s) => matches(s, target)).map(specificity));
    decls.push({ prop, value, important: r.style.getPropertyPriority(prop) === "important", spec, order });
  });
  const w = winner(decls);
  return w ? { value: w.value, important: w.important } : null;
}

/**
 * يقيس ورقةً مولَّدة في وسيطٍ واحد.
 *
 * @param html ناتجُ القالب كاملاً
 * @param media `screen` كما يراها صاحبُها، أو `print` كما تنزل ورقاً
 */
export function measureSheet(html: string, media: Media): SheetGeometry {
  const css = styleText(html);
  const { rules, pageRule } = collect(css);

  const sizeText = pageRule ? (pageRule as CSSStyleDeclaration).getPropertyValue("size") : "";
  const landscape = /landscape/i.test(sizeText || "");
  const sheetWidthMm = landscape ? 297 : 210;
  const pageMarginMm = toMm(pageRule ? (pageRule as CSSStyleDeclaration).getPropertyValue("margin") : "") ?? 0;

  const bodyPadMm = horizontalPadding(rules, "body", media);
  const pagePadMm = horizontalPadding(rules, ".page", media);
  const pageWidthMm = lengthOf(rules, ".page", media, "width");
  const pageMaxWidthMm = lengthOf(rules, ".page", media, "max-width");

  // المساحةُ التي تقع فيها الورقة: الشاشةُ بعرض الورقة، والورقُ ما بين الهامشين
  const available = (media === "print" ? sheetWidthMm - 2 * pageMarginMm : sheetWidthMm) - bodyPadMm;
  let outer = pageWidthMm ?? available;
  if (pageMaxWidthMm !== null) outer = Math.min(outer, pageMaxWidthMm);

  // كلُّ هذه القوالب تعلن `* { box-sizing: border-box }` — والهامشُ داخلَ العرض
  const contentMm = outer - pagePadMm;

  return {
    pageMarginMm,
    landscape,
    sheetWidthMm,
    bodyPadMm,
    pagePadMm,
    pageWidthMm,
    contentMm: Math.round(contentMm * 10) / 10,
  };
}
