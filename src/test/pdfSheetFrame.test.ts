/**
 * زرّ «واتساب PDF» في إنشاء الفاتورة وتعديلها يُخرج الورقة بشكل المعاينة.
 *
 * ## العطل كما وصفه صاحب المستودع
 * «زر إرسال PDF في اضافة و تعديل فاتورة» يجب أن يكون «بنفس المعاينة ورابط
 * العميل». وكان يخالفهما: هوامشُ أعرض، وبياضٌ تحت الورقة إلى آخر الصفحة،
 * وظِلٌّ رمادي على الحوافّ.
 *
 * ## والسبب
 * html2canvas يصوّر بوسيط `screen`، والقالب يلبس الورقة على الشاشة إطارَ
 * عرضٍ في `@media screen`: حشوُ 10mm وارتفاعٌ أدنى 297mm وظِلّ. فيدخل الإطارُ
 * الملفَّ: حشوُ الورقة **فوق** هامش html2pdf (8mm)، وارتفاعُ صفحةٍ كاملة
 * لفاتورةٍ قصيرة.
 *
 * وشريطُ الأدوات داخل الورقة يُحيّد هذا الإطار منذ البداية (`contentEl` في
 * `printTemplate`) — فمن يُصدّر من المعاينة يُصيب ومن يُصدّر من شاشة الإدخال
 * يُخطئ. فصارت القاعدة واحدةً في `pdfSheetFrame`.
 *
 * ## وتسرُّبُ الأنماط
 * وسمُ `<style>` عامٌّ في المستند أينما وُضع. فحقنُ أنماط الورقة في صفحة
 * التطبيق كان يُلبس عناصرَ التطبيق أرضيةَ الورقة وظِلَّها ما دام التوليد
 * جارياً — ثبت بالتصيير: `.page` في التطبيق خرج بظِلّ الورقة.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  stripScreenOnlyCss,
  neutralizeSheetFrame,
  SHEET_PAGE_RESET,
  SHEET_HOST_RESET,
} from "@/utils/pdfSheetFrame";
import { generatePrintHTML } from "@/utils/printTemplate";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ─────────── ١) نزعُ كتل الشاشة ─────────── */

describe("stripScreenOnlyCss", () => {
  it("ينزع `@media screen` كاملةً", () => {
    const css = "a{color:red}@media screen{ .page{padding:10mm} body{background:#e5e7eb} }b{color:blue}";
    const out = stripScreenOnlyCss(css);
    expect(out).not.toContain("@media screen");
    expect(out).not.toContain("#e5e7eb");
    expect(out).toContain("a{color:red}");
    expect(out).toContain("b{color:blue}");
  });

  it("ويُبقي `@media print` — هو الشكل المقصود", () => {
    const css = "@media print{ .page{max-width:none} }";
    expect(stripScreenOnlyCss(css)).toBe(css);
  });

  it("و`@media screen, print` تبقى — تخصّ الورق أيضاً", () => {
    const css = "@media screen, print{ .x{color:red} }";
    expect(stripScreenOnlyCss(css)).toBe(css);
  });

  it("واستعلامُ المقاس المجرّد تنسيقُ عرضٍ يُنزع", () => {
    const css = "@media (max-width: 640px){ .toolbar{display:none} }.k{}";
    const out = stripScreenOnlyCss(css);
    expect(out).not.toContain("max-width: 640px");
    expect(out).toContain(".k{}");
  });

  /**
   * كتلةُ `@media` تحوي قواعد بأقواسها، فتعبيرٌ نمطيّ يقف عند أوّل `}` داخلها
   * ويترك بقيّة الكتلة معلّقةً — قواعدُ الشاشة تسري عندئذٍ بلا شرط.
   */
  it("والأقواس المتداخلة تُعدّ لا تُطابَق بتعبيرٍ نمطي", () => {
    const css = "@media screen{ .a{color:red} .b{color:blue} }.after{color:green}";
    const out = stripScreenOnlyCss(css);
    expect(out.trim()).toBe(".after{color:green}");
  });

  it("وكتلةٌ غير مغلقة لا تُقصّ", () => {
    const css = "@media screen{ .a{color:red}";
    expect(stripScreenOnlyCss(css)).toBe(css);
  });

  it("ونصٌّ بلا `@media` يمرّ كما هو", () => {
    expect(stripScreenOnlyCss(".a{color:red}")).toBe(".a{color:red}");
  });
});

