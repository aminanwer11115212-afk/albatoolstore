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

  it("وEscape يُغلق اللوحة والمحرّر معاً", () => {
    expect(LIST).toContain('if (e.key === "Escape") { setPaletteOpen(false); setEditing(null); }');
  });

  it("والمستمع يُنزَع عند مغادرة الصفحة — لا اختصارَ يبقى معلّقاً", () => {
    expect(LIST).toContain('window.removeEventListener("keydown", onKeyDown)');
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

/* ─────────── ٥) الإدخال السريع لا يتخطّى الحارس ─────────── */

/**
 * أخطرُ ما في اختصارٍ يمسّ المال أن يُعيد اختراع التحقّق ثم ينساه. فالإدخال
 * السريع هنا **يجمع** الرقم والاتجاه ثم يسلّمهما لحوار الشحن مملوءَين —
 * فتبقى تحقّقاته كلّها: التحويل البنكي، ورفضُ الصفر، وقاعدةُ «الشحن يُخزَّن
 * ولا يُوزَّع».
 */
describe("الإدخال السريع يمرّ بمسار الشحن المحكَم", () => {
  it("لا يكتب في القاعدة بنفسه", () => {
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).not.toContain("supabase");
    expect(cell).not.toContain(".insert(");
    expect(cell).not.toContain(".update(");
  });

  it("بل يفتح حوار الشحن مملوءاً", () => {
    expect(LIST).toContain("<ChargeBalanceDialog");
    expect(LIST).toContain("setPrefill({ customerId: c.id, customerName: c.name, amount: signed })");
  });

  it("والاتجاه بإشارة النظام: له موجب وعليه سالب", () => {
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).toContain('dir === "owes" ? -Math.abs(value) : Math.abs(value)');
  });

  it("ولا إشارةَ مزدوجة إن كتب المستخدم سالباً بيده", () => {
    // `Math.abs` قبل الإشارة — وإلا صار «−100» في خانة «عليه» شحناً موجباً
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).toContain("Math.abs(value)");
  });

  it("والصفر لا يُمرَّر", () => {
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).toContain("Math.abs(value) > 0.009");
    expect(cell).toContain("disabled={!ready}");
  });

  it("والاختيار مؤشَّرٌ بعلامة صح كما طُلب", () => {
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).toContain('{dir === "owed" && "✓ "}له');
    expect(cell).toContain('{dir === "owes" && "✓ "}عليه');
  });

  it("ويُدار بالكيبورد: Enter يؤكّد، Escape يلغي، والأسهم تبدّل الاتجاه", () => {
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).toContain('if (e.key === "Enter") { e.preventDefault(); submit(); }');
    expect(cell).toContain('else if (e.key === "Escape")');
    expect(cell).toContain('e.key === "ArrowLeft" || e.key === "ArrowRight"');
  });

  it("والخليّة تُبلَغ بالكيبورد", () => {
    expect(LIST).toContain("tabIndex={0}");
  });

  it("ومغادرة التركيز لا تُغلق الحقل قبل الضغط على أزراره", () => {
    // بلا هذا يستحيل الضغط على «له/عليه» — يُغلق الحقل قبل وصول النقرة
    const cell = LIST.slice(LIST.indexOf("function QuickChargeCell"));
    expect(cell).toContain("parentElement?.contains(e.relatedTarget as Node)");
  });
});

/* ─────────── ٦) شحن الرصيد من الكشف نفسه ─────────── */

describe("كشف العميل فيه شحنٌ باختصار", () => {
  it("زرٌّ ظاهر", () => {
    expect(STATEMENT).toContain('data-testid="statement-charge-btn"');
  });

  it("واختصار Shift+S", () => {
    expect(STATEMENT).toContain('if (e.key !== "S" && e.key !== "s") return');
    expect(STATEMENT).toContain("setChargeOpen((v) => !v)");
  });

  it("ولا يختطف الكتابة في الحقول", () => {
    expect(STATEMENT).toContain('if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return');
  });

  it("ولا يعمل بلا عميلٍ مختار", () => {
    expect(STATEMENT).toContain("if (!selectedCustomerId) return;");
  });

  it("والحوار يُفتح مملوءاً بالعميل المعروض — لا قائمةَ مئاتٍ يُبحث فيها", () => {
    expect(STATEMENT).toContain("prefill={selectedCustomer ? { customerId: selectedCustomer.id");
  });

  it("والكشف يُنعش بعد الحفظ", () => {
    expect(STATEMENT).toContain('window.dispatchEvent(new Event("transactions:changed"))');
  });

  it("والزرّ لا يدخل الطباعة", () => {
    const btn = STATEMENT.slice(STATEMENT.indexOf('data-testid="statement-charge-btn"') - 400,
                                STATEMENT.indexOf('data-testid="statement-charge-btn"') + 400);
    expect(btn).toContain("print:hidden");
  });
});

