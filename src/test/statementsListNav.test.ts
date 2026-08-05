/**
 * كشوفات حسابات العملاء: ترتيبٌ وتصفية، وقفزٌ سريع بالكيبورد.
 * وكشفُ العميل بلا عمود «المتبقي».
 *
 * ## ما طلبه صاحب المستودع
 *   • «أضف ترتيب فلترة أبجدي مديونية وهكذا».
 *   • «أضف زرّ Shift+C يُظهر اختصاراً منبثقاً للتنقّل في صفحات العملاء بشكلٍ
 *     سريع وبالكيبورد، والضغط مرّةً أخرى» — يُغلقه.
 *   • «ومربّع المتبقي في كشف حساب العميل أخفِه لا يظهر».
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { netBalanceOf } from "@/utils/balanceDisplay";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const LIST = read("src/pages/CustomerStatementsPage.tsx");
const STATEMENT = read("src/pages/CustomerStatementPage.tsx");

/* ─────────── ١) الترتيب والتصفية ─────────── */

describe("الترتيب ثلاثةُ خيارات", () => {
  it("الأعلى مديونية، والأعلى رصيداً، وأبجدي", () => {
    for (const k of ['key: "debt"', 'key: "credit"', 'key: "alpha"']) {
      expect(LIST).toContain(k);
    }
  });

  it("والافتراضي هو الأعلى مديونية — لا يتغيّر المألوف", () => {
    expect(LIST).toContain('useState<SortKey>(\n    () => (searchParams.get("sort") as SortKey) || "debt",');
  });

  it("والترتيب الأبجدي عربيّ صحيح — لا مقارنةَ بايتات", () => {
    // `localeCompare` بلا لغةٍ يرتّب العربية بترتيب الترميز لا الهجاء
    expect(LIST).toContain('localeCompare(String(b.name || ""), "ar")');
  });

  it("والأعلى رصيداً يقرأ الصافي السالب — فالدائن سالب", () => {
    expect(LIST).toContain("sorted.sort((a, b) => a._net - b._net)");
  });
});

describe("والتصفية أربعُ حالات", () => {
  it("الكل وعليه وله وخالص", () => {
    for (const k of ['key: "all"', 'key: "owes"', 'key: "owed"', 'key: "settled"']) {
      expect(LIST).toContain(k);
    }
  });

  it("والخالص بهامشٍ لا بمساواةٍ تامّة — الكسور لا تُساوي صفراً", () => {
    expect(LIST).toContain('if (tone === "settled") return Math.abs(c._net) <= 0.009');
  });

  it("و«عليه» و«له» بالهامش نفسه — فلا عميلَ يسقط بين التصنيفين", () => {
    expect(LIST).toContain('if (tone === "owes") return c._net > 0.009');
    expect(LIST).toContain('if (tone === "owed") return c._net < -0.009');
  });
});

describe("والاختيار يعود كما تركتَه", () => {
  it("الترتيب والتصفية محفوظان في الرابط", () => {
    expect(LIST).toContain('next.set("sort", sortBy)');
    expect(LIST).toContain('next.set("tone", tone)');
  });

  it("والافتراضيّ لا يُكتب في الرابط — لا عنوانٌ مزدحمٌ بلا فائدة", () => {
    expect(LIST).toContain('if (sortBy !== "debt") next.set("sort", sortBy); else next.delete("sort")');
    expect(LIST).toContain('if (tone !== "all") next.set("tone", tone); else next.delete("tone")');
  });

  it("ويُقرآن منه عند الفتح", () => {
    expect(LIST).toContain('searchParams.get("sort")');
    expect(LIST).toContain('searchParams.get("tone")');
  });

  it("والصفّ النشط يعود لأوّله عند تغيّر أيٍّ منهما", () => {
    // وإلا بقي المؤشّر على رقم صفٍّ لم يعد موجوداً بعد التصفية
    expect(LIST).toContain("useEffect(() => setActiveIdx(0), [q, sortBy, tone])");
  });
});

/* ─────────── ٢) القفز السريع ─────────── */

