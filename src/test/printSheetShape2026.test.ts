/**
 * شكلُ الورقة كما طلبه صاحبُ المستودع بثماني صور.
 *
 * كلُّ فحصٍ هنا يقابل طلباً بعينه، ونصُّ الطلب في وصفه. وهي جميعاً على
 * **ناتج القالب** لا على نيّة كاتبه: القالبُ سلسلةٌ نصّية طويلة، والقاعدةُ
 * التي تُكتب فيه ولا تصل الورقة لا تُرى إلا هنا.
 *
 * ## ولمَ فحصٌ واحدٌ لكلّ مسار
 * الورقةُ واحدةٌ في المعاينة والطباعة ورابط العميل والـPDF — قالبٌ واحد لا
 * أربعة. فمن فحص ناتجَه فحص الأربعة. وما يخصّ مساراً بعينه (تقطيعُ الصفحات،
 * التصوير) له حرّاسُه في مواضعه.
 */
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
import { formatPackaging } from "@/utils/printExtras";
import { ATOM_SELECTOR } from "@/utils/sheetPagination";
import { COMPACT_AT, DENSITY_CSS } from "@/utils/printDensity";

const COMPANY = {
  company_name: "شركة البتول لاسبيرات المواتر والتكاتك",
  phone: "0909605576",
  address: "عطبرة",
  manager_name: "مينا جابر",
  invoice_notes: "شكراً لتعاملكم مع شركة البتول",
} as any;

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    product_name: `لستك 16*350 خلفي البتول ${i + 1}`,
    quantity: 10, unit_price: 84000, tax_amount: 0, discount: 0, total: 840000,
  }));

/** صنفُ الكثافة كما كُتب على الورقة — لا كما ورد في أنماطها. */
const pageClass = (html: string) =>
  /<div class="page([^"]*)"/.exec(html)?.[1].trim() || "";

function sheet(over: Record<string, any> = {}) {
  const list = over.items || items(9);
  const total = list.reduce((s: number, r: any) => s + r.total, 0);
  return generatePrintHTML({
    type: "invoice", number: "INV-88302", date: "2026-08-01",
    customer: { name: "ابرام جرجس الحاج يوسف", phone: "0912345678", address: "بحري" },
    items: list, subtotal: total, taxTotal: 0, discountTotal: 0, grandTotal: total,
    company: COMPANY, paidAmount: 0,
    ...over,
  } as any);
}

/* ═══════════ ١) عبارةُ الشكر لا تذهب مع التواقيع ═══════════ */

/**
 * «توقيع المستلم والمسؤول ديل أنا أصلاً بخفّيهم لأنو ما بخلّيهم يظهروا
 * للزبون. يعني شكراً دا خلّيها تكون ظاهرة، ما تختفي لما أخفيهم».
 */
describe("عبارةُ الشكر قسمٌ قائمٌ بذاته", () => {
  it("تظهر في الورقة العادية", () => {
    expect(sheet()).toContain("شكراً لتعاملكم مع شركة البتول");
  });

  /** هذا هو العطلُ بعينه: إخفاءُ التواقيع كان يذهب بالشكر معها. */
  it("وتبقى بعد إخفاء التواقيع — وهو ما كان يُذهبها", () => {
    const html = sheet({ hiddenSections: ["signatures"] });
    expect(html).not.toContain("توقيع المستلم");
    expect(html).toContain("شكراً لتعاملكم مع شركة البتول");
  });

  it("ولها مفتاحُها وحدها — من أرادها ذهبت ولم تذهب بالتواقيع", () => {
    const html = sheet({ hiddenSections: ["thanks"] });
    expect(html).not.toContain("شكراً لتعاملكم مع شركة البتول");
    expect(html).toContain("توقيع المستلم");
  });

  it("ونصُّها من إعدادات الشركة لا مكتوبٌ في القالب", () => {
    expect(sheet({ company: { ...COMPANY, invoice_notes: "نشكر ثقتكم" } }))
      .toContain("نشكر ثقتكم");
  });

  it("وبلا إعدادٍ تُكتب عبارةٌ افتراضية — لا سطرٌ فارغ", () => {
    const html = sheet({ company: { company_name: "شركة" } });
    expect(html).toContain("شكراً لتعاملكم معنا");
  });

  /** وهي ذرّةٌ لا تُشطر بين صفحتين — نصفُ عبارةٍ أسوأ من لا عبارة. */
  it("ولا تُشطر بين صفحتين", () => {
    expect(ATOM_SELECTOR).toContain(".doc-thanks");
  });
});

