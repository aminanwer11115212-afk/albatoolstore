/**
 * زرّ «تنبيه» في عروض الأسعار — رسالةٌ واحدة إلى رقم العميل المسجَّل.
 *
 * ## ما طلبه صاحب المستودع
 * «أريد زرّ تنبيه في عرض السعر وعرض السعر الجانبي يرسل واتساب بالنصّ هذا…
 * تذهب في رقم العميل على طول، المسجَّل المحدَّد في عرض السعر».
 *
 * ## ثلاثة شروطٍ في الطلب، وثلاثة أقسامٍ هنا
 *   1. **النصّ كما كُتب** — حرفاً بحرف. رسالةُ متابعةٍ صيغت بعناية: مراجعةٌ
 *      اليوم، وفكُّ حجزٍ إن أُلغي الطلب، وشكر. فأيّ إعادة صياغة تُفسد المقصود.
 *   2. **«على طول»** — ضغطةٌ واحدة تفتح واتساب على الرقم. لا حوارَ اختيار،
 *      ولا نسخَ ولصق، ولا فتحَ واتساب فارغاً ليكتب المستخدم الرقم بيده.
 *   3. **«المسجَّل المحدَّد في عرض السعر»** — رقمُ العميل المرتبط بالعرض، لا
 *      رقمٌ يُكتب في الشاشة.
 *
 * ## والحارس الرابع: النصّ في موضعٍ واحد
 * الزرّ في خمس شاشات. ونسخُ النصّ فيها يعني أن تصحيح كلمةٍ يُصحّح موضعاً
 * ويترك أربعة — وهو النمط الذي كرّر أعطال هذا المشروع. فيُفحَص أن كل شاشة
 * تنادي الدالّة ولا تكتب النصّ بيدها.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const opened: string[] = [];
const errors: string[] = [];

vi.mock("@/utils/whatsapp", async (orig) => {
  const real = await (orig() as Promise<any>);
  return {
    ...real,
    // نلتقط ما يُفتح بدل فتحه — الأصل يلمس `window.location`
    openWhatsApp: (phone: string | null, msg: string) => {
      opened.push(`${phone}|${msg}`);
    },
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    error: (m: string) => { errors.push(m); },
    success: () => {}, info: () => {}, loading: () => {}, dismiss: () => {},
  }),
}));

import { sendQuoteReminder, QUOTE_REMINDER_TEXT } from "@/utils/quoteReminder";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

beforeEach(() => { opened.length = 0; errors.length = 0; });
afterEach(() => { vi.clearAllMocks(); });

/* ─────────── ١) النصّ كما كُتب ─────────── */

describe("نصّ التنبيه حرفاً بحرف", () => {
  it("الأسطر الثلاثة بترتيبها", () => {
    expect(QUOTE_REMINDER_TEXT).toBe(
      "📋 نرجو مراجعة الفاتورة وإفادتنا اليوم.\n" +
      "\n" +
      "⏳ إذا كنت ترغب في التعديل أو عدم إكمال الطلب، نرجو إبلاغنا لفك الحجز، لأن بعض الأصناف محدودة وقد تنفد.\n" +
      "\n" +
      "🤝 شكرًا لتعاونك، وفي انتظار ردك.",
    );
  });

  it("والمعاني الثلاثة حاضرة: المراجعة، وفكّ الحجز، والشكر", () => {
    expect(QUOTE_REMINDER_TEXT).toContain("نرجو مراجعة الفاتورة وإفادتنا اليوم");
    expect(QUOTE_REMINDER_TEXT).toContain("نرجو إبلاغنا لفك الحجز");
    expect(QUOTE_REMINDER_TEXT).toContain("في انتظار ردك");
  });

  it("وسطرٌ فارغ يفصل الفِقَر — لا كتلةً واحدة تُرهق القراءة", () => {
    const blocks = QUOTE_REMINDER_TEXT.split("\n\n");
    expect(blocks).toHaveLength(3);
  });

  it("ولا اسمَ عميلٍ ولا رقمَ عرضٍ يُحقن فيه", () => {
    // رسالةُ متابعةٍ بعد عرضٍ سبق إرساله — لا تحتاج تعريفاً بنفسها
    expect(QUOTE_REMINDER_TEXT).not.toContain("${");
    expect(QUOTE_REMINDER_TEXT).not.toMatch(/عرض سعر رقم/);
  });
});

/* ─────────── ٢) على طول، إلى رقم العميل ─────────── */

