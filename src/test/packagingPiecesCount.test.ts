/**
 * «إجمالي عدد القطع» — مجموعُ الأرقام في أوّل الأسطر.
 *
 * ## القاعدة كما قرّرها صاحبُ المستودع
 * «عدد القطع على الرقم في الأول قبل كلمة كرتونة كبيرة»، و«فمثلاً كتبت 5
 * كرتونة كبيرة تظهر إجمالي القطع 5».
 *
 * فالسطرُ يُعدّ بما بدأ به مهما كان فيه، وعلامةُ ‎*‎N وصفٌ لما في الطرد لا
 * عاملُ ضربٍ في المجموع:
 *
 *     1 كرتونة صغيرة باكم فرامل *50   ⇒ 1
 *     1 كرتونة كبيرة                   ⇒ 1
 *     5 كرتونة كبيرة                   ⇒ 5
 *
 * ## وقد حُسب بالضرب مرّةً فأخطأ
 * ظُنَّ أنّ «القطع» قطعُ البضاعة داخل الطرود، فحُسب `packs × pieces_per_pack`.
 * فخرجت ورقةُ صاحب المستودع بـ**99** حيث يريد **6** — ثمّ نُقل الخطأُ إلى
 * تقرير الإرسال بحجّة توحيد الرقمين، وكان التقريرُ صحيحاً قبلها.
 *
 * ## والعلاج: الرقمُ المطبوع هو الرقمُ المجموع
 * `packagingCountOf` تُشتقّ منها **بدايةُ السطر** والمجموعُ معاً. فلا يمكن أن
 * يختلفا: من غيّر أحدَهما غيّر الآخر.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { packagingCountOf, packagingCountSum } from "@/utils/packagingCount";
import { formatPackaging } from "@/utils/printExtras";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** الرقمُ المعروض في شريط المجموع. */
const shown = (rows: any[]) => {
  const html = formatPackaging([], rows)!;
  return Number(
    /إجمالي عدد القطع :[\s\S]*?<span>([\d,]+)<\/span>/.exec(html)![1].replace(/,/g, ""),
  );
};

/** والأرقامُ المكتوبة في أوّل الأسطر، بترتيبها. */
const leadingNumbers = (rows: any[]) => {
  const html = formatPackaging([], rows)!;
  const body = html.slice(0, html.indexOf("إجمالي عدد القطع"));
  return Array.from(body.matchAll(/<div data-pkg-line[^>]*>(\d+)\s/g)).map((m) => Number(m[1]));
};

/* ═══════════ ١) القاعدة بأرقامها ═══════════ */

describe("عددُ السطر الواحد", () => {
  it("خمسُ كراتين ⇒ 5", () => {
    expect(packagingCountOf({ packs_count: 5 })).toBe(5);
  });

  /** هذا هو موضعُ الخطأ: ‎*‎N لا تدخل الحساب. */
  it("وكرتونةٌ فيها خمسون قطعة ⇒ 1 لا 50", () => {
    expect(packagingCountOf({ packs_count: 1, pieces_per_pack: 50 } as any)).toBe(1);
  });

  it("وبلا عددِ طرودٍ مسجَّل تُقرأ الكمية — بياناتٌ سبقت العمود", () => {
    expect(packagingCountOf({ packs_count: 0, quantity: 9 })).toBe(9);
  });

  it("وصفٌّ فارغٌ تماماً ⇒ صفر، لا NaN يفسد المجموع", () => {
    expect(packagingCountOf({})).toBe(0);
    expect(packagingCountOf({ packs_count: null, quantity: null })).toBe(0);
  });

  it("والمجموعُ بالقاعدة نفسها — لا جمعٌ بيدٍ أخرى", () => {
    const rows = [{ packs_count: 1 }, { packs_count: 5 }, { packs_count: 0, quantity: 2 }];
    expect(packagingCountSum(rows)).toBe(8);
    expect(packagingCountSum(rows)).toBe(rows.reduce((s, r) => s + packagingCountOf(r), 0));
  });
});

/* ═══════════ ٢) الورقةُ: المجموعُ هو ما كُتب في الأسطر ═══════════ */

/**
 * أسطرُ الورقة التي أرسلها صاحبُ المستودع مصوَّرةً — ستّةُ أسطرٍ تبدأ كلٌّ
 * منها بـ1، ومنها سطرٌ بلا ‎*‎N. ومجموعُها **6**.
 */
const PHOTO_ROWS = [
  { product_name: "باكم فرامل امامي 3 عجل هجام اصلي", packaging_types: { name: "كرتونة صغيرة" }, packs_count: 1, pieces_per_pack: 50, quantity: 50 },
  { product_name: "جي ان YAYE", packaging_types: { name: "بطارية" }, packs_count: 1, pieces_per_pack: 8, quantity: 8 },
  { product_name: "بطارية 125 سي جي / دايون صغير YAYE", packaging_types: { name: "كرتونة صغيرة" }, packs_count: 1, pieces_per_pack: 10, quantity: 10 },
  { product_name: "باكم فرامل امامي 3 عجل هجام اصلي", packaging_types: { name: "كرتونة كبيرة" }, packs_count: 1, pieces_per_pack: 20, quantity: 20 },
  { product_name: "", packaging_types: { name: "كرتونة كبيرة" }, packs_count: 1, pieces_per_pack: 0, quantity: 0 },
  { product_name: "لستك", packaging_types: { name: "ربطة" }, packs_count: 1, pieces_per_pack: 10, quantity: 10 },
];

