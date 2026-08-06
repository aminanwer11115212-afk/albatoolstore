/**
 * تخطيط الورقة: صندوقا التغليف والترحيل، وشكلُ A4 على الشاشة.
 *
 * ## ما طلبه صاحب المستودع
 *   1. «إذا تجاوزت 20 بند تغليف» يأخذ الصندوق عرض الورقة، **وتفاصيل الترحيل
 *      بعدها** — لأن الترحيل سطران أو ثلاثة، فيبقى نصفُ الورقة بياضاً إلى
 *      جانب تغليفٍ يمتدّ ثلاث صفحات.
 *   2. «رابط المعاينة يفتح الشكل على A4 كالـPDF» — كان المستند يتمدّد بعرض
 *      النافذة داخل الـiframe، فيختلف عمّا يراه العميل حين ينزّل الـPDF.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatPackaging, formatTransports, packagingColumns } from "@/utils/printExtras";
import { generatePrintHTML, buildPrintWindowHtml } from "@/utils/printTemplate";

const pkgItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    packaging_types: { name: i % 2 ? "كرتونة" : "كيس" },
    product_name: `صنف ${i + 1}`,
    packs_count: (i % 4) + 1,
    pieces_per_pack: 1,
    quantity: 1,
  }));

const transportInfo = formatTransports([
  { transporters: { name: "شركة النقل", phone: "0912", address: "السوق" }, destinations: { name: "بورتسودان" } },
])!;

const sheet = (packagingCount: number) =>
  generatePrintHTML({
    type: "invoice", number: "INV-1", date: "2026-08-04",
    customer: { name: "عميل" },
    items: [{ product_name: "بطارية", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
    subtotal: 1000, taxTotal: 0, discountTotal: 0, grandTotal: 1000, company: null,
    packagingInfo: formatPackaging([], pkgItems(packagingCount)),
    transportInfo,
  } as any);

/** مواضع الصناديق في الورقة، بترتيب ظهورها. */
const boxOrder = (html: string) => [
  { key: "packaging", at: html.indexOf('data-section="packaging"') },
  { key: "transport", at: html.indexOf('data-section="transport"') },
].sort((a, b) => a.at - b.at).map((b) => b.key);

// الصنف يحمل مُعدِّلاً دائماً (`extra-row extra-row--head`) فيُعدّ بالبادئة
const extraRowCount = (html: string) => (html.match(/class="extra-row[ "]/g) || []).length;

/**
 * سطرٌ للترحيل والحساب، وسطرٌ للتغليف تحتهما — أرسل صاحب المستودع الشكل
 * مقصوصاً مُعاد الترتيب.
 *
 * وله سببٌ في التخطيط: الترحيلُ سطران والحسابُ أربعةُ صفوف، كلاهما ثابتُ
 * الطول مهما كبرت الفاتورة، فيملآن سطراً تماماً. والتغليفُ وحده يمتدّ بعدد
 * بنوده فيُفرَد بسطره.
 *
 * وكان الحسابُ وحده في سطر ثم التغليفُ والترحيلُ في سطر — فيقف الترحيلُ
 * القصير إلى جانب التغليف الطويل تاركاً ثلثَ الورقة بياضاً.
 */
