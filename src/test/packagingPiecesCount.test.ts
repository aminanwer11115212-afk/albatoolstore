/**
 * «عدد القطع» — رقمٌ واحد في كل شاشة يذكره.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «بالنسبة للفاتورة، في التغليف: العدد بتاع التغليف غلط».
 *
 * وله وجهان، كلاهما نوعٌ واحد: **حسابٌ مكتوبٌ في أكثرَ من موضع**.
 *
 * ### الوجه الأوّل — الضربُ مرّتين في الورقة
 * كان العددُ يسقط إلى `quantity` حين يغيب `packs_count` ثمّ يُضرب في
 * `pieces_per_pack`:
 *
 *     const packs = packs_count || quantity;   // 0 || 9  ⇒ 9
 *     total = packs * pieces;                  // 9 × 3   ⇒ 27
 *
 * و`quantity` حاصلُ ضربٍ أصلاً (الشاشةُ تخزّن `packs * pieces`) — فضُرب
 * مرّةً ثانية. فقرأت الورقةُ **27** وقرأت نافذةُ التغليف **9**.
 *
 * ### الوجه الثاني — الطرودُ تُسمّى قطعاً في تقرير الإرسال
 * تقريرُ الإرسال كان يجمع `packs_count` وحدَه ويسمّيه «إجمالي عدد القطع».
 * فمستندٌ فيه كرتونتان في كلٍّ منهما عشرُ قطع يقول هناك «2» وتقول ورقةُ
 * فاتورته «20» — نفسُ البيانات ونفسُ العبارة ورقمان يختلفان عشرةَ أضعاف.
 *
 * وهي علّةُ «المدفوع» نفسُها في كشف الحساب: اسمٌ واحدٌ فوق حسابين.
 *
 * ## والعلاج: مصدرٌ واحد
 * `piecesTotalOf` في وحدةٍ بلا تبعيّات، يستوردها كلُّ من يعرض العدد.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { piecesTotalOf, piecesTotalSum } from "@/utils/piecesTotal";
import { formatPackaging } from "@/utils/printExtras";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ═══════════ ١) القاعدة بأرقامها ═══════════ */

describe("عددُ القطع في صفٍّ واحد", () => {
  it("العاملان حاضران ⇒ حاصلُ ضربهما", () => {
    expect(piecesTotalOf({ packs_count: 2, pieces_per_pack: 10 })).toBe(20);
  });

  /**
   * هذا هو العطلُ بعينه: `quantity` حاصلُ ضربٍ مخزَّن، فضربُه ثانيةً يثلّثه.
   */
  it("ولا عاملَ للطرود ⇒ المخزَّنُ كما هو، لا مضروباً", () => {
    expect(piecesTotalOf({ packs_count: 0, pieces_per_pack: 3, quantity: 9 })).toBe(9);
    // وبالحساب القديم كان 27
    expect(piecesTotalOf({ packs_count: 0, pieces_per_pack: 3, quantity: 9 })).not.toBe(27);
  });

  it("وطرودٌ بلا قطعٍ مسجَّلة ⇒ قطعةٌ في كل طرد لا صفر", () => {
    expect(piecesTotalOf({ packs_count: 4, pieces_per_pack: 0, quantity: 0 })).toBe(4);
  });

  it("وصفٌّ فارغٌ تماماً ⇒ صفر، لا NaN يفسد المجموع", () => {
    expect(piecesTotalOf({})).toBe(0);
    expect(piecesTotalOf({ packs_count: null, pieces_per_pack: undefined, quantity: null })).toBe(0);
  });

  it("والمجموعُ بالقاعدة نفسها — لا جمعٌ بيدٍ أخرى", () => {
    const rows = [
      { packs_count: 1, pieces_per_pack: 50 },   // 50
      { packs_count: 1, pieces_per_pack: 8 },    // 8
      { packs_count: 2, pieces_per_pack: 10 },   // 20
      { packs_count: 0, pieces_per_pack: 3, quantity: 9 }, // 9
    ];
    expect(piecesTotalSum(rows)).toBe(87);
    expect(piecesTotalSum(rows)).toBe(rows.reduce((s, r) => s + piecesTotalOf(r), 0));
  });
});

/* ═══════════ ٢) الورقةُ تعرض ما تحسبه القاعدة ═══════════ */

/**
 * المسارُ كاملاً: صفوفُ القاعدة ← `formatPackaging` ← الشريطُ في الورقة.
 * فلو عاد الضربُ المزدوج يوماً ظهر في الرقم المعروض لا في دالّةٍ منعزلة.
 */
