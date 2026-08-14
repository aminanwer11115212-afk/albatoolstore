/**
 * بحثُ الشريط العلوي: العميل «يبدأ بـ»، والفاتورة برقمها.
 *
 * ## ما شكا منه صاحبُ المستودع
 * «بحث عن عميل … عايزو يكون نفس لما أجي أكتب فاتورة، لأنّو لما أكتب محمد
 * بجيب لي ناس كتير». و«عايز فوقها بحث عن فاتورة — تخليني أبحث برقم الفاتورة
 * برضو».
 *
 * ## والسببُ سؤالان مختلفان لقاعدةٍ واحدة
 * شاشةُ الفاتورة تُرشّح العملاءَ بـ`leadsWithAny` — الحقلُ **يبدأ** بالمكتوب.
 * والشريطُ كان يسأل القاعدة:
 *
 *     name.ilike.%محمد%
 *
 * فيردّ كلَّ من وقع الاسمُ في أيّ موضعٍ منه: «أحمد محمد»، «عبد المحمود»…
 * فاختلف السلوكان في الشاشة الواحدة.
 *
 * ## ولمَ لا يكفي تحويلُ السؤال إلى «يبدأ بـ»
 * التطبيعُ العربي (أ/ا، ى/ي، ة/ه) لا تعرفه القاعدة. فـ`ilike احمد%` لا تجد
 * «أحمد». فالصيدُ يُوسَّع من القاعدة ثمّ يُرشَّح **بالمطابِق نفسِه** الذي
 * تستعمله الشاشة — فيتطابق السلوكان بنيوياً لا بالمصادفة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { leadsWithAny } from "@/utils/searchMatch";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const NAVBAR = read("src/components/layout/AppNavbar.tsx");
const SCREEN = read("src/screens/InvoiceCreateScreen.tsx");

/** عملاءُ اسمُهم فيه «محمد» في مواضعَ مختلفة. */
const CUSTOMERS = [
  { name: "محمد حسب البارى عطبرة", phone: "0912000001", company: null },
  { name: "محمد احمد نقاسى", phone: "0912000002", company: null },
  { name: "أحمد محمد دنقلا", phone: "0912000003", company: null },
  { name: "ياسر بحرى الحاج يوسف", phone: "0912000004", company: null },
  { name: "الطيب محمد ودمدني", phone: "0912000005", company: null },
];

const pick = (q: string) =>
  CUSTOMERS.filter((c) => leadsWithAny([c.name, c.phone, c.company], q)).map((c) => c.name);

/* ═══════════ ١) السلوكُ المطلوب ═══════════ */

describe("«محمد» تُظهر من يبدأ اسمُه بها وحدهم", () => {
  it("اثنان لا خمسة", () => {
    expect(pick("محمد")).toEqual(["محمد حسب البارى عطبرة", "محمد احمد نقاسى"]);
  });

  /** وبالسؤال القديم — «يحتوي» — كانوا أربعة. */
  it("وبـ«يحتوي» كانوا أربعة", () => {
    const contains = CUSTOMERS.filter((c) => c.name.includes("محمد")).length;
    expect(contains).toBe(4);
    expect(pick("محمد")).toHaveLength(2);
  });

  it("والتطبيعُ العربي يعمل — «احمد» بلا همزة تجد «أحمد»", () => {
    expect(leadsWithAny(["أحمد محمد دنقلا"], "احمد")).toBe(true);
  });

  it("والبحثُ بالهاتف يبدأ به كذلك", () => {
    expect(pick("09120000")).toHaveLength(5);
    expect(pick("2000001")).toEqual([]);   // ليس بدايةَ رقمٍ لأحد
  });
});

/* ═══════════ ٢) والشاشتان على مطابِقٍ واحد ═══════════ */

describe("الشريطُ وشاشةُ الفاتورة على قاعدةٍ واحدة", () => {
  it("كلاهما يستورد leadsWithAny", () => {
    expect(NAVBAR).toMatch(/import \{[^}]*leadsWithAny[^}]*\} from "@\/utils\/searchMatch"/);
    expect(SCREEN).toMatch(/leadsWithAny/);
  });

  it("والشريطُ يُرشّح مردودَ القاعدة به — لا يكتفي بسؤالها", () => {
    expect(NAVBAR).toMatch(/leadsWithAny\(\[[^\]]*name[^\]]*\]/);
  });

  /**
   * والصيدُ أوسعُ من العرض: لو تساويا لسقط من يبدأ اسمُه بالمكتوب وجاء بعد
   * الخامس عشر في ردٍّ مرتَّبٍ بغير ذلك — فيبدو للمستخدم أنّ عميله غيرُ موجود.
   */
  it("ويطلب من القاعدة أكثرَ ممّا يعرض", () => {
    const cand = Number(/CANDIDATE_LIMIT\s*=\s*(\d+)/.exec(NAVBAR)![1]);
    const shown = Number(/RESULT_LIMIT\s*=\s*(\d+)/.exec(NAVBAR)![1]);
    expect(cand).toBeGreaterThan(shown);
  });
});

/* ═══════════ ٣) بحثُ الفاتورة ═══════════ */

describe("البحث برقم الفاتورة", () => {
  it("يسأل جدول الفواتير عن رقمها", () => {
    expect(NAVBAR).toMatch(/from\("invoices"\)[\s\S]{0,200}?ilike\("invoice_number"/);
  });

  /**
   * و«يحتوي» هنا مقصودٌ لا سهو: الرقمُ `INV-26953` وصاحبُه يكتب `26953`.
   * فلو اشتُرط «يبدأ بـ» لما وجدها أبداً.
   */
  it("و«يحتوي» مقصودةٌ للرقم — INV-26953 تُوجد بـ26953", () => {
    /* الشريطُ يقرأ `invoices` في موضعين: إشعاراتُه، وهذا البحث. فيُؤخذ موضعُ
       البحث بعلامته — سؤالُ الرقم — لا أوّلُ ما يُصادف. */
    const at = NAVBAR.indexOf('.ilike("invoice_number"');
    expect(at, "لا سؤالَ عن رقم الفاتورة").toBeGreaterThan(-1);
    const call = NAVBAR.slice(at, at + 60);
    expect(call).toContain("like");          // `%q%` لا `q%`
    expect("INV-26953".includes("26953")).toBe(true);
  });

  it("والنتيجةُ تفتح الفاتورة", () => {
    expect(NAVBAR).toMatch(/path: `\/invoices\/view\/\$\{i\.id\}`/);
  });

  /** «وعايز فوقها بحث عن فاتورة» — فالفواتيرُ فوق العملاء في القائمة. */
  it("وقسمُ الفواتير فوق قسم العملاء", () => {
    const inv = NAVBAR.indexOf('{ title: "الفواتير"');
    const cust = NAVBAR.indexOf('{ title: "العملاء"');
    expect(inv).toBeGreaterThan(-1);
    expect(inv).toBeLessThan(cust);
  });

  it("وحقلُ البحث يقول إنّه يقبل الرقم", () => {
    expect(NAVBAR).toMatch(/placeholder="بحث برقم الفاتورة/);
  });
});