describe("سطرُ الترحيل والحساب، ثمّ التغليف تحتهما", () => {
  it("صفّان: رأسٌ وتغليف", () => {
    const html = sheet(7);
    expect(extraRowCount(html)).toBe(2);
    expect(html).toContain('class="extra-row extra-row--head"');
    expect(html).toContain('class="extra-row extra-row--pkg"');
  });

  /**
   * المواضع تُقاس بالسمة كاملةً لا باسم الصنف: الاسم مكتوبٌ في قواعد
   * `<style>` أعلى الورقة أيضاً، فـ`indexOf` عليه يقع على القاعدة لا على
   * العنصر — ويعطي ترتيباً مقلوباً لا معنى له.
   */
  it("والحسابُ في صفّ الرأس مع الترحيل لا في صفٍّ وحده", () => {
    const html = sheet(7);
    const headAt = html.indexOf('class="extra-row extra-row--head"');
    const pkgRowAt = html.indexOf('class="extra-row extra-row--pkg"');
    const accountAt = html.indexOf('data-section="account-summary"');
    const transportAt = html.indexOf('data-section="transport"');
    expect(headAt).toBeGreaterThan(-1);
    expect(accountAt).toBeGreaterThan(headAt);
    expect(accountAt).toBeLessThan(pkgRowAt);
    expect(transportAt).toBeGreaterThan(headAt);
    expect(transportAt).toBeLessThan(pkgRowAt);
  });

  it("والترحيل قبل الحساب — أوّلُ عنصرٍ إلى اليمين في RTL", () => {
    const html = sheet(7);
    expect(html.indexOf('data-section="transport"'))
      .toBeLessThan(html.indexOf('data-section="account-summary"'));
  });

  it("والتغليف بعدهما، وحده في صفّه", () => {
    const html = sheet(7);
    expect(html.indexOf('data-section="packaging"'))
      .toBeGreaterThan(html.indexOf('data-section="transport"'));
    expect(boxOrder(html)).toEqual(["transport", "packaging"]);
  });

  /** ولا يتغيّر الترتيب بكثرة البنود — لا حدَّ يُتجاوز بعد اليوم. */
  it("والترتيب واحدٌ ببندٍ وبستّين", () => {
    for (const n of [1, 20, 21, 60]) {
      expect(extraRowCount(sheet(n))).toBe(2);
      expect(boxOrder(sheet(n))).toEqual(["transport", "packaging"]);
    }
  });

  it("العدد يأتي من مُنتِج الأسطر لا من عدٍّ للوسوم", () => {
    expect(formatPackaging([], pkgItems(21))).toContain('data-pkg-rows="21"');
  });
});

/**
 * عمود «العدد» إلى اليمين — أوّل ما تقع عليه العين في RTL، وهو المطلوب عند
 * التحميل: تعدّ الطرود ثم تقرأ نوعها. طلبه صاحب المستودع صراحةً.
 */
/**
 * ## الشكل بعد صورة صاحب المستودع
 * أسطرٌ لا جدولٌ بعمودين: «2 كرتونة بطارية *10»، والمجموع «20 قطعة» تحته خطّ.
 */
