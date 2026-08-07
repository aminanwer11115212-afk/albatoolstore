/**
 * الورقة الكبيرة: كثافةٌ تلقائية، وترحيلٌ صغير، وملاءمةٌ لشاشة الهاتف.
 *
 * ## ما طلبه صاحب المستودع
 *   1. «في رابط المعاينة والعميل في الهاتف أن تظهر الفاتورة بهذا الشكل وأنا
 *      أكبّر لأرى» — الورقة كاملةً في عرض الشاشة، والتكبير بالأصابع.
 *   2. «عند إضافة فاتورة كبيرة وطباعتها PDF أنت تجد الحلّ… وإذا كثرت المنتجات
 *      وبنود التغليف تجد لها حلّاً تلقائياً في طريقة العرض، مع شروطٍ وحمايةٍ
 *      وحرّاس».
 *   3. «اجعل تفاصيل الترحيل بسيطة ومربّعها صغير».
 *
 * ## والحرّاس هنا ليست زينة
 * أخطرُ ما في «حلٍّ تلقائي» أن يحلّ محلّ المستخدم فيحذف ما لم يطلب حذفه. فأكثرُ
 * هذا الملفّ يفحص ما **لا** تفعله الكثافة: لا بنداً تُسقط، ولا مبلغاً تغيّر،
 * ولا خطّاً تُنزله تحت أرضية القراءة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { printDensity, densityClass, COMPACT_AT, DENSE_AT, MIN_FONT_PX, DENSITY_CSS, ROWS_PER_PAGE_TARGET } from "@/utils/printDensity";
import { formatPackaging, formatTransports } from "@/utils/printExtras";
import { generatePrintHTML } from "@/utils/printTemplate";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    product_name: `صنف رقم ${i + 1}`,
    quantity: i + 1,
    unit_price: 1000,
    tax_amount: 0,
    discount: 0,
    total: (i + 1) * 1000,
  }));

const pkgItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    packaging_types: { name: i % 2 ? "كرتونة" : "كيس" },
    product_name: `صنف ${i + 1}`,
    packs_count: (i % 4) + 1,
    pieces_per_pack: 1,
    quantity: 1,
  }));

const transportInfo = formatTransports([
  { transporters: { name: "شركة النقل", phone: "0912", address: "السوق العربي" }, destinations: { name: "بورتسودان" } },
])!;

const sheet = (itemCount: number, pkgCount = 0) => {
  const list = items(itemCount);
  return generatePrintHTML({
    type: "invoice", number: "INV-1", date: "2026-08-04",
    customer: { name: "عميل" },
    items: list,
    subtotal: list.reduce((s, r) => s + r.total, 0),
    taxTotal: 0, discountTotal: 0,
    grandTotal: list.reduce((s, r) => s + r.total, 0),
    company: null,
    packagingInfo: pkgCount ? formatPackaging([], pkgItems(pkgCount)) : undefined,
    transportInfo,
  } as any);
};

/* ─────────── ١) الدرجة تُختار من الحجم ─────────── */

describe("الكثافة تُقاس بالأسطر لا بالصفحات", () => {
  it("فاتورةٌ صغيرة تبقى على شكلها المألوف", () => {
    expect(printDensity(10)).toBe("normal");
    expect(densityClass("normal")).toBe("");
  });

  it("وفوق الحدّ الأوّل تضغط نفسها", () => {
    expect(printDensity(COMPACT_AT)).toBe("normal");
    expect(printDensity(COMPACT_AT + 1)).toBe("compact");
  });

  it("وفوق الثاني تضغط ترويستها أيضاً", () => {
    expect(printDensity(DENSE_AT)).toBe("compact");
    expect(printDensity(DENSE_AT + 1)).toBe("dense");
  });

  it("والبنود والتغليف يتقاسمان الورقة فيُجمعان", () => {
    // بنودٌ تحت الحدّ وحدها عادية، ومعها مثلُها تغليفاً تصير الورقة مزدحمة.
    // والحدُّ يُقرأ من الوحدة لا يُكتب رقماً: قياسُه بالتصيير يحرّكه.
    const under = COMPACT_AT - 1;
    expect(printDensity(under)).toBe("normal");
    expect(printDensity(under, under)).toBe("compact");
    expect(printDensity(DENSE_AT, DENSE_AT)).toBe("dense");
  });

  it("والمدخل الفاسد يُقرأ صفراً — لا فاتورةَ صغيرةٌ تنقلب كثيفة", () => {
    expect(printDensity(undefined)).toBe("normal");
    expect(printDensity(-100)).toBe("normal");
    expect(printDensity(NaN, "abc")).toBe("normal");
    expect(printDensity(5, null)).toBe("normal");
  });
});

/* ─────────── ٢) الحرّاس: ما لا تفعله الكثافة ─────────── */