/* ═══════════ ٢) شريطُ بيانات الشركة — سطرٌ واحد بعلامات ═══════════ */

/**
 * «تحت شركة البتول حط لي دي كدا بنفس الرصّة ونفس العلامات وفي سطر واحد،
 * لأنو انت عامل سطرين».
 */
describe("بياناتُ الشركة في سطرٍ واحد", () => {
  const html = sheet();
  const strip = html.slice(html.indexOf('class="header-meta"'), html.indexOf('class="doc-head"'));

  it("الثلاثةُ في وعاءٍ واحد لا في ثلاثة أسطر", () => {
    expect(html).toContain('class="header-meta"');
    // ولا أثرَ للسطرين القديمين
    expect(html).not.toContain('class="header-address"');
    expect(html).not.toContain('class="header-phones"');
  });

  it("وفيه الهاتفُ والمسؤولُ والعنوان بترتيبهم", () => {
    expect(strip.indexOf("0909605576")).toBeGreaterThan(-1);
    expect(strip.indexOf("مينا جابر")).toBeGreaterThan(strip.indexOf("0909605576"));
    expect(strip.indexOf("عطبرة")).toBeGreaterThan(strip.indexOf("مينا جابر"));
  });

  it("ولكلٍّ علامتُه — رسمٌ لا إيموجي يخرج مربّعاً في ملفّ العميل", () => {
    expect((strip.match(/<svg /g) || []).length).toBe(3);
    for (const emoji of ["📞", "👤", "📍"]) expect(strip).not.toContain(emoji);
  });

  /**
   * والفاصلُ بين الموجود لا حول كلّ حقل: من لم يملأ اسم المسؤول لا يجد
   * فاصلاً معلّقاً بين هاتفه وعنوانه.
   */
  it("وحقلٌ فارغ لا يترك فاصلاً معلّقاً", () => {
    const two = sheet({ company: { company_name: "شركة", phone: "0900", address: "بحري" } });
    const s = two.slice(two.indexOf('class="header-meta"'), two.indexOf('class="doc-head"'));
    expect((s.match(/header-meta-sep/g) || []).length).toBe(1);
    expect((s.match(/<svg /g) || []).length).toBe(2);
  });

  it("وبلا بياناتٍ أصلاً لا يُرسم الشريط فارغاً", () => {
    expect(sheet({ company: { company_name: "شركة" } })).not.toContain('class="header-meta"');
  });
});

/* ═══════════ ٣) شريطُ جملة الفاتورة — بقدر ما فيه ═══════════ */

/**
 * «جملة الفاتورة خليها تكون كدا أظبط وأسهل، لأنو انت عامل مستطيل طويل بحجم
 * الورقة كلها ومقسّم فاضي ساي، شكلو ما حلو».
 */
describe("شريطُ الجملة لا صفٌّ بخلايا فارغة", () => {
  const html = sheet();

  it("خرج من الجدول إلى شريطٍ مستقلّ", () => {
    expect(html).toContain('class="grand-band"');
    expect(html).not.toContain('class="total-row" data-section="grand-total"');
  });

  /** وهذا هو المأخذ: ثلاثُ خلايا فارغةٍ تمدّ الإطارَ بعرض الورقة. */
  it("ولا خليّةَ فارغةً فيه — وهي التي كانت تمدّه", () => {
    const band = html.slice(html.indexOf('class="grand-band"'));
    expect(band.slice(0, 400)).not.toContain("<td></td>");
  });

  it("وعرضُه من محتواه لا من الورقة", () => {
    const rule = /(?<![\w-.] )\.grand-band \{[^}]*\}/.exec(html)![0];
    expect(rule).toContain("width: fit-content");
    expect(rule).toMatch(/max-width:\s*\d+%/);
  });

  it("والرقمُ والوصفُ باقيان — التنسيقُ تغيّر لا المحتوى", () => {
    expect(html).toContain("جملة الفاتورة");
    expect(html).toContain((840000 * 9).toLocaleString());
  });

  it("وعرضُ السعر يقول اسمَه لا اسمَ الفاتورة", () => {
    expect(sheet({ type: "quote" })).toContain("جملة عرض السعر");
  });

  it("ولا يُشطر بين صفحتين", () => {
    expect(ATOM_SELECTOR).toContain(".grand-band");
  });
});

