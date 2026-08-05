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
import { printDensity, densityClass, COMPACT_AT, DENSE_AT, MIN_FONT_PX, DENSITY_CSS } from "@/utils/printDensity";
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
    // عشرون بنداً وحدها عادية، ومعها عشرون تغليفاً تصير الورقة مزدحمة
    expect(printDensity(20)).toBe("normal");
    expect(printDensity(20, 20)).toBe("compact");
    expect(printDensity(40, 40)).toBe("dense");
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
    for (const marker of ["تفاصيل التغليف", "معلومات الترحيل", "توقيع المستلم"]) {
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

  it("والصندوق يأخذ قدره لا نصف الورقة", () => {
    const html = sheet(5, 3);
    expect(html).toContain("extra-box--transport");
    expect(html).toMatch(/\.extra-box--transport\s*\{[^}]*flex:\s*0 1 32%/);
  });

  it("وحين ينزل تحت تغليفٍ طويل لا يتمدّد بعرض الورقة", () => {
    const html = sheet(5, 30);
    expect(html).toContain('class="extra-row extra-row--transport"');
    expect(html).toMatch(/\.extra-row--transport \.extra-box--transport\s*\{[^}]*max-width:\s*62%/);
  });
});

/* ─────────── ٤) الهاتف يرى الورقة كاملة ─────────── */

describe("ملاءمة الورقة لعرض الهاتف", () => {
  const html = sheet(5);

  it("الورقة تقبل نسبةَ ملاءمة", () => {
    expect(html).toMatch(/zoom:\s*var\(--lov-fit,\s*1\)/);
  });

  it("والنسبة تُحسب من عرض الإطار لا تُفترض", () => {
    expect(html).toContain("var SHEET_PX = 794");
    expect(html).toContain("clientWidth");
    expect(html).toContain("--lov-fit");
  });

  it("ولا تُكبَّر الورقة فوق مقاسها أبداً", () => {
    // الشاشة الأعرض من الورقة تُبقيها بمقاسها — التكبير للقارئ لا للصفحة
    expect(html).toContain("r >= 1");
  });

  it("ولا تُصغَّر إلى ما لا يُرى", () => {
    expect(html).toContain("Math.max(r, 0.2)");
  });

  it("وتُعاد الحسبة عند تدوير الهاتف", () => {
    expect(html).toContain("orientationchange");
  });

  it("وبلا سكربتٍ تبقى الورقة بمقاسها — تدهورٌ لطيف لا صفحةٌ بيضاء", () => {
    // القيمة الافتراضية في `var()` هي 1، فغيابُ السكربت لا يُخفي شيئاً
    expect(html).toMatch(/var\(--lov-fit,\s*1\)/);
    expect(html).toContain("catch (e)");
  });

  it("والتصغير في وسيط الشاشة وحده — الطباعة لا تراه", () => {
    const screenBlock = html.slice(html.indexOf("@media screen"), html.indexOf("/* === HEADER === */"));
    expect(screenBlock).toContain("zoom: var(--lov-fit, 1)");
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