describe("الكثافة تصغّر ولا تحذف", () => {
  const big = sheet(100, 40);

  it("مئةُ بندٍ كلّها في الورقة بأسمائها", () => {
    for (const i of [1, 2, 50, 99, 100]) {
      expect(big).toContain(`صنف رقم ${i}`);
    }
  });

  it("والإجمالي واحدٌ في الدرجات الثلاث — الكثافة مقاسٌ لا محتوى", () => {
    const totalOf = (html: string) => /lov-doc-total" content="([^"]+)"/.exec(html)?.[1];
    const five = items(5).reduce((s, r) => s + r.total, 0);
    const same = (n: number) =>
      generatePrintHTML({
        type: "invoice", number: "INV-1", date: "2026-08-04", customer: { name: "ع" },
        items: items(5), subtotal: five, taxTotal: 0, discountTotal: 0, grandTotal: five,
        company: null,
        packagingInfo: n ? formatPackaging([], pkgItems(n)) : undefined,
      } as any);
    // نفس البنود ونفس الإجمالي، والتغليف وحده هو ما يرفع الدرجة
    expect(totalOf(same(0))).toBe(totalOf(same(30)));
    expect(totalOf(same(0))).toBe(totalOf(same(80)));
  });

  it("وأقسام الورقة كلّها باقية مهما كثفت", () => {
    for (const marker of ["تفاصيل التغليف", "تفاصيل الترحيل", "توقيع المستلم"]) {
      expect(big).toContain(marker);
    }
  });

  it("ولا مقاسَ خطٍّ ينزل تحت أرضية القراءة", () => {
    const sizes = Array.from(DENSITY_CSS.matchAll(/font-size:\s*([\d.]+)px/g)).map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it("والأرضية مكتوبةٌ رقماً واحداً يُقرأ — لا حدسَ في القالب", () => {
    expect(MIN_FONT_PX).toBe(10);
    // الحدود في وحدةٍ واحدة: القالب يستوردها ولا يكتب أرقاماً من عنده
    expect(read("src/utils/printTemplate.ts")).toContain('from "@/utils/printDensity"');
  });
});

describe("الصنف يصل الورقة فعلاً", () => {
  it("الصغيرة بلا صنفِ كثافة — لا يتغيّر المألوف", () => {
    expect(sheet(5)).toContain('<div class="page ">');
  });

  it("والمتوسطة بـd-compact", () => {
    expect(sheet(30)).toContain('class="page d-compact"');
  });

  it("والكبيرة بـd-dense", () => {
    expect(sheet(80)).toContain('class="page d-dense"');
  });

  it("والقواعد نفسها محقونةٌ في الورقة", () => {
    const html = sheet(80);
    expect(html).toContain(".d-dense tbody td");
    expect(html).toContain(".d-compact tbody td");
  });
});

/* ─────────── ٣) صندوق الترحيل صغير وبسيط ─────────── */

describe("تفاصيل الترحيل بسيطة ومربّعها صغير", () => {
  it("سطران: ما يهمّ العميل أوّلاً ثم تفاصيل الاستلام", () => {
    expect(transportInfo).toContain('<span class="tr-main">');
    expect(transportInfo).toContain('<span class="tr-sub">');
    expect(transportInfo.indexOf("tr-main")).toBeLessThan(transportInfo.indexOf("tr-sub"));
  });

  it("والاسم والوجهة في الأعلى، والهاتف والعنوان تحتهما", () => {
    const [main, sub] = transportInfo.split("<br>");
    expect(main).toContain("الاسم: شركة النقل");
    expect(main).toContain("الوجهة: بورتسودان");
    expect(sub).toContain("الهاتف: 0912");
    expect(sub).toContain("العنوان: السوق العربي");
  });

  it("ولا معلومةَ حُذفت — التبسيط ترتيبٌ لا نقصان", () => {
    for (const v of ["شركة النقل", "0912", "السوق العربي", "بورتسودان"]) {
      expect(transportInfo).toContain(v);
    }
  });

  it("ولا عنصرَ كتلةٍ داخل الفقرة يكسر الترتيب", () => {
    // القالب يُدرج المحتوى داخل <p>، و<div> داخلها يخرج منها في المتصفّح
    expect(transportInfo).not.toContain("<div");
  });

  /**
   * الترحيلُ يتقاسم سطرَه مع الحساب، فلا يتمدّد بعرض الورقة: نصفُ السطر حدُّه
   * الأعلى، ويبقى إلى جانبه الحسابُ بقدره لا مضغوطاً.
   */
  it("والصندوق يأخذ قدره لا نصف الورقة", () => {
    const html = sheet(5, 3);
    expect(html).toContain("extra-box--transport");
    expect(html).toMatch(/\.extra-row--head \.extra-box--transport\s*\{[^}]*max-width:\s*50%/);
  });

  it("ولا يتمدّد ولو كثر التغليف — التغليفُ في سطرٍ آخر أصلاً", () => {
    const html = sheet(5, 30);
    expect(html).toContain('class="extra-row extra-row--head"');
    expect(html).toContain('class="extra-row extra-row--pkg"');
    // الترحيل في صفّ الرأس لا في صفّ التغليف. والقياس بالسمة كاملةً: اسم
    // الصنف مكتوبٌ في قواعد `<style>` أعلى الورقة أيضاً.
    expect(html.indexOf('data-section="transport"'))
      .toBeLessThan(html.indexOf('class="extra-row extra-row--pkg"'));
  });
});

/* ─────────── ٤) الهاتف يرى الورقة كاملة ─────────── */

/**
 * الورقة تعلن أنها تقبل التصغير، والمضيف يقيس ويقرّر كم — وتفصيلُ ذلك
 * وحسابُ النسبة في `documentFrameFit.test.ts`.
 */
describe("الورقة تقبل نسبة الملاءمة", () => {
  const html = sheet(5);

  it("موسومةٌ ليعرفها المضيف", () => {
    expect(html).toContain('data-lov-sheet="1"');
  });

  it("وتصغُر بالمتغيّر الذي يكتبه", () => {
    expect(html).toMatch(/zoom:\s*var\(--lov-fit,\s*1\)/);
  });

  it("وبلا مضيفٍ تبقى بمقاسها — القيمة الافتراضية 1", () => {
    // تدهورٌ لطيف: ورقةٌ بمقاسها الحقيقي، لا صفحةٌ بيضاء
    expect(html).toMatch(/var\(--lov-fit,\s*1\)/);
  });

  it("وفي تبويبٍ مستقلّ يتكفّل بها وسم viewport", () => {
    expect(html).toContain('<meta name="viewport" content="width=794">');
  });
});

describe("الـPDF يخرج بمقاس الورقة لا بمقاس الهاتف", () => {
  it("معاينة النظام تُصفّر التصغير على النسخة", () => {
    const tpl = read("src/utils/printTemplate.ts");
    const fn = tpl.slice(tpl.indexOf("function contentEl()"), tpl.indexOf("function genPdfBlob()"));
    expect(fn).toContain("pg.style.zoom = '1'");
  });

  it("ورابط العميل كذلك", () => {
    const share = read("src/pages/StandaloneShareDocument.tsx");
    const fn = share.slice(share.indexOf("handleDownloadPdf"), share.indexOf("html2pdf()"));
    expect(fn).toContain('page.style.zoom = "1"');
  });
});

/**
 * ## «الخطّ صغار ما بتشاف» و«عايز ٣٠ صنف في الورقة»
 *
 * المطلبان يتعارضان ما دامت المساحةُ تُؤخذ من الخطّ. فأُخذت من الترويسة كما
 * طلب: «ارفع العنوان دا فوق شوية، وتفاصيل العميل والتاريخ ارفعهم برضو».
 *
 * وقيس بالتصيير الحقيقي بعد التعديل:
 *
 * | البنود | الدرجة   | الخطّ  | رأسُ الصفحة | يسع الصفحة الأولى |
 * |--------|----------|--------|-------------|--------------------|
 * | 30     | compact  | 12.5px | 258px       | **30**             |
 * | 45     | compact  | 12.5px | 258px       | 30                 |
 * | 80     | dense    | 11.5px | 235px       | 35                 |
 *
 * وكان قبله: خطُّ 11.5px ورأسٌ 286px ويسع **29** فقط.
 */
describe("الخطّ أكبر والورقة تحمل ثلاثين", () => {
  const px = (re: RegExp) => Number(re.exec(DENSITY_CSS)?.[1]);

  it("الهدفُ ثلاثون بنداً في الصفحة", () => {
    expect(ROWS_PER_PAGE_TARGET).toBe(30);
  });

  it("وخطُّ البنود في `compact` أكبر ممّا كان (11.5px)", () => {
    const f = px(/\.d-compact tbody td \{[^}]*font-size:\s*([\d.]+)px/);
    expect(f).toBeGreaterThan(11.5);
  });

  it("وفي `dense` كذلك (10.5px)", () => {
    const f = px(/\.d-dense tbody td \{[^}]*font-size:\s*([\d.]+)px/);
    expect(f).toBeGreaterThan(10.5);
  });

  /** المساحةُ تُؤخذ من الترويسة — وهذه هي القواعد التي ترفعها. */
  it("والترويسةُ ترتفع في الدرجتين: الشعار والعنوان وسطرُ البيانات", () => {
    for (const d of ["d-compact", "d-dense"]) {
      expect(DENSITY_CSS, `${d} .header`).toMatch(new RegExp(`\\.${d} \\.header \\{[^}]*padding-bottom`));
      expect(DENSITY_CSS, `${d} .doc-head`).toMatch(new RegExp(`\\.${d} \\.doc-head \\{[^}]*margin`));
      expect(DENSITY_CSS, `${d} .doc-title h1`).toMatch(new RegExp(`\\.${d} \\.doc-title h1 \\{[^}]*font-size`));
      expect(DENSITY_CSS, `${d} .info-line`).toMatch(new RegExp(`\\.${d} \\.info-line \\{[^}]*font-size`));
      expect(DENSITY_CSS, `${d} logo`).toMatch(new RegExp(`\\.${d} \\.header-logo img \\{[^}]*height`));
    }
  });

  /** ولا يُخترق حدُّ القراءة مهما ضُغطت الورقة. */
  it("وكلُّ المقاسات ما زالت فوق أرضية القراءة", () => {
    const sizes = Array.from(DENSITY_CSS.matchAll(/font-size:\s*([\d.]+)px/g)).map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });
});
