/**
 * «الحساب القديم» في تفاصيل العميل — رقمٌ يسقط منه الرصيد.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * «بالنسبة لعرض السعر، شاشة إنشاء وتعديل عرض: بيظهر ليك الحساب القديم في
 * تفاصيل العميل غلط». وحين سُئل ما الخطأ بالضبط قال: **«الرقم نفسه خاطئ»**.
 *
 * ## وموضعُه: الاستعلامُ لا يجلب العمودَ الذي يحتاجه الحساب
 * `netBalanceOf` هو المصدرُ الواحد لصافي حساب العميل، وحسابُه:
 *
 *     net_balance  ←  إن وُجد
 *     balance − credit_balance  ←  وإلا
 *
 * وشاشةُ عرض السعر تجلب العميل بـ`select("id,name,phone,balance,company")` —
 * **بلا `credit_balance` ولا `net_balance`**. فيسقط الطرفُ الثاني من الطرح
 * صامتاً: `Number(undefined || 0)` صفرٌ لا خطأ. فيصير الصافي = المديونية
 * الخام، ويظهر «عليه 25,600» لعميلٍ شحن 25,600 وحسابُه خالص.
 *
 * ولا يُخطئ الرقمُ إلا لمن له رصيد — وهم أكثرُ من يُراجَع حسابهم.
 *
 * ## ولمَ لم تُخطئ شاشةُ الفاتورة؟
 * لأنّها لا تقرأ من الكائن المجتزأ: لها استعلامٌ ثانٍ
 * (`select("balance, credit_balance, net_balance")`) يملأ `customerBalances`،
 * ومنه تعرض. فالعطلُ في الشاشات التي تقرأ الكائنَ كما جاء: عرضُ السعر،
 * والمرتجع، ومعاينةُ المرتجع.
 *
 * ## والعلاج: الأعمدةُ تُجلب حيث يُقرأ الصافي
 * لا حارسَ في `netBalanceOf` — فالدالّة لا تملك أن تفرّق بين عميلٍ بلا رصيد
 * وعميلٍ لم يُجلب رصيدُه. الحارسُ هنا: كلُّ استعلامٍ يُغذّي عرضَ الصافي يجلب
 * الأعمدة الثلاثة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { netBalanceOf, computeDisplayBalance } from "@/utils/balanceDisplay";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/* ─────────── ١) العطل بالأرقام ─────────── */

describe("العميلُ الذي يسقط رصيدُه من الاستعلام", () => {
  /** عميلٌ عليه 25,600 وشحن 25,600 — فهو خالص. */
  const FULL = { balance: 25600, credit_balance: 25600, net_balance: 0 };

  /** وهو نفسُه كما يصل من `select("id,name,phone,balance,company")`. */
  const TRIMMED = { balance: 25600 };

  it("الصافي الصحيح صفر — «خالص»", () => {
    expect(netBalanceOf(FULL)).toBe(0);
  });

  it("وبالكائن المجتزأ يصير 25,600 — «عليه» وهو لا شيء عليه", () => {
    expect(netBalanceOf(TRIMMED)).toBe(25600);
    expect(netBalanceOf(TRIMMED)).not.toBe(netBalanceOf(FULL));
  });

  /**
   * ولا يقتصر الخطأ على الاتّجاه: عميلٌ **له** مال يظهر وكأنّ **عليه** مالاً.
   */
  it("وعميلٌ له فائضٌ يظهر مديناً — انقلابُ الجهة لا نقصُ الرقم وحده", () => {
    const full = { balance: 10000, credit_balance: 30000, net_balance: -20000 };
    expect(netBalanceOf(full)).toBeLessThan(0);          // له 20,000
    expect(netBalanceOf({ balance: 10000 })).toBeGreaterThan(0); // عليه 10,000
  });

  /**
   * و`net_balance` وحدَه يكفي حين يوجد: هو العمودُ المحسوب في القاعدة.
   * فجلبُه يعصم من فروق التقريب بين طرحِ الواجهة وطرحِ القاعدة.
   */
  it("و`net_balance` يُقدَّم على الطرح اليدوي", () => {
    expect(netBalanceOf({ balance: 100, credit_balance: 0, net_balance: 40 })).toBe(40);
  });
});

/* ─────────── ٢) والاستعلاماتُ تجلب ما يُقرأ ─────────── */

/**
 * النمطُ يُبحث عنه في المشروع كلّه لا في موضع البلاغ وحده — فالعطلُ هنا
 * ليس سهواً في سطر، بل سلسلةُ نسخٍ لاستعلامٍ ناقص.
 */
const CUSTOMER_QUERY_FILES = [
  "src/pages/QuoteCreatePage.tsx",       // موضعُ البلاغ
  "src/screens/InvoiceCreateScreen.tsx",
  "src/pages/StockReturnCreatePage.tsx",
  "src/pages/DocumentPreviewPage.tsx",
  "src/pages/QuoteViewPage.tsx",
  "src/pages/InvoiceViewPage.tsx",
  "src/pages/StockReturnViewPage.tsx",
  "src/pages/QuotesPage.tsx",
  "src/hooks/useData.ts",
  "src/lib/prefetchCoreData.ts",
  "src/components/RecentItemsSidebar.tsx",
];

/**
 * يلتقط كلَّ استعلامٍ يذكر `balance` على جدول العملاء — سواءٌ كان
 * `from("customers").select(...)` أو تضميناً `customers(...)` داخل استعلام
 * فاتورةٍ أو عرضٍ أو مرتجع. ويستثني `suppliers(...)`: جدولُ المورّدين لا
 * `credit_balance` فيه أصلاً.
 */