describe("تفاصيل التغليف أسطرٌ لا جدول", () => {
  const table = formatPackaging([], pkgItems(3))!;

  it("لا ترويسةَ أعمدة", () => {
    expect(table).not.toContain("نوع التغليف");
    expect(table).not.toContain("<thead>");
  });

  it("والسطر: العدد ثم النوع ثم الصنف", () => {
    expect(table).toContain("1 كيس صنف 1");
  });

  it("و«‎*‎عدد» للقطع في الطرد — لا «X» في طرف الخانة", () => {
    const many = formatPackaging([], [{ packaging_types: { name: "كرتونة" }, product_name: "بطارية", packs_count: 2, pieces_per_pack: 10, quantity: 1 }])!;
    expect(many).toContain("2 كرتونة بطارية *10");
    expect(many).not.toContain("10X");
  });

  it("والقطعةُ الواحدة لا تُذكر — ضجيجٌ على كل سطر", () => {
    const one = formatPackaging([], [{ packaging_types: { name: "كيس" }, product_name: "صنف", packs_count: 3, pieces_per_pack: 1, quantity: 1 }])!;
    expect(one).toContain("3 كيس صنف");
    expect(one).not.toContain("*1");
  });

  it("والخطّ عريضٌ — ورقةٌ تُقرأ في المخزن لا على شاشة", () => {
    expect(table).toContain("font-weight:700");
  });

  /**
   * القالبان يحملان `tbody td { text-align:center }` وتظليلَ الصفوف الزوجية،
   * وترثهما أسطرُ التغليف لأنها `<tr><td>` داخلهما. فخرجت في أوّل تصييرٍ
   * وسطَ الصندوق مخطّطةً بالرمادي بدل أسطرٍ متتاليةٍ من اليمين — ولا يكشفه
   * إلا تصييرُ الورقة، فيُثبَّت هنا حارساً.
   */
  it("والأسطر من اليمين بخلفيةٍ بيضاء — لا وسطَ الصندوق ولا مخطّطة", () => {
    expect(table).toContain("text-align:right");
    expect(table).toContain("background:#fff");
    expect(table).not.toContain("text-align:center");
  });

  /**
   * شريطُ المجموع — «اجعل عدد القطع واضح أكثر بتنسيق مميّز».
   *
   * كان سطراً كسائر الأسطر تحته خطّ: رقمٌ في آخر عمودٍ طويل لا تقع عليه
   * العين، وهو أهمُّ رقمٍ في الصندوق — عليه يُستلم الشحن ويُعدّ. وكان عارياً
   * بلا وصفٍ أيضاً، فلا يُعرف مِمَّ هو.
   */
  it("والمجموع شريطٌ مميّز موصوفٌ بعدده", () => {
    const total = pkgItems(3).reduce((s, r) => s + r.packs_count, 0);
    const last = table.slice(table.lastIndexOf('<div data-pkg-line'));
    expect(last).toContain("إجمالي القطع");
    expect(last).toContain(`${total} قطعة`);
    // أرضيةٌ وإطارٌ بلون العنوان — يُقرأ الصندوق كتلةً واحدة
    expect(last).toContain("background:#f1eefb");
    expect(last).toContain("#5b2c8e");
  });

  /**
   * الأسطرُ تتوزّع أعمدةً: صار للتغليف سطرُه وحده بعرض الورقة، فخرجت سبعةُ
   * بنودٍ عموداً نحيلاً من اليمين وإلى جانبه أربعةُ أخماس الصندوق بياضاً،
   * وأربعون بنداً تمتدّ صفحةً كاملة.
   */
  it("والأسطر تتوزّع أعمدةً — لا عموداً نحيلاً وبياضاً", () => {
    expect(formatPackaging([], pkgItems(2))).toContain("column-count:1");
    expect(formatPackaging([], pkgItems(7))).toContain("column-count:2");
    expect(formatPackaging([], pkgItems(40))).toContain("column-count:3");
  });

  /**
   * ثلاثةٌ حدُّ الأعلى: أضيقُ من ذلك يكسر السطر فيصير بندٌ واحدٌ سطرين —
   * وقراءةُ البند أهمّ من ملء العرض.
   */
  it("ولا تتجاوز ثلاثة مهما كثرت", () => {
    for (const n of [40, 100, 300]) {
      expect(packagingColumns(n)).toBeLessThanOrEqual(3);
    }
    expect(packagingColumns(2)).toBe(1);
    expect(packagingColumns(11)).toBe(3);
  });

  /**
   * الكتلة لا تنقسم بين صفحتين. جُرّب بإزالة المنع: ثمانيةَ عشرَ بنداً إلى
   * اثنين وعشرين مع أربعةَ عشرَ بندَ تغليفٍ تُرسم كتلتُها في صفحتين لا واحدة.
   */
  it("والكتلة لا تنقسم بين صفحتين", () => {
    const html = formatPackaging([], pkgItems(14))!;
    const wrapper = html.slice(html.indexOf("data-pkg-rows"));
    expect(wrapper.slice(0, 120)).toContain("break-inside:avoid");
  });
});

