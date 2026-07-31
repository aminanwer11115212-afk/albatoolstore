/**
 * رسالة واتساب شحن الرصيد — الصيغة ثابتة في كل الحالات.
 *
 * الثبات مقصود: العميل يقرأ نفس خمسة السطور بنفس الترتيب في كل مرة، فلا
 * يحتاج إلى تفسير رسالة مختلفة الشكل عند كل شحنة. الاختبارات تحرس الصيغة
 * نفسها كما تحرس الأرقام.
 */
import { describe, it, expect } from "vitest";
import {
  buildChargeWhatsAppMessage,
  chargeApplied,
  formatChargeDate,
} from "@/utils/chargeWhatsAppMessage";
import { signedAmountText } from "@/utils/buildCustomerAccountView";

const msg = (o: Partial<Parameters<typeof buildChargeWhatsAppMessage>[0]>) =>
  buildChargeWhatsAppMessage({
    customerName: "أمين اسماعيل",
    amount: 500,
    netBefore: 300,
    date: "2026-07-31",
    ...o,
  });

describe("المثال المطلوب: شحن 500 وعليه 300", () => {
  it("تُظهر الشحن والخصم والمتبقي بالترتيب", () => {
    expect(msg({})).toBe(
      [
        "مرحبا أمين اسماعيل",
        "تم شحن +500",
        "تم خصم 300",
        "المتبقي +200",
        "التاريخ 31/07/2026",
      ].join("\n"),
    );
  });
});

describe("الصيغة ثابتة مهما اختلفت الحالة", () => {
  const cases: Array<[string, number, number]> = [
    ["لا دَين على العميل", 500, 0],
    ["الشحن أقل من الدَّين", 400, 1000],
    ["الشحن يساوي الدَّين تماماً", 300, 300],
    ["العميل له رصيد سابق", 500, -200],
  ];

  it.each(cases)("%s — خمسة سطور بنفس الترتيب", (_label, amount, netBefore) => {
    const lines = msg({ amount, netBefore }).split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0].startsWith("مرحبا ")).toBe(true);
    expect(lines[1].startsWith("تم شحن +")).toBe(true);
    expect(lines[2].startsWith("تم خصم ")).toBe(true);
    expect(lines[3]).toMatch(/^المتبقي (?:[+−][\d,]+|0)$/);
    expect(lines[4].startsWith("التاريخ ")).toBe(true);
  });

  it("بلا دَين: الخصم صفر والمبلغ كلّه يبقى للعميل", () => {
    const lines = msg({ amount: 500, netBefore: 0 }).split("\n");
    expect(lines[2]).toBe("تم خصم 0");
    expect(lines[3]).toBe("المتبقي +500");
  });

  it("الشحن أقل من الدَّين: يُخصم كاملاً ويبقى على العميل الباقي بالسالب", () => {
    const lines = msg({ amount: 400, netBefore: 1000 }).split("\n");
    expect(lines[2]).toBe("تم خصم 400");
    expect(lines[3]).toBe("المتبقي −600");
  });

  it("الشحن يساوي الدَّين: الحساب يُقفل على صفر بلا إشارة", () => {
    const lines = msg({ amount: 300, netBefore: 300 }).split("\n");
    expect(lines[2]).toBe("تم خصم 300");
    expect(lines[3]).toBe("المتبقي 0");
  });

  it("لعميل له رصيد سابق: لا خصم ويتراكم الرصيد", () => {
    const lines = msg({ amount: 500, netBefore: -200 }).split("\n");
    expect(lines[2]).toBe("تم خصم 0");
    expect(lines[3]).toBe("المتبقي +700");
  });
});

describe("الأرقام صحيحة لا مجرّد صيغة", () => {
  it("الخصم لا يتجاوز المبلغ ولا الدَّين", () => {
    expect(chargeApplied(500, 300)).toBe(300); // محدود بالدَّين
    expect(chargeApplied(400, 1000)).toBe(400); // محدود بالمبلغ
    expect(chargeApplied(500, -200)).toBe(0); // لا دَين أصلاً
  });

  it("«المتبقي» = صافي الحساب بعد الشحن — الخصم + المتبقي يعيدان المعادلة", () => {
    for (const [amount, netBefore] of [[500, 300], [400, 1000], [300, 300], [500, -200]]) {
      const after = netBefore - amount; // بإشارة الدفاتر
      const shown = msg({ amount, netBefore }).split("\n")[3].replace("المتبقي ", "");
      const expected = Math.abs(after) < 0.01 ? "0" : `${after < 0 ? "+" : "−"}${Math.abs(after).toLocaleString()}`;
      expect(shown).toBe(expected);
    }
  });

  it("إشارة «المتبقي» هي نفسها المستعملة في كشف الحساب", () => {
    // موجب لصالح العميل في الاثنين — فلا تتناقض الرسالة مع الكشف
    const shown = msg({ amount: 500, netBefore: 300 }).split("\n")[3];
    expect(shown).toContain(signedAmountText(200).text);
    const owing = msg({ amount: 400, netBefore: 1000 }).split("\n")[3];
    expect(owing).toContain(signedAmountText(-600).text);
  });

  it("المبالغ الكبيرة بفواصل الآلاف", () => {
    expect(msg({ amount: 800000, netBefore: 126000 }).split("\n")[1]).toBe("تم شحن +800,000");
    expect(msg({ amount: 800000, netBefore: 126000 }).split("\n")[3]).toBe("المتبقي +674,000");
  });
});

describe("التاريخ", () => {
  it("يُعرض يوم/شهر/سنة", () => {
    expect(formatChargeDate("2026-07-31")).toBe("31/07/2026");
  });

  it("صيغة غير متوقّعة تُعاد كما هي بلا كسر الرسالة", () => {
    expect(formatChargeDate("")).toBe("");
    expect(formatChargeDate("لا تاريخ")).toBe("لا تاريخ");
  });
});
