/**
 * رسالة واتساب شحن الرصيد — بالشكل الذي طلبه صاحب المستودع:
 *
 *   👤 العميل: عميل تجريبي تبع مينا
 *
 *   💳 كان عليك: 200,000
 *   ✅ تم شحن: 100,000
 *   📌 المتبقي عليك: 100,000
 *   📅 02/08/2026
 *
 * الإشارات (`+`/`−`) لغةُ كشفٍ محاسبي يقرؤه صاحب المستودع بألوانه وأعمدته.
 * وهذه رسالةٌ تصل العميل على واتساب بلا لون ولا عمود، فحُملت الجهة في اللفظ:
 * «عليك» و«لك». والحسابُ المقفل جملةٌ تُقرأ لا صفرٌ لا يقول شيئاً.
 */
import { describe, it, expect } from "vitest";
import { buildChargeWhatsAppMessage, formatChargeDate } from "@/utils/chargeWhatsAppMessage";

const msg = (o: Partial<Parameters<typeof buildChargeWhatsAppMessage>[0]>) =>
  buildChargeWhatsAppMessage({
    customerName: "عميل تجريبي تبع مينا",
    amount: 100_000,
    netBefore: 200_000,
    date: "2026-08-02",
    ...o,
  });

describe("المثال المطلوب حرفياً", () => {
  it("سداد 100,000 وعليه 200,000", () => {
    expect(msg({})).toBe(
      [
        "👤 العميل: عميل تجريبي تبع مينا",
        "",
        "💳 كان عليك: 200,000",
        "✅ تم شحن: 100,000",
        "📌 المتبقي عليك: 100,000",
        "📅 02/08/2026",
      ].join("\n"),
    );
  });

  it("سطر فاصل بعد اسم العميل — الشكل جزءٌ من الطلب", () => {
    expect(msg({}).split("\n")[1]).toBe("");
  });

  /**
   * لفظ الشحن لا لفظ السداد.
   *
   * هذه رسالةُ **شحن رصيد** تصل العميل، فسطر المبلغ كان يقول «تم سداد»
   * — يقرؤها العميل فيظنّها إشعار سدادٍ لفاتورة. طلب صاحب المستودع تغييرها
   * وحدها وإبقاء ما عداها.
   */
  it("سطر المبلغ يقول «تم شحن» لا «تم سداد»", () => {
    const amountLine = msg({}).split("\n").find((l) => l.startsWith("✅"))!;
    expect(amountLine).toBe("✅ تم شحن: 100,000");
    expect(amountLine).not.toContain("سداد");
  });

  it("وباقي السطور على حالها — لم يُمسّ غيره", () => {
    const lines = msg({}).split("\n");
    expect(lines[0]).toBe("👤 العميل: عميل تجريبي تبع مينا");
    expect(lines[2]).toBe("💳 كان عليك: 200,000");
    expect(lines[4]).toBe("📌 المتبقي عليك: 100,000");
    expect(lines[5]).toBe("📅 02/08/2026");
  });

  it("كل سطر بإيموجيه", () => {
    const lines = msg({}).split("\n").filter(Boolean);
    // الفصل بأوّل مسافة: بعض الإيموجي حرفٌ واحد (✅) وبعضها زوجٌ بديل (👤)
    expect(lines.map((l) => l.split(" ")[0])).toEqual(["👤", "💳", "✅", "📌", "📅"]);
  });
});