describe("ورقةُ صاحب المستودع كما صوّرها", () => {
  it("ستّةُ أسطرٍ تبدأ بـ1 ⇒ المجموع 6", () => {
    expect(leadingNumbers(PHOTO_ROWS)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(shown(PHOTO_ROWS)).toBe(6);
  });

  /** وبالحساب القديم كان 99 — وهو ما رآه في ورقته. */
  it("وبالضرب في ‎*‎N كان 99", () => {
    const old = PHOTO_ROWS.reduce((s, r) => {
      const p = Number(r.packs_count || 0), n = Number(r.pieces_per_pack || 0);
      return s + (p > 0 && n > 0 ? p * n : p || Number(r.quantity || 0));
    }, 0);
    expect(old).toBe(99);
  });

  it("و«5 كرتونة كبيرة» وحدها ⇒ 5", () => {
    const rows = [{ product_name: "", packaging_types: { name: "كرتونة كبيرة" }, packs_count: 5 }];
    expect(leadingNumbers(rows)).toEqual([5]);
    expect(shown(rows)).toBe(5);
  });

  /**
   * والعقدُ البنيويّ: المجموعُ = مجموعُ ما كُتب في الأسطر، أيّاً كانت
   * البيانات. فلا يحتاج المستخدمُ أن يثق برقمٍ لا يستطيع عدَّه بعينه.
   */
  it("والمجموعُ دائماً = مجموعُ الأرقام المكتوبة", () => {
    for (const rows of [PHOTO_ROWS,
      [{ packs_count: 3, pieces_per_pack: 7, product_name: "أ" }, { packs_count: 12, product_name: "ب" }],
      [{ packs_count: 0, quantity: 4, product_name: "ج" }],
    ]) {
      const lead = leadingNumbers(rows as any);
      expect(shown(rows as any)).toBe(lead.reduce((s, n) => s + n, 0));
    }
  });

  /** و‎*‎N باقيةٌ في الأسطر — وصفُ الطرد لم يُحذف، إنما لا يُضرب. */
  it("و‎*‎N باقيةٌ في الأسطر وصفاً لا حساباً", () => {
    const html = formatPackaging([], PHOTO_ROWS)!;
    expect(html).toContain("*50");
    expect(html).toContain("*20");
  });
});

/* ═══════════ ٣) ولا شاشةَ تحسب العدد بنفسها ═══════════ */

/**
 * النمطُ يُبحث عنه في المشروع كلّه: العدُّ مكتوبٌ في موضعين — ورقةِ الفاتورة
 * وتقريرِ الإرسال — فيقرآن من مصدرٍ واحد.
 */
describe("مصدرٌ واحدٌ لكل شاشةٍ تعرض العدد", () => {
  /**
   * الشاشاتُ التي تعرض العدد للمستخدم.
   *
   * وثلاثتُها وُجدت بالمسح لا بالذاكرة: ورقةُ الفاتورة أوّلاً، ثمّ تقريرُ
   * الإرسال، ثمّ ورقةُ الترحيل والتغليف — وهذه الأخيرةُ كانت تجمع
   * `packs_count ?? 1` فتقرأ **صفراً** حيث تقرأ الورقةُ الكمية.
   */
  const FILES = [
    "src/utils/printExtras.ts",
    "src/utils/dispatchReportPrint.ts",
    "src/utils/transportPackagingPrint.ts",
  ];
  /** ووحدةُ الحساب نفسُها تذكر العبارة في شرحها — وهي المصدر لا شاشة. */
  const SOURCE = "src/utils/packagingCount.ts";

  it("الشاشاتُ المعروفة هي هذه — فإن ظهرت ثالثةٌ سقط الفحص", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "test") walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (/عدد القطع/.test(fs.readFileSync(full, "utf8"))) {
          found.push(path.relative(process.cwd(), full).replace(/\\/g, "/"));
        }
      }
    };
    /* شاشاتُ إدخال التغليف تذكر «× عدد القطع» عنواناً لحقلِ إدخال — لا
       مجموعاً يُعرض. ومجموعُها أُخفي بطلب صاحب المستودع ويُقرأ من الورقة. */
    const INPUT_LABELS = new Set([
      "src/pages/InvoicePackagingPage.tsx",
      "src/pages/QuotePackagingPage.tsx",
    ]);
    walk(path.resolve(process.cwd(), "src"));
    expect(found.filter((f) => !INPUT_LABELS.has(f)).sort())
      .toEqual([...FILES, SOURCE].sort());
  });

  it("وكلٌّ منها يستورد المصدرَ الواحد ولا يضرب في ‎*‎N", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, `${f} لا يستورد packagingCount`).toMatch(/from "@\/utils\/packagingCount"/);
      // ولا ضربٌ يدويّ في عدد القطع داخل الطرد
      expect(src, `${f} فيه ضربٌ في pieces_per_pack`)
        .not.toMatch(/packs\s*\*\s*pieces|pieces_per_pack\s*\)?\s*\*/);
    }
  });

  it("والتقريرُ يقول ما تقوله الورقة", () => {
    expect(packagingCountSum(PHOTO_ROWS)).toBe(shown(PHOTO_ROWS));
    expect(packagingCountSum(PHOTO_ROWS)).toBe(6);
  });
});