/* ─────────── ٢) على القالب الحقيقي ─────────── */

const SHEET = generatePrintHTML({
  type: "invoice", number: "INV-1", date: "2026-08-05",
  customer: { name: "عميل" },
  items: [{ product_name: "بطارية", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
  subtotal: 1000, taxTotal: 0, discountTotal: 0, grandTotal: 1000, company: null,
} as any);

describe("القالب الحقيقي بعد النزع", () => {
  const styles = Array.from(SHEET.matchAll(/<style>([\s\S]*?)<\/style>/g)).map((m) => m[1]);
  const stripped = styles.map(stripScreenOnlyCss).join("\n");

  it("إطارُ الشاشة موجودٌ في الأصل — وإلا فالاختبار يحرس عدماً", () => {
    expect(styles.join("\n")).toContain("@media screen");
    expect(styles.join("\n")).toContain("min-height: 297mm");
  });

  it("ويختفي بعد النزع", () => {
    expect(stripped).not.toContain("@media screen");
    expect(stripped).not.toContain("min-height: 297mm");
  });

  it("وقواعد الطباعة تبقى", () => {
    expect(stripped).toContain("@media print");
  });

  it("وتنسيقُ الورقة نفسه يبقى — النزع للإطار لا للمحتوى", () => {
    expect(stripped).toContain(".header");
    expect(stripped).toContain(".total-row");
  });
});

/* ─────────── ٣) الضبط السطري ─────────── */

/** jsdom يُطبّع القيم: `0`→`0px` و`#fff`→`rgb(255, 255, 255)`. */
const ZERO = /^0(px)?$/;
const WHITE = /#fff|rgb\(255,\s*255,\s*255\)/;

describe("neutralizeSheetFrame", () => {
  it("يُطفئ الحشو والارتفاع الأدنى والظِلّ على `.page`", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="page">ورقة</div>`;
    neutralizeSheetFrame(host);
    const page = host.querySelector<HTMLElement>(".page")!;
    expect(page.style.padding).toMatch(ZERO);
    expect(page.style.minHeight).toMatch(ZERO);
    expect(page.style.boxShadow).toBe("none");
    expect(page.style.width).toBe("auto");
    expect(page.style.zoom).toBe("1");
  });

  it("وأرضيةُ الحاوية بيضاء بلا حشو", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="page"></div>`;
    neutralizeSheetFrame(host);
    expect(host.style.padding).toMatch(ZERO);
    expect(host.style.background).toMatch(WHITE);
  });

  it("والمخفيّ بزرّ «تخصيص الرؤية» يُنزع لا يُخفى", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div class="page"><div data-section="pkg" class="__lov_hidden">تغليف</div><div>بنود</div></div>`;
    neutralizeSheetFrame(host);
    expect(host.textContent).not.toContain("تغليف");
    expect(host.textContent).toContain("بنود");
  });

  it("وورقةٌ بلا `.page` لا تُسقِط شيئاً", () => {
    const host = document.createElement("div");
    host.innerHTML = `<div>بلا ورقة</div>`;
    expect(() => neutralizeSheetFrame(host)).not.toThrow();
  });
});

/* ─────────── ٤) توأمُ شريط الأدوات ─────────── */

/**
 * `contentEl` داخل الورقة تفعل الشيء نفسه بجافاسكربت خام — لا يمكن استيرادها،
 * فتُقارَن خاصّيةً خاصّية. ولولا هذا لانزاح أحد المسارين عن الآخر بصمت،
 * وعاد الاختلافُ الذي شكا منه صاحب المستودع.
 */
describe("الضبط واحدٌ في الوحدة وفي شريط الأدوات", () => {
  const src = read("src/utils/printTemplate.ts");
  const contentEl = src.slice(src.indexOf("function contentEl"), src.indexOf("function genPdfBlob"));

  it("شريط الأدوات يضبط كل خاصّية في `SHEET_PAGE_RESET` بنفس القيمة", () => {
    for (const [prop, value] of Object.entries(SHEET_PAGE_RESET)) {
      expect(contentEl, `pg.style.${prop}`).toContain(`pg.style.${prop} = '${value}'`);
    }
  });

  it("وأرضيةَ الحاوية وحشوها كذلك", () => {
    for (const [prop, value] of Object.entries(SHEET_HOST_RESET)) {
      expect(contentEl, `clone.style.${prop}`).toContain(`clone.style.${prop} = '${value}'`);
    }
  });

  it("وينزع المخفيّ كما تنزعه الوحدة", () => {
    expect(contentEl).toContain("__lov_hidden");
  });
});

/* ─────────── ٥) المسار كاملاً: ما يصل المُصوِّر ─────────── */

let captured: HTMLElement | null = null;
let capturedPageStyle: Record<string, string> = {};
let capturedOpts: any = null;

/**
 * html2canvas وjsPDF مباشرةً — لا html2pdf.
 *
 * حُذفت طبقةُ html2pdf من المسار بعد ثلاثة أعطالٍ خرجت منها: صفحةٌ بيضاء،
 * ثمّ ورقةٌ مزاحة، ثمّ ورقةٌ مقصوصةُ الحافّة. راجع `buildPdfBlob`.
 */
vi.mock("html2canvas", () => ({
  default: async (el: HTMLElement, opts: any) => {
    captured = el;
    capturedOpts = opts;
    const page = el.querySelector<HTMLElement>(".page");
    capturedPageStyle = page
      ? {
          padding: page.style.padding,
          minHeight: page.style.minHeight,
          boxShadow: page.style.boxShadow,
          zoom: page.style.zoom,
        }
      : {};
    // لوحةٌ صوريّة: jsdom لا يرسم، فيكفي المقاسُ ودالّةُ التصدير
    return {
      width: 794,
      height: 1600,
      getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_v: string) {} }),
      toDataURL: () => "data:image/jpeg;base64,AAAA",
    } as any;
  },
}));

/**
 * jsdom بلا دعم canvas: `getContext("2d")` تُعيد `null` و`toDataURL` غير
 * مدعومة. تُسدّان هنا — نقصٌ في بيئة الاختبار لا في الشيفرة.
 */
beforeEach(() => {
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    fillRect() {}, drawImage() {}, fillStyle: "",
  });
  (HTMLCanvasElement.prototype as any).toDataURL = () => "data:image/jpeg;base64,AAAA";
});

vi.mock("jspdf", () => ({
  jsPDF: class {
    addPage() {}
    addImage() {}
    output() { return new Blob(["%PDF-1.4"], { type: "application/pdf" }); }
  },
}));

describe("buildPdfBlob يُسلّم المُصوِّر ورقةً محيَّدة", () => {
  let origComplete: PropertyDescriptor | undefined;
  beforeEach(() => {
    captured = null;
    capturedPageStyle = {};
    // jsdom لا يجلب الصور فلا يُطلق `load` ولا `error` — والشعار في الورقة.
    origComplete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      get: () => true,
      configurable: true,
    });
  });
  afterEach(() => {
    document.body.innerHTML = "";
    if (origComplete) Object.defineProperty(HTMLImageElement.prototype, "complete", origComplete);
  });

  it("الورقة تصل بلا حشوٍ ولا ارتفاعٍ أدنى ولا ظِلّ", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    await buildPdfBlob(SHEET);
    expect(captured).toBeTruthy();
    expect(capturedPageStyle.padding).toMatch(ZERO);
    expect(capturedPageStyle.minHeight).toMatch(ZERO);
    expect(capturedPageStyle.boxShadow).toBe("none");
    expect(capturedPageStyle.zoom).toBe("1");
  });

  it("والأنماط المحقونة بلا كتلة الشاشة — فلا تُلبَس لعناصر التطبيق", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    await buildPdfBlob(SHEET);
    const css = Array.from(captured!.querySelectorAll("style")).map((s) => s.textContent).join("\n");
    expect(css).not.toContain("@media screen");
    expect(css).toContain("@media print");
  });

  it("والمحتوى كامل — التحييد للإطار لا للبنود", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    await buildPdfBlob(SHEET);
    expect(captured!.textContent).toContain("بطارية");
    expect(captured!.textContent).toContain("توقيع المستلم");
  });

  it("والحاوية تُزال بعد التوليد — لا تتراكم في المستند", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    await buildPdfBlob(SHEET);
    expect(document.body.querySelector(".page")).toBeNull();
  });

  /**
   * ## العنصرُ المُسلَّم إلى html2pdf ساكنٌ بلا إزاحة
   *
   * `toContainer` في html2pdf يستنسخ ما يُعطى ثمّ يفرض عليه:
   *
   *     container.firstChild.style.position = 'relative';
   *
   * فلو حمل العنصرُ إزاحةَ الإخفاء (`left: -10000px`) بطل `fixed` وبقيت
   * `left` — وهي تحت `relative` **إزاحةٌ فعلية**، فتنزاح الورقةُ المرسومة
   * خارج الحاوية التي يصوّرها html2canvas ويخرج الملفُّ **صفحةً بيضاء**.
   *
   * قيس بالتصيير الحقيقي: 3,058 بايت بلا صورةٍ مُضمَّنة ← 382,783 بايت
   * بصورة. فالإزاحةُ على غلافٍ خارجيّ، والمُسلَّمُ داخليٌّ ساكن.
   */
  it("العنصرُ المُسلَّم إلى المُصوِّر بلا إزاحةٍ تُخرج مرسومه من الحاوية", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    await buildPdfBlob(SHEET);
    const el = captured!;
    expect(el.style.position).not.toBe("fixed");
    expect(el.style.position).not.toBe("absolute");
    for (const side of ["left", "top", "right", "bottom"] as const) {
      const v = el.style[side];
      expect(v === "" || /^0(px)?$/.test(v), `${side}=${v}`).toBe(true);
    }
  });

  it("والإزاحةُ على غلافه الخارجي — فيبقى بعيداً عن الشاشة", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    await buildPdfBlob(SHEET);
    const outer = captured!.parentElement!;
    expect(outer.style.position).toBe("fixed");
    expect(parseInt(outer.style.left, 10)).toBeLessThan(-1000);
  });

  /**
   * ## نافذةُ الاستنساخ بعرض الورقة لا بعرض شاشة الجهاز
   *
   * html2canvas يستنسخ المستند في إطارٍ بعرض `window.innerWidth`. فعلى هاتفٍ
   * أضيق من الورقة تُخطَّط الورقةُ في إطارٍ ضيّق فتفيض منه — وفي RTL يكون
   * الفيضان **يساراً بإحداثيّاتٍ سالبة**، خارج المنطقة المصوَّرة. فخرج عمودُ
   * «الإجمالي» والتاريخُ ورقمُ الفاتورة مقصوصةً من الحافّة، وصوّره صاحب
   * المستودع في الفاتورة وعرض السعر معاً.
   *
   * ولا يظهر في المعاينة لأن ورقتها مستندٌ قائمٌ بذاته نافذتُه بعرض الورقة —
   * ولهذا طُلب «اربطه بمعاينة الفاتورة من ناحية الشكل».
   *
   * وقيس بالتصيير: العمودُ المقصوص عاد كاملاً، والزمنُ نزل من 848ms إلى
   * 430ms — التخطيطُ يقع مرّةً بمقاسٍ صحيح لا مرّتين.
   */
  it("نافذةُ الاستنساخ بعرض الورقة — وإلا قُصّت حافّتها على الهاتف", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    const { SHEET_WIDTH_PX } = await import("@/utils/pdfSheetFrame");
    await buildPdfBlob(SHEET);
    expect(capturedOpts?.windowWidth).toBe(SHEET_WIDTH_PX);
    expect(capturedOpts?.width).toBe(SHEET_WIDTH_PX);
  });

  it("وهي عرضُ الحاوية نفسه — مقاسٌ واحد لا مقاسان", async () => {
    const { buildPdfBlob } = await import("@/utils/shareDocumentPdf");
    const { SHEET_WIDTH_PX } = await import("@/utils/pdfSheetFrame");
    await buildPdfBlob(SHEET);
    expect(captured!.style.width).toBe(`${SHEET_WIDTH_PX}px`);
    expect(captured!.parentElement!.style.width).toBe(`${SHEET_WIDTH_PX}px`);
  });
});

/* ─────────── ٦) انتظارُ الصور لا يعلّق الزرّ ─────────── */

/**
 * شعارُ الورقة صورةٌ من الشبكة. وطلبٌ لا يُجيب ولا يفشل — شبكةٌ بطيئة أو نطاقٌ
 * محجوب — لا يُطلق `load` ولا `error`. فانتظارٌ بلا مهلة يُبقي الوعد معلّقاً
 * ويُبقي الزرّ «جاري التجهيز...» بلا نهاية ولا رسالة خطأ.
 *
 * وهذه الحال هي حال jsdom نفسها: أوّل تشغيلٍ لهذه الاختبارات عُلّق حتى المهلة
 * — تكرارٌ حرفيٌّ للعطل الذي يقع عند المستخدم.
 */
describe("waitForImages", () => {
  it("يخرج بعد المهلة ولو لم تُجب الصورة", async () => {
    const { waitForImages } = await import("@/utils/shareDocumentPdf");
    const host = document.createElement("div");
    host.innerHTML = `<img src="https://example.invalid/logo.png">`;
    // jsdom لا يجلب الصورة: `complete` باقيةٌ false ولا حدث يقع
    const started = Date.now();
    await waitForImages(host, 30);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("ولا ينتظر أصلاً حين تكون الصور جاهزة", async () => {
    const { waitForImages } = await import("@/utils/shareDocumentPdf");
    const host = document.createElement("div");
    host.innerHTML = `<img src="x">`;
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "complete");
    Object.defineProperty(HTMLImageElement.prototype, "complete", { get: () => true, configurable: true });
    try {
      // مهلةٌ مستحيلة: لو انتظر لسقط الاختبار بانتهاء وقته
      await waitForImages(host, 60_000);
    } finally {
      if (desc) Object.defineProperty(HTMLImageElement.prototype, "complete", desc);
    }
  });

  it("ويخرج فور استجابة الصورة قبل المهلة", async () => {
    const { waitForImages } = await import("@/utils/shareDocumentPdf");
    const host = document.createElement("div");
    host.innerHTML = `<img src="x">`;
    const img = host.querySelector("img")!;
    const p = waitForImages(host, 60_000);
    setTimeout(() => img.onerror?.(new Event("error")), 0);
    await p;
  });

  it("وحاويةٌ بلا صور تخرج فوراً", async () => {
    const { waitForImages } = await import("@/utils/shareDocumentPdf");
    const host = document.createElement("div");
    host.innerHTML = `<div>بلا صور</div>`;
    await waitForImages(host, 60_000);
  });
});