describe("الجهة في اللفظ لا في الإشارة", () => {
  it("لا `+` ولا `−` في الرسالة أصلاً", () => {
    for (const netBefore of [200_000, -50_000, 0]) {
      expect(msg({ netBefore })).not.toMatch(/[+−]/);
    }
  });

  it("للعميل رصيد سابق ⇒ «كان لك رصيد»", () => {
    expect(msg({ netBefore: -50_000 })).toContain("💳 كان لك رصيد: 50,000");
  });

  it("حسابه مقفل قبل السداد ⇒ جملةٌ لا صفر", () => {
    const out = msg({ netBefore: 0 });
    expect(out).toContain("💳 كان حسابك مسدداً");
    expect(out).not.toContain("كان عليك: 0");
  });

  it("السداد يقفل الحساب تماماً ⇒ «تم السداد بالكامل»", () => {
    const out = msg({ amount: 200_000, netBefore: 200_000 });
    expect(out).toContain("📌 تم السداد بالكامل");
    expect(out).not.toContain("المتبقي عليك: 0");
  });

  it("السداد يتجاوز الدَّين ⇒ الفائض رصيدٌ له", () => {
    expect(msg({ amount: 250_000, netBefore: 200_000 })).toContain("📌 رصيدك الآن: 50,000");
  });
});

describe("الأرقام صحيحة لا مجرّد صيغة", () => {
  it("«كان» و«المتبقي» يفرّقان بمقدار المسدَّد تماماً", () => {
    const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
    for (const [amount, netBefore] of [[100_000, 200_000], [40_000, 100_000], [250_000, 200_000]]) {
      const lines = msg({ amount, netBefore }).split("\n");
      const before = netBefore;
      // السطر الأخير قبل التاريخ يحمل الرصيد بعد السداد، بلا إشارة
      const afterAbs = num(lines[4]);
      const after = lines[4].includes("رصيدك") ? -afterAbs : afterAbs;
      expect(before - after).toBe(amount);
    }
  });

  it("المبالغ الكبيرة بفواصل الآلاف", () => {
    expect(msg({ amount: 800_000, netBefore: 1_260_000 })).toContain("✅ تم شحن: 800,000");
    expect(msg({ amount: 800_000, netBefore: 1_260_000 })).toContain("📌 المتبقي عليك: 460,000");
  });

  /**
   * المبلغ السالب **خصمٌ على العميل** — منطقٌ جديد طلبه صاحب المستودع:
   * «إدخال شحن رصيد للعميل بالسالب ليكون عليه».
   *
   * وكان يُقصّ عند الصفر فتصل رسالةٌ تقول «تم شحن: 0» ورصيدٌ تغيّر بلا سبب
   * ظاهر — وهو أسوأ من ألّا تصل رسالة.
   */
  describe("المبلغ السالب: خصمٌ على العميل", () => {
    it("سطر المبلغ يقول «تم خصم» لا «تم شحن»", () => {
      const m = msg({ amount: -5_000, netBefore: 200_000 });
      expect(m).toContain("➖ تم خصم: 5,000");
      expect(m).not.toContain("تم شحن");
    });

    it("والدَّين يزيد لا ينقص: 200,000 ثم خصم 5,000 ⇒ عليه 205,000", () => {
      expect(msg({ amount: -5_000, netBefore: 200_000 })).toContain("📌 المتبقي عليك: 205,000");
    });

    it("وصاحبُ الرصيد يصير عليه إن تجاوز الخصمُ رصيده", () => {
      // له 3,000 ثم خصم 10,000 ⇒ عليه 7,000
      expect(msg({ amount: -10_000, netBefore: -3_000 })).toContain("📌 المتبقي عليك: 7,000");
    });

    it("وباقي السطور على حالها", () => {
      const lines = msg({ amount: -5_000, netBefore: 200_000 }).split("\n");
      expect(lines[0]).toBe("👤 العميل: عميل تجريبي تبع مينا");
      expect(lines[2]).toBe("💳 كان عليك: 200,000");
      expect(lines[5]).toBe("📅 02/08/2026");
    });
  });
});

describe("التاريخ", () => {
  it("يُعرض يوم/شهر/سنة", () => {
    expect(formatChargeDate("2026-08-02")).toBe("02/08/2026");
  });

  it("صيغة غير متوقّعة تُعاد كما هي بلا كسر الرسالة", () => {
    expect(formatChargeDate("")).toBe("");
    expect(formatChargeDate("لا تاريخ")).toBe("لا تاريخ");
  });
});