describe("Shift+C يفتح ويغلق", () => {
  it("الاختصار مربوطٌ على النافذة", () => {
    expect(LIST).toContain('e.shiftKey && (e.key === "C" || e.key === "c")');
  });

  it("والضغطة الثانية تُغلق — تبديلٌ لا فتحٌ متكرّر", () => {
    expect(LIST).toContain("setPaletteOpen((v) => !v)");
  });

  it("ولا يختطف اختصارات النظام", () => {
    // Ctrl+Shift+C أدوات المطوّر، وCmd+Shift+C كذلك على ماك
    expect(LIST).toContain("!e.ctrlKey && !e.metaKey && !e.altKey");
  });

  it("وEscape يُغلق أيضاً", () => {
    expect(LIST).toContain('if (e.key === "Escape") setPaletteOpen(false)');
  });

  it("والمستمع يُنزَع عند مغادرة الصفحة — لا اختصارَ يبقى معلّقاً", () => {
    expect(LIST).toContain('window.removeEventListener("keydown", onKey)');
  });
});

describe("واللوحة تُدار بالكيبورد وحده", () => {
  it("أسهمٌ للتنقّل وEnter للفتح", () => {
    const pal = LIST.slice(LIST.indexOf("function CustomerJumpPalette"));
    expect(pal).toContain('e.key === "ArrowDown"');
    expect(pal).toContain('e.key === "ArrowUp"');
    expect(pal).toContain('e.key === "Enter"');
  });

  it("والتركيز يدخل حقل البحث فور الفتح", () => {
    const pal = LIST.slice(LIST.indexOf("function CustomerJumpPalette"));
    expect(pal).toContain("boxRef.current?.focus()");
  });

  it("والمؤشّر لا يخرج عن حدود القائمة", () => {
    const pal = LIST.slice(LIST.indexOf("function CustomerJumpPalette"));
    expect(pal).toContain("Math.min(i + 1, list.length - 1)");
    expect(pal).toContain("Math.max(i - 1, 0)");
  });

  it("وتقفز في المعروض حالياً — بترتيبه وتصفيته", () => {
    // لوحةٌ تقفز إلى اسمٍ رشّحه المستخدم بعيداً تُربك لا تُعين
    expect(LIST).toContain("<CustomerJumpPalette\n          rows={rows}");
  });

  it("وزرٌّ يفتحها لمن لا يعرف الاختصار", () => {
    expect(LIST).toContain('data-testid="open-palette"');
  });
});

/* ─────────── ٣) «المتبقي» مخفيّ في الكشف ─────────── */

/**
 * المتبقّي على **سطرٍ واحد** ليس رصيد العميل بل بقيّة فاتورةٍ بعينها. وقارئ
 * الكشف يقرأ آخر رقمٍ في السطر فيظنّه الرصيد — وهو ليس إيّاه.
 */
describe("كشف العميل بلا عمود «المتبقي»", () => {
  it("لا ترويسةَ له في الجدول", () => {
    expect(STATEMENT).not.toContain('font-semibold text-muted-foreground">المتبقي</th>');
  });

  it("ولا خليّةَ في الصفوف", () => {
    expect(STATEMENT).not.toContain('data-label="المتبقي"');
  });

  it("ولا في أعمدة الطباعة والمعاينة — ورقةٌ واحدة لا ورقتان", () => {
    expect(STATEMENT).not.toContain('{ key: "remaining", label: "المتبقي"');
  });

  it("والرصيد الحقيقي باقٍ حيث ينبغي أن يُقرأ", () => {
    expect(STATEMENT).toContain("BalanceChip");
  });
});

/* ─────────── ٤) الأرقام من المصدر الواحد ─────────── */

describe("الصافي من `netBalanceOf` لا من حسابٍ محلّي", () => {
  it("الصفحة تستدعيه", () => {
    expect(LIST).toContain("netBalanceOf(c)");
  });

  it("وهو يقرأ الرصيد ناقص الدائن — لا الرصيد وحده", () => {
    expect(netBalanceOf({ balance: 1000, credit_balance: 300 } as any)).toBeCloseTo(700, 2);
    expect(netBalanceOf({ balance: 0, credit_balance: 500 } as any)).toBeCloseTo(-500, 2);
  });

  it("وحقلٌ ناقص يُقرأ صفراً لا NaN", () => {
    expect(netBalanceOf({ balance: 250 } as any)).toBeCloseTo(250, 2);
    expect(netBalanceOf({} as any)).toBe(0);
  });
});