/* ═══════════ ٤) إجمالي عدد القطع — الرقمُ جنب اسمه ═══════════ */

/**
 * «عايز عدد القطع يكون كدا، يعني إجمالي عدد القطع وطوالي جنبو العدد، ما
 * تحطو بعيد هناك، عشان الزبون من أول نظرة يشوف العدد».
 */
describe("مجموعُ القطع ملاصقٌ لاسمه", () => {
  const pkg = formatPackaging(
    [{ product_name: "بطارية جي ان", packs_count: 1, pieces_per_pack: 8 }],
    [],
  )!;

  /** الشريطُ هو الـdiv الحاوي — وأسلوبُه مكتوبٌ قبل الوصف الذي فيه. */
  const foot = pkg.slice(pkg.lastIndexOf("<div", pkg.indexOf("إجمالي عدد القطع")));

  it("لا فراغَ يفصلهما بعرض الصندوق", () => {
    expect(foot).not.toContain("justify-content:space-between");
    expect(foot).toContain("justify-content:flex-start");
  });

  it("والشريطُ بقدر ما فيه لا بعرض الصندوق", () => {
    expect(foot).toContain("width:fit-content");
  });

  it("وبينهما نقطتان ثمّ الرقم", () => {
    expect(pkg).toContain("إجمالي عدد القطع :");
    expect(pkg).toContain("8");
  });

  /** والوحدةُ باقية: من قرأ الرقمَ وحده عرف ما يعدّ. */
  it("والوحدةُ باقيةٌ بعد الرقم", () => {
    expect(pkg).toContain("قطعة");
  });
});

/* ═══════════ ٥) علامةُ العربة مع عنوان الترحيل ═══════════ */

/** «🚚 أي عربية كدا علامة مع كلمة تفاصيل الترحيل». */
describe("عناوينُ الصناديق بعلاماتها", () => {
  const html = sheet({ transportInfo: "الاسم: شركة النقل — الوجهة: بحري" });

  it("عنوانُ النقل صار «تفاصيل الترحيل» كجاره", () => {
    expect(html).toContain("تفاصيل الترحيل");
    expect(html).not.toContain("معلومات الترحيل");
  });

  it("ومعه رسمُ عربة", () => {
    const title = html.slice(html.indexOf("extra-box-title"), html.indexOf("تفاصيل الترحيل"));
    expect(title).toContain("<svg");
    expect(title).toContain("circle");   // عجلتا العربة
  });

  it("والتغليفُ معه رسمُ صندوق", () => {
    const at = html.indexOf("تفاصيل التغليف</span>");
    expect(html.slice(Math.max(0, at - 400), at)).toContain("<svg");
  });

  /**
   * والمعرّفُ الداخلي لم يتغيّر بتغيّر العنوان: من أخفى الصندوق قبل التعديل
   * يجده مخفيّاً بعده — اختياراتُه محفوظةٌ بالمعرّف لا بالاسم المعروض.
   */
  it("والمعرّفُ transport كما كان — فاختياراتُ الإخفاء المحفوظة تعمل", () => {
    expect(html).toContain('data-section="transport"');
    expect(sheet({ hiddenSections: ["transport"] })).not.toContain("تفاصيل الترحيل");
  });
});

/* ═══════════ ٦) الخطُّ Arial في الورقة كلّها ═══════════ */

/**
 * «نوع الخط في جميع شاشات المعاينة والطباعة يكون Arial، دا كويس بوضح أكتر،
 * وعرّض الخطوط والأرقام عشان تكون واضحة للعميل».
 */