describe("الرسالة تذهب لرقم العميل مباشرةً", () => {
  it("ضغطةٌ واحدة تفتح واتساب بالنصّ على الرقم", () => {
    const ok = sendQuoteReminder({ name: "أمين", phone: "0912345678" });
    expect(ok).toBe(true);
    expect(opened).toHaveLength(1);
    const [phone, msg] = opened[0].split("|");
    expect(phone).toBe("0912345678");
    expect(msg).toBe(QUOTE_REMINDER_TEXT);
  });

  it("وحقل الواتساب مُقدَّمٌ على الهاتف — قاعدة النظام", () => {
    sendQuoteReminder({ name: "أمين", phone: "0912345678", whatsapp: "0999888777" });
    expect(opened[0].split("|")[0]).toBe("0999888777");
  });

  it("ويقع على الهاتف حين يكون حقل الواتساب فارغاً", () => {
    sendQuoteReminder({ name: "أمين", phone: "0912345678", whatsapp: "" });
    expect(opened[0].split("|")[0]).toBe("0912345678");
  });

  it("وحين يكون غير صالح كذلك", () => {
    sendQuoteReminder({ name: "أمين", phone: "0912345678", whatsapp: "123" });
    expect(opened[0].split("|")[0]).toBe("0912345678");
  });
});

describe("وبلا رقمٍ صالح يُقال ذلك — لا واتساب فارغ", () => {
  it("عميلٌ بلا رقم", () => {
    expect(sendQuoteReminder({ name: "أمين" })).toBe(false);
    expect(opened).toEqual([]);
    expect(errors[0]).toContain("لا يوجد رقم واتساب صالح");
  });

  it("ورقمٌ قصيرٌ لا يصلح للإرسال", () => {
    expect(sendQuoteReminder({ name: "أمين", phone: "12" })).toBe(false);
    expect(opened).toEqual([]);
  });

  it("وعرضٌ بلا عميلٍ أصلاً لا يُسقط الشاشة", () => {
    expect(sendQuoteReminder(null)).toBe(false);
    expect(sendQuoteReminder(undefined)).toBe(false);
    expect(opened).toEqual([]);
    // فتحُ واتساب على فراغ أسوأ من رسالة خطأ: يظنّ المستخدم أنه أرسل
    expect(errors).toHaveLength(2);
  });
});

/* ─────────── ٣) الزرّ في كل شاشات العروض ─────────── */

/**
 * `SideQuoteCreatePage` غلافٌ يُصيّر `QuoteCreatePage`، فشاشة إنشاء العرض
 * الجانبي مخدومةٌ بزرّ شاشة الإنشاء نفسه — لا نسخةَ ثانية.
 */
describe("الزرّ في عرض السعر وعرض السعر الجانبي", () => {
  const SCREENS: Array<[string, string]> = [
    ["عرض السعر — إنشاء وتعديل", "src/pages/QuoteCreatePage.tsx"],
    ["عرض السعر — عرض", "src/pages/QuoteViewPage.tsx"],
    ["عرض السعر — إدارة", "src/pages/QuotesPage.tsx"],
    ["العرض الجانبي — إدارة", "src/pages/SideQuotesPage.tsx"],
    ["العرض الجانبي — عرض", "src/pages/SideQuoteDetailPage.tsx"],
  ];

  it.each(SCREENS)("%s فيها زرّ تنبيه", (_name, file) => {
    const src = read(file);
    expect(src).toContain("sendQuoteReminder");
    expect(src).toContain('data-testid="quote-reminder-btn"');
  });

  it("وشاشة العرض الجانبي تُصيّر شاشة الإنشاء — فالزرّ يخدمها بلا نسخة", () => {
    expect(read("src/pages/SideQuoteCreatePage.tsx")).toContain("<QuoteCreatePage");
  });

  it("ولا شاشةَ تكتب النصّ بيدها — مصدرٌ واحد لا خمسة", () => {
    for (const [, file] of SCREENS) {
      expect(read(file)).not.toContain("نرجو مراجعة الفاتورة");
      expect(read(file)).not.toContain("لفك الحجز");
    }
  });

  it("وكلٌّ منها يمرّر عميل العرض لا رقماً مكتوباً", () => {
    for (const [, file] of SCREENS) {
      const calls = Array.from(read(file).matchAll(/sendQuoteReminder\((.*?)\)[};]/g)).map((m) => m[1]);
      expect(calls.length, `لا نداءَ في ${file}`).toBeGreaterThan(0);
      for (const arg of calls) {
        // كائنُ العميل المرتبط بالعرض — لا سلسلةَ رقمٍ مكتوبة في الشاشة
        expect(arg, `${file}: ${arg}`).toMatch(/customers?\b/);
        expect(arg).not.toMatch(/["'`]/);
      }
    }
  });
});

/**
 * شاشة إدارة العروض الجانبية كانت تقرأ `customers(name, phone)` فقط، فيقع
 * الإرسال على `phone` دائماً ولو كان للعميل رقمُ واتساب مختلف — وهو ما يقع
 * كثيراً: هاتفُ المكتب مسجَّلٌ في `phone` وواتسابُ صاحبه في `whatsapp`.
 */
describe("الاستعلام يجلب رقم الواتساب لا الهاتف وحده", () => {
  const LISTS = [
    "src/pages/QuotesPage.tsx",
    "src/pages/SideQuotesPage.tsx",
    "src/pages/SideQuoteDetailPage.tsx",
  ];

  it.each(LISTS)("%s تطلب حقل whatsapp", (file) => {
    const src = read(file);
    const embed = /customers\(([^)]*)\)/.exec(src)?.[1] || "";
    expect(embed).toContain("whatsapp");
  });
});