describe("شريطُ الورقة يعرض المجموع نفسه", () => {
  const ROWS = [
    { product_name: "باكم فرامل امامي", packs_count: 1, pieces_per_pack: 50 },
    { product_name: "بطارية جي ان", packs_count: 1, pieces_per_pack: 8 },
    { product_name: "بطارية 125", packs_count: 2, pieces_per_pack: 10 },
  ];

  it("الرقمُ المعروض = مجموعُ القاعدة", () => {
    const html = formatPackaging([], ROWS)!;
    const shown = /إجمالي عدد القطع :[\s\S]*?<span>([\d,]+)<\/span>/.exec(html)?.[1];
    expect(shown).toBe(piecesTotalSum(ROWS).toLocaleString());
    expect(shown).toBe("78");
  });

  /** والصفُّ الذي كان يُضرب مرّتين يُعرض بقيمته المخزَّنة. */
  it("وصفُّ الضرب المزدوج يُعرض 9 لا 27", () => {
    const rows = [{ product_name: "صنف", packs_count: 0, pieces_per_pack: 3, quantity: 9 }];
    const html = formatPackaging([], rows)!;
    const shown = /إجمالي عدد القطع :[\s\S]*?<span>([\d,]+)<\/span>/.exec(html)?.[1];
    expect(shown).toBe("9");
  });

  /**
   * والمجاميعُ الأخرى لا تتحرّك بتصحيح هذا الرقم: عددُ الأسطر كما هو، وكلُّ
   * سطرٍ يبدأ بعدد طرودِه — فمن كان يعدّ الطرود يجدها في مواضعها.
   */
  it("ولا يتحرّك ما عداه — الأسطرُ وأعدادُ طرودها كما هي", () => {
    const html = formatPackaging([], ROWS)!;
    expect((html.match(/data-pkg-line/g) || []).length).toBe(ROWS.length + 1); // + شريطُ المجموع
    expect(html).toContain("*50");
    expect(html).toContain("*8");
    expect(html).toContain("2 ");
  });
});

/* ═══════════ ٣) وكلُّ شاشةٍ تذكر العبارة تقرأ من المصدر ═══════════ */

/**
 * النمطُ يُبحث عنه في المشروع كلّه لا في موضع البلاغ وحده. وقد وُجد بعد
 * الإصلاح الأوّل في **تقرير الإرسال**: يجمع `packs_count` ويسمّيه قطعاً.
 */
describe("لا شاشةَ تحسب العدد بنفسها", () => {
  /** كلُّ ملفٍّ في المصدر يذكر العبارة كما تظهر للمستخدم. */
  const FILES = ["src/utils/printExtras.ts", "src/utils/dispatchReportPrint.ts"];

  it("الشاشاتُ المعروفة هي هذه — فإن ظهرت ثالثةٌ سقط الفحص", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "test") walk(full); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        if (/إجمالي عدد القطع/.test(fs.readFileSync(full, "utf8"))) {
          found.push(path.relative(process.cwd(), full).replace(/\\/g, "/"));
        }
      }
    };
    walk(path.resolve(process.cwd(), "src"));
    expect(found.sort()).toEqual(FILES.slice().sort());
  });

  it("وكلٌّ منها يستورد المصدرَ الواحد ولا يجمع بيده", () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, `${f} لا يستورد piecesTotal`).toMatch(/from "@\/utils\/piecesTotal"/);
      // ولا جمعٌ يدويٌّ لـ`packs_count` تحت اسم القطع
      expect(src, `${f} فيه جمعٌ يدويّ للطرود`)
        .not.toMatch(/reduce\([^)]*packs_count\s*\?\?\s*1/);
    }
  });

  /**
   * وتقريرُ الإرسال يعطي الرقمَ نفسَه الذي تعطيه الورقة — وهو ما كان يختلف.
   * يُقاس بالحساب المشترك على نفس البيانات، فالفرقُ لا يعود إلا بحسابٍ ثانٍ.
   */
  it("وتقريرُ الإرسال يقول ما تقوله الورقة", () => {
    const flat = [
      { packs_count: 2, pieces_per_pack: 10, quantity: 20 },
      { packs_count: 1, pieces_per_pack: 8, quantity: 8 },
    ];
    // الورقة
    const html = formatPackaging([], flat.map((r, i) => ({ ...r, product_name: `صنف ${i}` })))!;
    const sheet = /إجمالي عدد القطع :[\s\S]*?<span>([\d,]+)<\/span>/.exec(html)![1];
    // والتقرير — نفسُ الدالّة التي صار يستوردها
    expect(piecesTotalSum(flat).toLocaleString()).toBe(sheet);
    expect(sheet).toBe("28");
    // وبالحساب القديم كان التقريرُ يقول 3 (مجموعَ الطرود)
    expect(flat.reduce((s, r) => s + r.packs_count, 0)).toBe(3);
  });
});
