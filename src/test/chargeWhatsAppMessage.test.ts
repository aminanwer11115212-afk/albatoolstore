/**
 * رسالة واتساب شحن الرصيد.
 *
 * تحكي القصة بترتيبها: ماذا شُحن، وكيف كان الحساب، وكم ابتلع الشحن منه، وما
 * بقي. سطر «تم خصم» وحده مشروط — يختفي إن لم يكن هناك خصم. بقية السطور ثابتة
 * حتى يألف العميل شكل الرسالة.
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
    customerName: "ايهاب الدين امدرمان",
    amount: 50000,
    netBefore: 100000,
    date: "2026-07-31",
    ...o,
  });

describe("المثال المطلوب: شحن 50,000 وعليه 100,000", () => {
  it("ستة سطور بالترتيب والأرقام المطلوبة", () => {
    expect(msg({})).toBe(
      [
        "عميلنا العزيز ايهاب الدين امدرمان",
        "تم شحن +50,000",
        "الحساب −100,000",
        "تم خصم +50,000",
        "المتبقي −50,000",
        "التاريخ 31/07/2026",
      ].join("\n"),
    );
  });
});

describe("سطر «تم خصم» يظهر فقط حين يوجد خصم فعلي", () => {
  it("يختفي تماماً حين لا دَين على العميل — لا يُكتب «تم خصم 0»", () => {
    const out = msg({ amount: 50000, netBefore: 0 });
    expect(out).not.toContain("تم خصم");
    expect(out.split("\n")).toEqual([
      "عميلنا العزيز ايهاب الدين امدرمان",
      "تم شحن +50,000",
      "الحساب 0",
      "المتبقي +50,000",
      "التاريخ 31/07/2026",
    ]);
  });

  it("يختفي حين يكون للعميل رصيد سابق — لا دَين يُخصم منه", () => {
    const out = msg({ amount: 50000, netBefore: -20000 });
    expect(out).not.toContain("تم خصم");
    expect(out).toContain("الحساب +20,000");
    expect(out).toContain("المتبقي +70,000");
  });

  it("يظهر بكامل المبلغ حين لا يكفي الشحن لتغطية الدَّين", () => {
    const lines = msg({ amount: 40000, netBefore: 100000 }).split("\n");
    expect(lines[2]).toBe("الحساب −100,000");
    expect(lines[3]).toBe("تم خصم +40,000");
    expect(lines[4]).toBe("المتبقي −60,000");
  });

  it("يظهر حين يُقفل الشحن الحساب تماماً", () => {
    const lines = msg({ amount: 100000, netBefore: 100000 }).split("\n");
    expect(lines[3]).toBe("تم خصم +100,000");
    expect(lines[4]).toBe("المتبقي 0");
  });
});

describe("ترتيب السطور وثباتها", () => {
  const cases: Array<[string, number, number, number]> = [
    ["عليه دَين أكبر من الشحن", 50000, 100000, 6],
    ["عليه دَين أصغر من الشحن", 100000, 40000, 6],
    ["لا دَين عليه", 50000, 0, 5],
    ["له رصيد سابق", 50000, -20000, 5],
  ];

  it.each(cases)("%s — السطور بالترتيب المتوقّع", (_l, amount, netBefore, count) => {
    const lines = msg({ amount, netBefore }).split("\n");
    expect(lines).toHaveLength(count);
    expect(lines[0].startsWith("عميلنا العزيز ")).toBe(true);
    expect(lines[1]).toMatch(/^تم شحن \+[\d,]+$/);
    expect(lines[2]).toMatch(/^الحساب (?:[+−][\d,]+|0)$/);
    expect(lines.at(-2)).toMatch(/^المتبقي (?:[+−][\d,]+|0)$/);
    expect(lines.at(-1)!.startsWith("التاريخ ")).toBe(true);
  });
});

describe("الأرقام صحيحة لا مجرّد صيغة", () => {
  it("الخصم لا يتجاوز المبلغ ولا الدَّين", () => {
    expect(chargeApplied(50000, 100000)).toBe(50000); // محدود بالمبلغ
    expect(chargeApplied(100000, 40000)).toBe(40000); // محدود بالدَّين
    expect(chargeApplied(50000, -20000)).toBe(0); // لا دَين أصلاً
  });

  it("«الحساب» ثم «المتبقي» يفرّقان بمقدار المبلغ المشحون تماماً", () => {
    for (const [amount, netBefore] of [[50000, 100000], [100000, 40000], [50000, 0], [50000, -20000]]) {
      const lines = msg({ amount, netBefore }).split("\n");
      const num = (s: string) => Number(s.replace(/[^\d]/g, "")) * (s.includes("−") ? -1 : 1);
      const before = num(lines[2]);
      const after = num(lines.at(-2)!);
      expect(after - before).toBe(amount);
    }
  });

  it("«المتبقي» = صافي الحساب بعد الشحن بإشارة كشف الحساب نفسها", () => {
    // موجب لصالح العميل في الاثنين — فلا تتناقض الرسالة مع الكشف
    expect(msg({ amount: 50000, netBefore: 100000 })).toContain(signedAmountText(-50000).text);
    expect(msg({ amount: 100000, netBefore: 40000 })).toContain(signedAmountText(60000).text);
  });

  it("المبالغ الكبيرة بفواصل الآلاف", () => {
    expect(msg({ amount: 800000, netBefore: 126000 }).split("\n")[1]).toBe("تم شحن +800,000");
    expect(msg({ amount: 800000, netBefore: 126000 }).split("\n")[4]).toBe("المتبقي +674,000");
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