function customerBalanceQueries(src: string): string[] {
  const out: string[] = [];
  for (const line of src.split("\n")) {
    if (!/\.select\(/.test(line)) continue;
    if (!/\bbalance\b/.test(line)) continue;
    if (/suppliers\s*\(/.test(line)) continue;
    if (/from\(\s*["'](accounts|suppliers)["']/.test(line)) continue;
    out.push(line.trim());
  }
  return out;
}

describe("كلُّ استعلامٍ يقرأ رصيدَ عميل يجلب أعمدتَه الثلاثة", () => {
  for (const file of CUSTOMER_QUERY_FILES) {
    it(file, () => {
      const queries = customerBalanceQueries(read(file));
      expect(queries.length).toBeGreaterThan(0); // وإلا فالملفُّ تغيّر والفحصُ صار أعمى
      for (const q of queries) {
        // `credit_balance` واجبٌ في كلّ حال: سقوطُه لا يُرى — يُطرح صفرٌ بدله.
        expect(q, `ينقصه credit_balance: ${q}`).toMatch(/credit_balance/);
        // و`net_balance` واجبٌ حيث يُجلب **صفُّ العميل** كاملاً (`*` أو `name`)
        // فيُمرَّر كائناً إلى `netBalanceOf`. أمّا قراءةُ رقمين بأعيانهما
        // لحسابٍ بعينه فتجلب ما تحسب به لا غير.
        if (/\*|\bname\b/.test(q)) {
          expect(q, `صفُّ عميلٍ ينقصه net_balance: ${q}`).toMatch(/net_balance/);
        }
      }
    });
  }
});

/* ─────────── ٣) والشاشاتُ الثلاث تعرض من المصدر الواحد ─────────── */

/**
 * جلبُ العمود لا يكفي إن عُرض الرقمُ من طرحٍ يدويّ في الشاشة. فحقلُ «تفاصيل
 * العميل» في الشاشات الثلاث يمرّ بـ`netBalanceOf` لا غير.
 */
describe("حقلُ «تفاصيل العميل» يمرّ بالمصدر الواحد", () => {
  const SCREENS = [
    "src/pages/QuoteCreatePage.tsx",
    "src/pages/StockReturnCreatePage.tsx",
    "src/screens/InvoiceCreateScreen.tsx",
  ];

  for (const file of SCREENS) {
    it(file, () => {
      const src = read(file);
      const field = src.slice(src.indexOf("<label>تفاصيل العميل</label>"));
      expect(field).toContain("netBalanceOf");
      // ولا طرحٌ يدويّ للرصيد في الحقل
      expect(field.slice(0, 2500)).not.toMatch(/balance\s*-\s*.*credit_balance/);
    });
  }
});

/* ─────────── ٤) المسارُ كاملاً: استعلامُ الشاشة ← الكائن ← الوسم ─────────── */

/**
 * الفحوصُ فوق تقرأ المصدر. وهذا يقطع المسار: يأخذ **سلسلةَ الاستعلام كما هي
 * مكتوبةٌ في الشاشة**، ويحاكي ما تفعله PostgREST — لا تُعيد إلا الأعمدة
 * المذكورة — ثمّ يمرّر الناتج إلى نفس الدالّتين اللتين تعرضان الوسم.
 *
 * فلو حُذف عمودٌ من الاستعلام غداً سقط هذا الفحصُ بالوسم الخطأ نفسه الذي
 * رآه صاحب المستودع: «عليه 25,600» لعميلٍ خالص.
 */
describe("عميلٌ خالص يمرّ من استعلام شاشة عرض السعر", () => {
  /** صفُّ العميل في القاعدة. */
  const ROW = {
    id: "c1", name: "أحمد", phone: "0900", company: "",
    balance: 25600, credit_balance: 25600, net_balance: 0,
  } as Record<string, unknown>;

  /** الأعمدةُ المطلوبة في `select("…")` — كما تُقرأ من الشاشة نفسها. */
  function selectedColumns(file: string): string[] {
    const line = customerBalanceQueries(read(file)).find((q) => /\bname\b/.test(q))!;
    const list = /select\(\s*["']([^"']+)["']/.exec(line)![1];
    return list.split(",").map((c) => c.trim());
  }

  /** ما تُعيده PostgREST: الأعمدةُ المذكورة لا غير. */
  function project(row: Record<string, unknown>, cols: string[]) {
    const out: Record<string, unknown> = {};
    for (const c of cols) if (c in row) out[c] = row[c];
    return out;
  }

  for (const file of [
    "src/pages/QuoteCreatePage.tsx",
    "src/pages/StockReturnCreatePage.tsx",
    "src/screens/InvoiceCreateScreen.tsx",
  ]) {
    it(`${file} — يظهر «خالص» لا «عليه»`, () => {
      const got = project(ROW, selectedColumns(file));
      expect(netBalanceOf(got as any)).toBe(0);
      expect(computeDisplayBalance(got as any).label).toBe("خالص");
    });
  }

  /** ولو كان له فائضٌ ظهر «له» بمقداره — لا مديونيةٌ مقلوبة. */
  it("وعميلٌ له فائضٌ يظهر «له» بمقداره", () => {
    const surplus = { ...ROW, balance: 10000, credit_balance: 30000, net_balance: -20000 };
    const cols = selectedColumns("src/pages/QuoteCreatePage.tsx");
    const shown = computeDisplayBalance(project(surplus, cols) as any);
    expect(shown.label).toBe("له");
    expect(shown.amount).toBe(20000);
  });
});
