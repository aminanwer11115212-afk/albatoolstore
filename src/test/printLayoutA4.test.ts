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
import { formatPackaging, formatTransports } from "@/utils/printExtras";
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

// الصنف قد يحمل مُعدِّلاً (`extra-row extra-row--transport`) فيُعدّ بالبادئة
const extraRowCount = (html: string) => (html.match(/class="extra-row[ "]/g) || []).length;

describe("عشرون بنداً فأقلّ: الصندوقان متجاوران", () => {
  it("صفٌّ واحد يحمل الاثنين", () => {
    expect(extraRowCount(sheet(20))).toBe(1);
  });

  it("والاثنان موجودان", () => {
    const html = sheet(20);
    expect(html).toContain('data-section="packaging"');
    expect(html).toContain('data-section="transport"');
  });

  it("وحتى بندٍ واحد", () => {
    expect(extraRowCount(sheet(1))).toBe(1);
  });
});

describe("أكثر من عشرين: كلٌّ بعرض الورقة، والترحيل بعد التغليف", () => {
  const html = sheet(21);

  it("صفّان لا صفّ", () => {
    expect(extraRowCount(html)).toBe(2);
  });

  it("التغليف أوّلاً ثم الترحيل — ترتيب الأهمّية", () => {
    expect(boxOrder(html)).toEqual(["packaging", "transport"]);
  });

  it("الحدّ عند 21 لا 20 — «إذا تجاوزت»", () => {
    expect(extraRowCount(sheet(20))).toBe(1);
    expect(extraRowCount(sheet(21))).toBe(2);
  });

  it("وستّون بنداً كذلك", () => {
    const long = sheet(60);
    expect(extraRowCount(long)).toBe(2);
    expect(boxOrder(long)).toEqual(["packaging", "transport"]);
  });

  it("العدد يأتي من مُنتِج الجدول لا من عدٍّ للوسوم", () => {
    expect(formatPackaging([], pkgItems(21))).toContain('data-pkg-rows="21"');
  });
});

/**
 * عمود «العدد» إلى اليمين — أوّل ما تقع عليه العين في RTL، وهو المطلوب عند
 * التحميل: تعدّ الطرود ثم تقرأ نوعها. طلبه صاحب المستودع صراحةً.
 */
describe("ترتيب أعمدة جدول التغليف", () => {
  const table = formatPackaging([], pkgItems(3))!;

  it("«العدد» قبل «نوع التغليف» في الترويسة", () => {
    expect(table.indexOf("العدد")).toBeLessThan(table.indexOf("نوع التغليف"));
  });

  it("وفي صفوف البنود كذلك: الرقم أوّلاً ثم النوع", () => {
    const firstRow = table.split("<tbody>")[1].split("</tr>")[0];
    expect(firstRow.indexOf("text-align:center")).toBeLessThan(firstRow.indexOf("text-align:right"));
  });

  it("وفي صفّ المجموع: الرقم ثم «عدد القطع»", () => {
    const foot = table.split("<tfoot>")[1];
    const total = pkgItems(3).reduce((s, r) => s + r.packs_count, 0);
    expect(foot.indexOf(String(total))).toBeLessThan(foot.indexOf("عدد القطع"));
  });

  it("ويظهر الترتيب نفسه في الورقة المطبوعة", () => {
    const html = sheet(3);
    const box = html.split('data-section="packaging"')[1].split("</div>")[0]
      + html.split('data-section="packaging"')[1].slice(0, 4000);
    expect(box.indexOf("العدد")).toBeLessThan(box.indexOf("نوع التغليف"));
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
