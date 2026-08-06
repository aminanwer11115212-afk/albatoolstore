/**
 * «الكمية والسعر الخط صغيرة شديد كبّره»، و«مربّع تفاصيل الحساب الخط صغير
 * كبّره»، و«اجعل مربّع تفاصيل الحساب ثابتاً حتى لو أخفيتُ أيّ شيء يكون في
 * مكانه» — ثلاثةُ مطالبَ صوّرها صاحب المستودع على ورقةٍ حقيقية.
 *
 * ## ١) الكمية والسعر
 * كانتا الخليّتين الوحيدتين بلا ثقلٍ ولا زيادة: الإجماليُّ سميك واسمُ الصنف
 * عريض، وهما رقمان رفيعان بمقاس الخلية العام (13px) — وهما أوّلُ ما يراجعه
 * العميل.
 *
 * ## ٢) مربّع الحساب
 * أصغرُ ما فيه كان **9.5px** — أي تحت `MIN_FONT_PX` نفسها التي تحرسها
 * الكثافة في بقيّة الورقة. فالمربّعُ الذي يقرأ منه العميلُ رصيدَه كان أصغرَ
 * ما في الصفحة.
 *
 * ## ٣) وثباتُ مكانه — والعطلُ كان من طرفين، أُعيد إنتاجهما بالتصيير
 *   • **يميناً بإخفاء الترحيل**: السطرُ موزَّعٌ بـspace-between، وهي بعنصرٍ
 *     واحد تُلصقه بالبداية — واليمينُ بدايةٌ في RTL. قِيس: بُعدُه عن اليسار
 *     38px، وبإخفاء «معلومات الترحيل» صار 496px — قفزةُ 458px.
 *   • **علوّاً بإخفاء صفٍّ منه**: إخفاءُ «المدفوع» أنزل ارتفاعَه من 122 إلى
 *     99، فصعد صندوقُ التغليف تحته من 1211 إلى 1187.
 *
 * والقياسُ الحيّ في `e2e/print-rows-per-page.spec.ts` — وهذا الملفّ يحرس
 * العقدَ في النصّ: القواعدُ مكتوبةٌ والأرقامُ من وحدةٍ واحدة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "@/utils/printTemplate";
import { formatPackaging, formatTransports } from "@/utils/printExtras";
import { ACCOUNT_FONT_PX, ACCOUNT_ROW_H_PX, MIN_FONT_PX, DENSITY_CSS } from "@/utils/printDensity";

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    product_name: `صنف ${i + 1}`,
    quantity: i + 1,
    unit_price: 1000,
    tax_amount: 0,
    discount: 0,
    total: (i + 1) * 1000,
  }));

const sheet = (over: Record<string, unknown> = {}) => {
  const list = items((over.n as number) ?? 8);
  const total = list.reduce((s, r) => s + r.total, 0);
  return generatePrintHTML({
    type: "invoice",
    number: "INV-1",
    date: "2026-08-06",
    customer: { name: "عميل" },
    items: list,
    subtotal: total,
    taxTotal: 0,
    discountTotal: 0,
    grandTotal: total,
    company: null,
    transportInfo: formatTransports([
      { transporters: { name: "ناقل" }, destinations: { name: "بورتسودان" } },
    ]),
    packagingInfo: formatPackaging([], [
      { packaging_types: { name: "كرتونة" }, product_name: "ص", packs_count: 1, pieces_per_pack: 2, quantity: 1 },
    ]),
    ...over,
  } as any);
};

/* ─────────── ١) الكمية والسعر أكبر وأثقل ─────────── */