describe("الخطُّ Arial والأرقامُ مصطفّة", () => {
  const html = sheet();

  it("جسمُ الورقة بـArial", () => {
    expect(/body \{[^}]*font-family: Arial/.test(html)).toBe(true);
  });

  it("ولا أثرَ للخطّ الذي لا يوجد إلا على ويندوز", () => {
    expect(html).not.toContain("Segoe UI");
  });

  /** والأرقامُ تصطفّ على منازلها بلا خطٍّ أحادي المسافة غريبٍ عن الورقة. */
  it("والأرقامُ بمنازلَ ثابتة", () => {
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("Consolas");
  });

  it("وعمودا الكمية والسعر أثقلُ من بقيّة الخلايا", () => {
    const rule = /\.col-qty, \.col-price \{[^}]*\}/.exec(html)![0];
    expect(rule).toMatch(/font-weight:\s*[89]00/);
  });
});

/* ═══════════ ٧) صفوفٌ أقصر — وأصنافٌ أكثر في الورقة ═══════════ */

/**
 * «صغّر الأسطر عشان تشيل أصناف أكتر. شوف الـ٩ أصناف في الإكسس قدر شنو
 * وعندك انت قدر شنو».
 *
 * والقياسُ الحقيقي بالتصيير في `e2e/print-rows-per-page.spec.ts` — jsdom لا
 * يخطّط. وهنا عقدُ الأرقام: الحشوُ نزل، والحدُّ تبعه.
 */
describe("الصفوفُ أقصر والحدُّ تبعها", () => {
  const html = sheet();

  it("حشوُ الخليّة نزل عمّا كان", () => {
    const rule = /tbody td \{[^}]*\}/.exec(html)![0];
    const pad = /padding:\s*([\d.]+)px/.exec(rule)![1];
    expect(Number(pad)).toBeLessThan(7);
  });

  /**
   * والحدُّ يتبع القياس: صفوفٌ أقصر ⇒ الصفحةُ تحمل أكثر ⇒ الضغطُ يبدأ
   * متأخّراً. ولو بقي الحدُّ على 19 لضُغطت فواتيرُ تسع نفسها بلا ضغط.
   */
  it("وحدُّ الضغط تبعها فارتفع", () => {
    expect(COMPACT_AT).toBeGreaterThanOrEqual(26);
  });

  it("ففاتورةُ عشرين بنداً لم تعد تُضغط", () => {
    expect(pageClass(sheet({ items: items(20) }))).not.toContain("d-compact");
  });

  it("وما فوق الحدّ يُضغط كما كان", () => {
    expect(pageClass(sheet({ items: items(COMPACT_AT + 1) }))).toContain("d-compact");
  });

  /** ولا مقاسَ في الدرجات تحت أرضية القراءة — الحارسُ الذي لا يُخترق. */
  it("ولا مقاسَ في الدرجات تحت أرضية القراءة", () => {
    for (const m of DENSITY_CSS.matchAll(/font-size:\s*([\d.]+)px/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(10);
    }
  });
});

/* ═══════════ ٨) علاماتُ صفوف مربّع الحساب ═══════════ */

/**
 * أرسل صاحبُ المستودع صورةَ المربّع وقد أحاط بعمود العلامات: «لم تضف هذه
 * اللقو في تفاصيل العميل».
 *
 * ولكلّ صفٍّ علامتُه: ورقةٌ للقيمة، وساعةٌ للقديم، وآلةُ حسابٍ للجملة، ومالٌ
 * للمدفوع، ومحفظةٌ للرصيد. فالعينُ تجد الصفَّ بشكله قبل أن تقرأ اسمه.
 */