describe("وحوار الشحن يقبل التعبئة بلا أن يفقد حارساً", () => {
  const DLG = read("src/components/dashboard/ChargeBalanceDialog.tsx");

  it("يقبل `prefill`", () => {
    expect(DLG).toContain("prefill?: ChargePrefill | null");
  });

  it("وتحقّق التحويل البنكي باقٍ", () => {
    expect(DLG).toContain("validateBankTransferPayment({");
  });

  it("ورفضُ الصفر باقٍ", () => {
    expect(DLG).toContain('if (!amt) return toast.error("أدخل مبلغاً صحيحاً")');
  });

  it("ورفضُ الحفظ بلا عميل باقٍ", () => {
    expect(DLG).toContain('if (!customerId) return toast.error("اختر العميل")');
  });

  it("والصفرُ المُمرَّر تعبئةً لا يُكتب في الحقل", () => {
    expect(DLG).toContain("Number(prefill.amount) !== 0");
  });
});


/* ─────────── ٧) خريطة المفاتيح كما طلبها صاحب المستودع ─────────── */

/**
 *   ↑ ↓             تنقّل
 *   Enter           كشف حساب الصفّ النشط
 *   Shift (وحدها)   تعديل رصيده
 *   Alt + Backspace رجوعٌ لصفحة العملاء
 */
describe("خريطة المفاتيح", () => {
  it("Enter يفتح كشف الصفّ النشط", () => {
    expect(LIST).toContain('if (e.key === "Enter" && !paletteOpen && !editing && !prefill && !inField(e.target))');
    expect(LIST).toContain("openStatement(target.id)");
  });

  it("وShift المجرّدة تفتح تعديل الرصيد", () => {
    expect(LIST).toContain("setEditing({ id: target.id, name: target.name || \"\" })");
  });

  /**
   * `shiftKey` صحيحةٌ مع كلّ حرفٍ كبير يُكتب في البحث، فربطُ التعديل بها كان
   * سيفتح المحرّر كلّما كتب المستخدم اسماً بحرفٍ كبير.
   */
  it("و«المجرّدة» تعني نقرةً مفردة لا `shiftKey`", () => {
    expect(LIST).toContain("shiftAloneRef");
    expect(LIST).toContain('if (e.key !== "Shift") shiftAloneRef.current = false');
    expect(LIST).toContain("else if (!e.repeat) shiftAloneRef.current = true");
  });

  it("وتقع عند الإفلات لا عند الضغط", () => {
    expect(LIST).toContain('const onKeyUp = (e: KeyboardEvent) => {');
    expect(LIST).toContain('window.addEventListener("keyup", onKeyUp)');
  });

  it("فلا تتعارض مع Shift+C — الحرف يُلغي النقرة المفردة", () => {
    const down = LIST.slice(LIST.indexOf("const onKeyDown"), LIST.indexOf("const onKeyUp"));
    expect(down).toContain('if (e.key !== "Shift") shiftAloneRef.current = false;');
  });

  it("ولا تفتح فوق شيءٍ مفتوح", () => {
    expect(LIST).toContain("if (!alone || paletteOpen || editing || prefill || inField(e.target)) return");
  });

  it("وفقدُ تركيز النافذة يُصفّرها — لا Shift تبقى «مضغوطة» في الذاكرة", () => {
    expect(LIST).toContain('window.addEventListener("blur", onBlur)');
  });

  it("وAlt+Backspace يرجع لصفحة العملاء", () => {
    expect(LIST).toContain('if (e.altKey && e.key === "Backspace")');
    expect(LIST).toContain('navigate("/customers")');
  });

  it("والمفاتيح معروضةٌ للمستخدم — اختصارٌ لا يُعلَم لا يُستعمَل", () => {
    expect(LIST).toContain('data-testid="keys-hint"');
  });

  it("وكلُّ المستمعين يُنزَعون عند مغادرة الصفحة", () => {
    for (const ev of ['"keydown", onKeyDown', '"keyup", onKeyUp', '"blur", onBlur']) {
      expect(LIST).toContain(`window.removeEventListener(${ev})`);
    }
  });
});