describe("عمودا الكمية والسعر", () => {
  const html = sheet();

  it("لكلٍّ منهما صنفُه في الخلية — لا تنسيقٌ مكتوبٌ سطراً بسطر", () => {
    expect(html).toContain('<td class="col-qty">');
    expect(html).toContain('<td class="col-price">');
  });

  it("وقاعدتُهما في الورقة، أكبرُ من الخلية العامّة وأثقل", () => {
    const rule = /\.col-qty,\s*\.col-price\s*\{([^}]*)\}/.exec(html);
    expect(rule).toBeTruthy();
    const size = Number(/font-size:\s*([\d.]+)px/.exec(rule![1])?.[1]);
    const base = Number(/tbody td \{[^}]*font-size:\s*([\d.]+)px/.exec(html)?.[1]);
    expect(base).toBeGreaterThan(0);
    expect(size).toBeGreaterThan(base);
    expect(rule![1]).toMatch(/font-weight:\s*800/);
  });

  it("والمقاسُ يتبع الكثافة — لا يبقى كبيراً في ورقةٍ مضغوطة", () => {
    expect(DENSITY_CSS).toMatch(/\.d-compact \.col-qty,\s*\.d-compact \.col-price/);
    expect(DENSITY_CSS).toMatch(/\.d-dense \.col-qty,\s*\.d-dense \.col-price/);
  });

  it("ولا ينزل أيٌّ منهما تحت أرضية القراءة", () => {
    const sizes = Array.from(DENSITY_CSS.matchAll(/\.d-\w+ \.col-(?:qty|price)[^{]*\{[^}]*font-size:\s*([\d.]+)px/g))
      .map((m) => Number(m[1]));
    expect(sizes.length).toBe(2);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it("والكشفُ وكشفُ الجرد يأخذان الصنفين نفسيهما — قاعدةٌ واحدة للنظام", () => {
    expect(sheet({ variant: "stocktake" })).toContain('class="col-qty"');
    expect(sheet({ variant: "no-account" })).toContain('class="col-qty"');
  });
});

/* ─────────── ٢) خطُّ مربّع الحساب فوق أرضية القراءة ─────────── */

describe("خطُّ مربّع الحساب", () => {
  it("كلُّ مقاساته ≥ أرضية القراءة — وأصغرُها كان 9.5px", () => {
    const sizes = Object.values(ACCOUNT_FONT_PX);
    expect(sizes.length).toBe(4);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it("والأرقامُ من الوحدة لا من القالب — لا مقاسَ مكتوبٌ بيدٍ فيه", () => {
    const html = sheet({ previousDebt: 5000, paidAmount: 2000 });
    for (const px of Object.values(ACCOUNT_FONT_PX)) {
      expect(html).toContain(`font-size:${px}px`);
    }
    // ما كان قبل التعديل لم يعد في الورقة
    expect(html).not.toContain("font-size:9.5px");
  });

  it("والرقمُ أكبرُ من اسم الصفّ، والمجاميعُ أكبرُ منهما", () => {
    expect(ACCOUNT_FONT_PX.value).toBeGreaterThan(ACCOUNT_FONT_PX.badge);
    expect(ACCOUNT_FONT_PX.strong).toBeGreaterThan(ACCOUNT_FONT_PX.value);
  });
});

/* ─────────── ٣) ومكانُه لا يتحرّك ─────────── */

describe("مربّعُ الحساب ثابتٌ في مكانه", () => {
  const html = sheet({ previousDebt: 5000, paidAmount: 2000 });

  it("مشدودٌ إلى طرف السطر بهامشٍ تلقائي — لا بتوزيع الإخوة", () => {
    // بإخفاء الترحيل يبقى عنصرٌ واحد، وspace-between تُلصقه بالبداية (اليمين
    // في RTL). فالهامشُ التلقائي هو ما يُبقيه يساراً بصاحبٍ أو بلا صاحب.
    expect(html).toMatch(/\.account-box\s*\{[^}]*margin-inline-start:\s*auto/);
  });

  it("وارتفاعُه محجوزٌ فلا يصعد ما تحته بإخفاء صفّ", () => {
    expect(html).toMatch(/\.account-box\s*\{[^}]*min-height:\s*var\(--acct-h/);
  });

  it("والحجزُ من عدد صفوفه المرسومة لا رقماً ثابتاً", () => {
    // خمسةُ صفوف: قيمة الفاتورة، الحساب القديم، جملة الحساب، المدفوع، الرصيد
    expect(html).toContain('data-acct-rows="5"');
    expect(html).toContain(`--acct-h:${5 * ACCOUNT_ROW_H_PX}px`);
  });

  it("ويتقلّص الحجزُ بتقلّص المستند — عرضُ السعر أقصر", () => {
    const q = sheet({ type: "quote" });
    const rows = Number(/data-acct-rows="(\d+)"/.exec(q)?.[1]);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThan(5);
    expect(q).toContain(`--acct-h:${rows * ACCOUNT_ROW_H_PX}px`);
  });

  /**
   * الحجزُ عددُ صفوفٍ × ارتفاعِ صفّ، وصحّتُه مشروطةٌ بأن يبقى الصفُّ سطراً.
   * وبعرضٍ ثابتٍ 260px التفّ الرقمُ عند **تسعة أرقام** — مئاتِ الملايين، وهي
   * في متناول هذا المستند: قِيس 968,125,000 فرفع الصندوق 125 ← 134 فتجاوز
   * حجزَه وعاد يتحرّك. فالصندوقُ يتّسع بالرقم بدل أن يلتفّ به.
   */
  it("ولا يلتفّ رقمٌ مهما كبر — وإلا سقط الحجز", () => {
    expect(html).toMatch(/\.account-box td\s*\{[^}]*white-space:\s*nowrap/);
  });

  it("والصندوقُ يتّسع بالرقم فوق أرضيةِ عرضه", () => {
    const rule = /\.account-box\s*\{([^}]*)\}/.exec(html)![1];
    expect(rule).toMatch(/width:\s*auto/);
    expect(rule).toMatch(/min-width:\s*260px/);
    // وسقفٌ يمنعه من ابتلاع نصف الورقة وطردِ جاره
    expect(rule).toMatch(/max-width:\s*4\d%/);
  });

  it("ولا صفَّ ضاع بإعادة البناء — المحتوى كما كان", () => {
    for (const label of ["قيمة الفاتورة", "الحساب القديم", "جملة الحساب", "المدفوع", "رصيد العميل الحالي"]) {
      expect(html).toContain(label);
    }
  });

  it("والخصمُ يظهر حين يوجد ويُحجز له مكانُه", () => {
    const d = sheet({ previousDebt: 5000, paidAmount: 2000, discountTotal: 300 });
    expect(d).toContain("الخصم على الفاتورة");
    expect(d).toContain('data-acct-rows="6"');
    expect(d).toContain(`--acct-h:${6 * ACCOUNT_ROW_H_PX}px`);
  });
});

/* ─────────── ٤) ولا يُشطر بين صفحتين ─────────── */

/**
 * صوّرته الورقةُ الناتجة: الصفحةُ الأولى بأربعةٍ من صفوفه، و«رصيد العميل
 * الحالي» وحده في الثانية — وهو الرقمُ الذي جاء العميل لأجله.
 *
 * وسببُه أنّ المربّع **جدول**: كلُّ صفٍّ فيه حدُّ قطعٍ مستحسن في مسار الـPDF،
 * والقاعدةُ العامّة في القالب تسمح بقسمة الجداول. فيُمنع في المسارين معاً.
 */
describe("مربّعُ الحساب لا يُشطر بين صفحتين", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

  it("في الطباعة: قاعدةٌ أخصُّ من العامّة تمنع قسمته", () => {
    const html = sheet({ previousDebt: 5000, paidAmount: 2000 });
    expect(html).toMatch(/\.account-box,\s*\.account-box tbody,\s*\.account-box tr\s*\{[^}]*break-inside:\s*avoid/);
  });

  it("وفي الـPDF: رأسُه حدُّ قطعٍ، وما بين صفوفه ليس كذلك", () => {
    const src = read("src/utils/shareDocumentPdf.ts");
    expect(src).toMatch(/const UNSPLITTABLE = "[^"]*\.account-box/);
    expect(src).toMatch(/const ATOMIC = "\.account-box"/);
    // وحدودُ ما بداخله تُسقط فعلاً لا بالنيّة
    expect(src).toContain("querySelectorAll<HTMLElement>(ATOMIC)");
    expect(src).toMatch(/out\.splice\(i, 1\)/);
  });
});