describe("لكلّ صفٍّ في مربّع الحساب علامتُه", () => {
  const box = (html: string) => {
    const at = html.indexOf('class="account-box"');
    return html.slice(at, html.indexOf("</table>", at));
  };

  it("خمسةُ صفوفٍ وخمسُ علامات — لا صفَّ بلا علامة", () => {
    const b = box(sheet({ previousDebt: 980000, previousCredit: 0, paidAmount: 2500000 }));
    expect((b.match(/<tr /g) || []).length).toBe(5);
    expect((b.match(/<svg /g) || []).length).toBe(5);
  });

  it("والعلاماتُ رسومٌ لا إيموجي — تخرج حبراً لا مربّعاتٍ في ملفّ العميل", () => {
    const b = box(sheet());
    for (const e of ["📄", "🕐", "🧮", "💵", "👛", "🧾"]) expect(b).not.toContain(e);
  });

  /**
   * ولكلٍّ علامتُها هي: الساعةُ للقديم لا للمدفوع. ويُتحقَّق بالترتيب — كلُّ
   * علامةٍ تسبق اسمَ صفّها مباشرةً في RTL.
   */
  it("ولكلّ صفٍّ علامتُه هو لا علامةُ جاره", () => {
    const b = box(sheet({ previousDebt: 980000, previousCredit: 0, paidAmount: 2500000 }));
    const rows = b.split("<tr ").slice(1);
    const has = (r: string, frag: string) => r.slice(0, r.indexOf("</td>")).includes(frag);
    expect(has(rows[0], "M14 2v5h5")).toBe(true);        // ورقة   ← قيمة الفاتورة
    expect(has(rows[1], 'cx="12" cy="12" r="9"')).toBe(true); // ساعة   ← الحساب القديم
    expect(has(rows[2], "M8 6h8")).toBe(true);            // آلةُ حساب ← جملة الحساب
    expect(has(rows[3], 'cx="12" cy="12" r="2.5"')).toBe(true); // مال ← المدفوع
    expect(has(rows[4], "M21 10h-4")).toBe(true);         // محفظة  ← الرصيد الحالي
    // والأسماءُ في صفوفها
    expect(rows[1]).toContain("الحساب القديم");
    expect(rows[3]).toContain("المدفوع");
    expect(rows[4]).toContain("رصيد العميل الحالي");
  });

  /** وصفُّ الخصم يظهر بعلامته حين يوجد خصم — لا صفَّ بلا علامة مهما تغيّرت. */
  it("وصفُّ الخصم بعلامته حين يوجد", () => {
    const b = box(sheet({ discountTotal: 50000, grandTotal: 7510000 }));
    expect(b).toContain("الخصم على الفاتورة");
    expect((b.match(/<svg /g) || []).length).toBe((b.match(/<tr /g) || []).length);
    // وعلامتُه علامةُ خصمٍ لا علامةُ جاره
    const disc = b.split("<tr ").find((r) => r.includes("الخصم على الفاتورة"))!;
    expect(disc.slice(0, disc.indexOf("</td>"))).toContain("M20.6 13.4");
  });

  /**
   * والعلامةُ لا تُدخل صفّاً جديداً ولا قسماً جديداً: الارتفاعُ المحجوز
   * (--acct-h) يُحسب من عدد الصفوف، وزرُّ تخصيص الرؤية يُعدّ الأقسام. فخليّةٌ
   * زائدةٌ في صفٍّ قائم لا تمسّ واحداً منهما.
   */
  it("ولا تُغيّر عددَ الصفوف ولا الارتفاعَ المحجوز", () => {
    const html = sheet({ previousDebt: 980000, previousCredit: 0, paidAmount: 2500000 });
    expect(html).toContain('data-acct-rows="5"');
    expect(html).toMatch(/--acct-h:145px/);
  });

  /** وعرضُ السعر لا مدفوعَ فيه ولا قديم — فعلاماتُه بقدر صفوفه. */
  it("وعرضُ السعر بعلاماتِ صفوفه لا أكثر", () => {
    const b = box(sheet({ type: "quote" }));
    expect((b.match(/<tr /g) || []).length).toBe((b.match(/<svg /g) || []).length);
  });
});

/* ═══════════ ٩) الطلبُ الثالث: التساوي، والشمال، والطباعة ═══════════ */

/**
 * ## الألوانُ تُطبع كما تُعرض
 *
 * «الجملة في الطباعة لا تظهر». وصوّر الورقة مطبوعةً فإذا ترويسةُ الجدول
 * البنفسجية بيضاء ومربّعُ الحساب بلا تظليل والشريطُ بلا أرضيته.
 *
 * والسببُ خارجَ الورقة: المتصفّحات تُسقط أرضياتِ الألوان عند الطباعة توفيراً
 * للحبر. والشريطُ خطُّه **أبيض** على أرضيةٍ داكنة — فتسقط الأرضيةُ ويبقى
 * أبيضُ على أبيض، أي لا شيء. وهو أسوأُ ما يقع: رقمٌ يختفي بلا أثر.
 */