describe("إخفاء أحد الصندوقين لا يكسر التخطيط", () => {
  const hidden = (keys: string[], n: number) =>
    generatePrintHTML({
      type: "invoice", number: "INV-1", date: "2026-08-04",
      customer: { name: "عميل" },
      items: [{ product_name: "بطارية", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
      subtotal: 1000, taxTotal: 0, discountTotal: 0, grandTotal: 1000, company: null,
      packagingInfo: formatPackaging([], pkgItems(n)),
      transportInfo,
      hiddenSections: keys,
    } as any);

  it("إخفاء الترحيل مع تغليفٍ طويل", () => {
    const html = hidden(["transport"], 30);
    expect(html).toContain('data-section="packaging"');
    expect(html).not.toContain('data-section="transport"');
  });

  it("إخفاء التغليف مع تغليفٍ طويل", () => {
    const html = hidden(["packaging"], 30);
    expect(html).not.toContain('data-section="packaging"');
    expect(html).toContain('data-section="transport"');
  });
});

/**
 * الشاشة تُري ما يُريه الـPDF: ورقة A4 لا عمودٌ مطّاط بعرض النافذة.
 */
describe("شكل A4 على الشاشة — كالـPDF", () => {
  const html = sheet(3);

  it("قاعدة شاشةٍ مستقلّة عن الطباعة", () => {
    expect(html).toContain("@media screen");
  });

  it("الورقة بمقاس A4 بالمليمتر لا بنسبةٍ من النافذة", () => {
    expect(html).toMatch(/width:\s*210mm/);
    expect(html).toMatch(/min-height:\s*297mm/);
  });

  it("وهامشها 10mm — نفس قاعدة الطباعة", () => {
    expect(html).toContain("@page { size: A4; margin: 10mm; }");
    expect(html).toMatch(/padding:\s*10mm/);
  });

  it("على أرضيةٍ رمادية تُظهر حوافّ الورقة", () => {
    expect(html).toMatch(/background:\s*#e5e7eb/);
    expect(html).toMatch(/box-shadow:\s*0 2px 14px/);
  });

  it("والهاتف يعرضها كاملةً مصغَّرة — لا شريطَ تمرير أفقي", () => {
    expect(html).toContain('<meta name="viewport" content="width=794">');
  });

  it("والطباعة على حالها — لا تتأثّر بقواعد الشاشة", () => {
    expect(html).toContain("@media print { body { padding: 0; } .page { max-width: none; } }");
  });
});

/**
 * قاعدة الورقة الواحدة: أيّ تعديل في المعاينة يظهر في رابط العميل بشكل A4.
 *
 * والحراسة بنيوية لا تعاقدية: الصفحتان تعرضان ناتج القالب في `iframe` بلا
 * زيادة، فما دام التنسيق في القالب وحده استحال أن تختلفا. ولو كُتبت قاعدةُ
 * ورقٍ في إحدى الصفحتين لانفصلتا — وهو ما وقع سابقاً حين بُنيت ورقة العميل
 * في دالّة حافةٍ مستقلّة.
 */
describe("قاعدة الورقة الواحدة — المعاينة والرابط", () => {
  const read = (p: string) =>
    fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const PAGES = ["src/pages/DocumentPreviewPage.tsx", "src/pages/StandaloneShareDocument.tsx"];

  it.each(PAGES)("%s تعرض ناتج القالب في iframe", (file) => {
    const src = read(file);
    expect(src).toContain("srcDoc");
  });

  it.each(PAGES)("%s لا تحمل مقاس ورقٍ خاصّاً بها", (file) => {
    const src = read(file);
    // مقاس الورقة في القالب وحده — لا نسخةَ ثانية تنفصل عنه
    expect(src).not.toContain("210mm");
    expect(src).not.toContain("297mm");
  });

  it("والمقاس مكتوبٌ في القالب مرّةً واحدة", () => {
    const tpl = read("src/utils/printTemplate.ts");
    expect(tpl.match(/210mm/g)?.length).toBeGreaterThan(0);
    expect(tpl).toContain("@page { size: A4; margin: 10mm; }");
  });

  it("والرابط يبني بالقالب نفسه لا بـHTML جاهز", () => {
    expect(read("src/utils/sharedDocumentHtml.ts")).toContain("generatePrintHTML");
  });
});

/**
 * حراسة: القالب سلسلةٌ نصّية طويلة، وعلامة backtick داخل تعليقٍ عربي فيها
 * **تُنهي السلسلة** فيخرج المستند مبتوراً أو يسقط بـ`ReferenceError`. وقع هذا
 * ثلاث مرّات في هذا الملف — مرّةً كسر ورقة العميل كلياً.
 */
describe("الورقة تخرج كاملة — لا سلسلةَ انقطعت", () => {
  const html = sheet(25);

  it("تبدأ بـDOCTYPE وتنتهي بإغلاق html", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("ولا تحمل تعبير إدراجٍ لم يُستبدَل", () => {
    expect(html).not.toContain("${");
  });

  it("وأقسامها كلّها حاضرة", () => {
    for (const marker of ["بطارية", "تفاصيل التغليف", "معلومات الترحيل", "توقيع المستلم"]) {
      expect(html).toContain(marker);
    }
  });
});

/**
 * مراجعة أزرار المعاينة والرابط، وتطابق الـPDF.
 *
 * طلب صاحب المستودع: «راجع المعاينة والطباعة ورابط العميل وأزرارهم كلّها
 * شغّالة، وتنزيل PDF لرابط المعاينة مطابق».
 *
 * والمخاطرة الجديدة أن إطار الورقة على الشاشة (أرضية رمادية، ظِلّ، هامش
 * 10mm) يدخل الـPDF: html2canvas يصوّر بوسيط **screen** لا print. فلولا
 * نزعُه لخرج الملف بأرضيةٍ رمادية وبهامشٍ مضاعَف — هامش الورقة فوق هامش
 * html2pdf. وهذا ما يحرسه القسم الأخير.
 */
describe("أزرار شريط المعاينة كلّها موصولة", () => {
  // الشريط يُحقن في `buildPrintWindowHtml` لا في القالب نفسه
  const html = buildPrintWindowHtml(sheet(3));
  const BUTTONS: Array<[string, string]> = [
    ["__btn_print", "طباعة"],
    ["__btn_pdf", "تحميل PDF"],
    ["__btn_wa_pdf", "واتساب PDF"],
    ["__btn_link_online", "رابط للعميل"],
    ["__btn_wa_text", "واتساب نص"],
    ["__btn_toggle_vis", "تخصيص الرؤية"],
  ];

  it.each(BUTTONS)("زر %s (%s) موجود", (id) => {
    expect(html).toContain(`id="${id}"`);
  });

  it.each(BUTTONS)("وله معالِج نقر — لا زرٌّ ميّت (%s)", (id) => {
    // كل زرٍّ يُقرأ بمعرّفه ثم يُربط بـonclick في نصّ الشريط
    expect(html).toMatch(new RegExp(`${id}[\\s\\S]{0,4000}?onclick`));
  });

  it("والشريط لا يدخل الطباعة ولا الـPDF", () => {
    expect(html).toContain("__lov_print_toolbar");
    expect(html).toContain("bar.remove()");
  });
});

describe("PDF مطابقٌ للورقة — لا إطارَ شاشةٍ يتسلّل إليه", () => {
  const tpl = fs.readFileSync(path.resolve(process.cwd(), "src/utils/printTemplate.ts"), "utf8");
  const share = fs.readFileSync(path.resolve(process.cwd(), "src/pages/StandaloneShareDocument.tsx"), "utf8");

  it("زر الـPDF في المعاينة ينزع إطار الشاشة من النسخة", () => {
    const fn = tpl.slice(tpl.indexOf("function contentEl()"), tpl.indexOf("function genPdfBlob()"));
    expect(fn).toContain("boxShadow = 'none'");
    expect(fn).toContain("background = '#fff'");
    expect(fn).toMatch(/padding = '0'/);
  });

  it("وتنزيل PDF من رابط العميل كذلك", () => {
    const fn = share.slice(share.indexOf("handleDownloadPdf"), share.indexOf("html2pdf()"));
    expect(fn).toContain('boxShadow = "none"');
    expect(fn).toContain('background = "#fff"');
  });

  it("والمقاس المطبوع A4 في المسارين", () => {
    expect(tpl).toContain("format: 'a4'");
    expect(share).toContain('format: "a4"');
  });

  it("والصفحة الأصلية لا تُمسّ — النزع على النسخة وحدها", () => {
    const fn = tpl.slice(tpl.indexOf("function contentEl()"), tpl.indexOf("function genPdfBlob()"));
    expect(fn).toContain("document.body.cloneNode(true)");
    expect(share).toContain("cloneNode(true)");
  });
});

/* ─────────── مجموع القطع في الصفحة الأخيرة وحدها ─────────── */

/**
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «يظهر إجمالي عدد قطع التغليف (14 قطعة) في الصفحة الأولى، رغم أنّ بقيّة
 * أسطر التغليف في الصفحة الثانية».
 *
 * ## والسبب قاعدةٌ عامّة في القالب
 * `tfoot { display: table-footer-group; }` تجعل المتصفّح يُكرّر الذيل أسفلَ
 * **كل صفحة** يمتدّ إليها الجدول. وهي مقصودةٌ لجداول أخرى، فأضرّت بهذا.
 */
describe("مجموع القطع لا يتكرّر على الصفحات", () => {
  const table = formatPackaging([], pkgItems(40))!;

  it("لا `tfoot` في جدول التغليف", () => {
    expect(table).not.toContain("<tfoot>");
  });

  it("والمجموع آخرُ سطرٍ في الكتلة", () => {
    const last = table.slice(table.lastIndexOf("<div"));
    expect(last).toContain("قطعة");
  });

  /**
   * والمجموع **خارج** الأعمدة: لو بقي داخلها لجرى مع البنود فوقع في ذيل
   * عمودٍ من الأعمدة لا في آخر الصندوق.
   */
  it("وخارجَ الأعمدة لا داخلها", () => {
    const doc = new DOMParser().parseFromString(`<div>${table}</div>`, "text/html");
    const cols = doc.querySelector("[style*='column-count']")!;
    const lines = Array.from(doc.querySelectorAll("[data-pkg-line]"));
    const totalEl = lines[lines.length - 1];
    expect(cols).toBeTruthy();
    expect(totalEl.textContent).toContain("قطعة");
    expect(cols.contains(totalEl)).toBe(false);
    // وبنودُه داخلها
    expect(cols.contains(lines[0])).toBe(true);
  });

  it("ولا ينقسم عن سطره السابق فيقع وحيداً أعلى صفحة", () => {
    const last = table.slice(table.lastIndexOf("<div"));
    expect(last).toContain("page-break-inside:avoid");
  });

  it("والقالب يُبطل تكرار الذيل داخل صندوق التغليف", () => {
    const html = sheet(40);
    expect(html).toContain(".extra-content tfoot { display: table-row-group; }");
  });

  it("والمجموع رقمٌ واحد صحيح مهما كثرت البنود", () => {
    const total = pkgItems(40).reduce((s, r) => s + r.packs_count, 0);
    expect(table).toContain(`${total} قطعة`);
  });
});

describe("والجدول ملمومٌ لا مطّاطي", () => {
  const table = formatPackaging([], pkgItems(7))!;

  it("حشوٌ ضيّق وسطرٌ قريب — لا يرث 1.5 من الجسم فيضاعف ارتفاع السطر", () => {
    expect(table).toContain("padding:1px 0");
    expect(table).toContain("line-height:1.6");
  });

  it("وبلا حدودٍ للخلايا — الصورة أسطرٌ لا شبكة", () => {
    expect(table).toContain("border:0");
  });

  it("والصندوق بقدر ما فيه — بلا ارتفاعٍ أدنى مفروض", () => {
    const html = sheet(7);
    // القاعدة الأولى `.extra-box` هي المقصودة — لا قاعدةُ كسر الصفحات التي
    // تشترك معها في البادئة
    const at = html.indexOf(".extra-box {\n    flex: 1;");
    expect(at).toBeGreaterThan(-1);
    const box = html.slice(at, html.indexOf("}", at));
    expect(box).not.toContain("min-height");
    expect(box).toContain("padding: 8px 12px");
  });
});