describe("الألوانُ تُطبع كما تُعرض", () => {
  const html = sheet();

  it("القالبُ يُلزم المتصفّحَ برسم الأرضيات عند الطباعة", () => {
    const printBlock = /@media print \{([\s\S]*?)\n  \}/g;
    const blocks = Array.from(html.matchAll(printBlock)).map((m) => m[1]);
    const all = blocks.join("\n");
    expect(all).toMatch(/print-color-adjust:\s*exact/);
    // والبادئةُ معها — كروم وسفاري القديمان يطبع بهما أكثرُ المستخدمين
    expect(all).toMatch(/-webkit-print-color-adjust:\s*exact/);
  });

  /** وعلى كل عنصر لا على الشريط وحده: العلّةُ عامّةٌ في الورقة كلّها. */
  it("وعلى كل عنصرٍ لا على الشريط وحده", () => {
    expect(html).toMatch(/@media print \{[\s\S]*?\*\s*\{[\s\S]*?print-color-adjust:\s*exact/);
  });

  /** ولا يُترك الشريطُ بخطٍّ أبيضَ بلا ضمانِ أرضيته. */
  it("والشريطُ خطُّه أبيضُ على أرضيةٍ داكنة — فضمانُها شرطُ ظهوره", () => {
    const rule = /(?<![\w-.] )\.grand-band \{[^}]*\}/.exec(html)![0];
    expect(rule).toMatch(/background:\s*#1f2d5a/);
    expect(rule).toMatch(/color:\s*#fff/);
  });
});

/**
 * ## والجملةُ شمالَ الورقة في مربّعين
 *
 * «الجملة جيبها شمال وخليها في مربعات زي ما رسلتها ليك».
 */
describe("شريطُ الجملة شمالاً وفي مربّعين", () => {
  const html = sheet();
  const rule = /(?<![\w-.] )\.grand-band \{[^}]*\}/.exec(html)![0];

  it("الهامشُ التلقائي على اليمين — فيُدفع الشريطُ شمالاً", () => {
    // margin: أعلى يمين أسفل يسار ⇒ auto في موضع اليمين
    expect(rule).toMatch(/margin:\s*-?[\d.]+px\s+auto\s+[\d.]+px\s+0/);
  });

  it("ومربّعان: للرقم أرضيةٌ أغمق وفاصلٌ بينهما", () => {
    const val = /(?<![\w-.] )\.grand-band-value \{[^}]*\}/.exec(html)![0];
    expect(val).toMatch(/background:\s*#16224a/);
    expect(val).toMatch(/border-inline-start/);
  });

  it("والحوافُّ لا تقصّ الأرضية الداخلية", () => {
    expect(rule).toContain("overflow: hidden");
  });
});

/**
 * ## وخلايا الجدول متساوية، وتصغر جميعاً للأرقام الطويلة
 *
 * «اجعل حجم الخط — اسم الصنف والأصناف والإجمالي وحقول الترويسة كلها — بنفس
 * خط الكميات والسعر لتكون متساوية، وتصغر في حالة وجود أرقام كثيرة للسعر».
 */
/**
 * ## وترويسةُ جدول البنود بيضاء
 *
 * «الشريط الذي فيه اسم الصنف والكمية والسعر والإجمالي اجعله أبيض والكتابة
 * بالأسود».
 */
describe("ترويسةُ جدول البنود", () => {
  it("أرضيتُها بيضاء وخطُّها أسود", () => {
    const rule = /table\.items-table thead th \{([^}]*)\}/.exec(sheet())![1];
    expect(rule).toMatch(/background:\s*#fff\b/);
    expect(rule).toMatch(/color:\s*#000\b/);
  });

  /** ويفصلها عن البنود خطٌّ لا لون — فلا يسقط في طباعةٍ تُسقط الأرضيات. */
  it("ويفصلها حدٌّ سفليٌّ غليظ", () => {
    const rule = /table\.items-table thead th \{([^}]*)\}/.exec(sheet())![1];
    expect(rule).toMatch(/border-bottom-width:\s*2px/);
  });

  /**
   * والقاعدةُ العامّة `thead th` تبقى كما هي: هي مرساةُ هوية كشف الحساب،
   * يقارنها `publicStatementPrintIdentity` بأنماط صفحة الكشف العامّة. فتلوينُها
   * يُغيّر كشفَ الحساب بلا طلب.
   */
  it("ولا تُمسّ القاعدةُ العامّة — مرساةُ هوية كشف الحساب", () => {
    const html = sheet();
    const generic = /(?:^|\n)\s{2}thead th \{([^}]*)\}/.exec(html)![1];
    expect(generic).toMatch(/background:\s*#5b4cad/);
  });
});

describe("خلايا الجدول متساوية", () => {
  it("الخليّةُ والترويسةُ وعمودا الكمية والسعر بمقاسٍ واحد", () => {
    const html = sheet();
    const cell = Number(/tbody td \{[^}]*font-size:\s*([\d.]+)px/.exec(html)![1]);
    const head = Number(/thead th \{[^}]*font-size:\s*([\d.]+)px/.exec(html)![1]);
    expect(head).toBe(cell);
    // ولا مقاسَ خاصٌّ بالكمية والسعر — الفرقُ ثِقلٌ لا حجم
    expect(/\.col-qty, \.col-price \{[^}]*\}/.exec(html)![0]).not.toContain("font-size");
  });

  /** والصنفُ يُوضع من أطول رقمٍ في الفاتورة، لا من خليّةٍ بعينها. */
  it("وفاتورةُ الأرقام العادية بلا صنفِ تصغير", () => {
    expect(sheet()).toMatch(/<table class="items-table"/);
  });

  it("وأرقامُ تسع خاناتٍ تنزل درجةً", () => {
    const html = sheet({ items: [{ product_name: "صنف", quantity: 1,
      unit_price: 968125000, tax_amount: 0, discount: 0, total: 968125000 }] });
    expect(html).toMatch(/<table class="items-table num-(lg|xl)"/);
  });

  it("والتصغيرُ للجدول كلِّه — لا لعمودٍ فيُختلّ التساوي", () => {
    const html = sheet();
    for (const cls of ["num-lg", "num-xl"]) {
      const r = new RegExp(`table\\.${cls} tbody td, table\\.${cls} thead th \\{[^}]*\\}`);
      expect(r.exec(html), cls).toBeTruthy();
    }
  });
});

/**
 * ## ومجموعُ القطع = مجموعُ الأرقام في أوّل الأسطر
 *
 * «عدد القطع على الرقم في الأول قبل كلمة كرتونة كبيرة»، و«فمثلاً كتبت 5
 * كرتونة كبيرة تظهر إجمالي القطع 5».
 *
 * والصورةُ المطبوعة التي أرسلها فيها ستّةُ أسطرٍ تبدأ كلٌّ منها بـ1 —
 * فمجموعُها **6**. وكانت تُحسب بالضرب في ‎*‎N فتخرج 99.
 */
describe("مجموعُ القطع كما في الورقة المطبوعة", () => {
  const shown = (rows: any[]) => {
    const html = formatPackaging([], rows)!;
    return Number(/إجمالي عدد القطع :[\s\S]*?<span>([\d,]+)<\/span>/.exec(html)![1].replace(/,/g, ""));
  };

  it("خمسُ كراتين بلا عدد قطعٍ ⇒ 5", () => {
    expect(shown([{ product_name: "", packaging_types: { name: "كرتونة كبيرة" },
      packs_count: 5, pieces_per_pack: 0, quantity: 0 }])).toBe(5);
  });

  it("وأسطرُ الورقة المطبوعة كما هي ⇒ 6", () => {
    expect(shown([
      { product_name: "باكم فرامل", packaging_types: { name: "كرتونة صغيرة" }, packs_count: 1, pieces_per_pack: 50, quantity: 50 },
      { product_name: "جي ان", packaging_types: { name: "بطارية" }, packs_count: 1, pieces_per_pack: 8, quantity: 8 },
      { product_name: "بطارية 125", packaging_types: { name: "كرتونة صغيرة" }, packs_count: 1, pieces_per_pack: 10, quantity: 10 },
      { product_name: "باكم فرامل", packaging_types: { name: "كرتونة كبيرة" }, packs_count: 1, pieces_per_pack: 20, quantity: 20 },
      { product_name: "", packaging_types: { name: "كرتونة كبيرة" }, packs_count: 1, pieces_per_pack: 0, quantity: 0 },
      { product_name: "لستك", packaging_types: { name: "ربطة" }, packs_count: 1, pieces_per_pack: 10, quantity: 10 },
    ])).toBe(6);
  });
});
