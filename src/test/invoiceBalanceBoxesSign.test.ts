// حارس اتجاه الإشارة بين دالّتين متعاكستين قصداً:
//   netBalanceOf / netBeforeInvoice → إشارة الدفاتر (موجب = عليه)
//   signedAmountText                → إشارة العرض  (موجب = لصالح العميل)
// صندوقا معاينة الفاتورة يعبران بينهما، وكان العبور بلا عكس فانقلب الكشف على
// وجه العميل. هذه الاختبارات تثبّت الاتجاه بأرقام من الإنتاج.
import { describe, it, expect } from "vitest";
import { signedAmountText } from "@/utils/buildCustomerAccountView";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { toDisplaySign } from "@/components/invoice/InvoiceBalanceBoxes";

/** ما يظهر فعلاً في الصندوق: نفس تركيب المكوّن حرفياً. */
const box = (customer: { net_balance: number }) =>
  signedAmountText(toDisplaySign(netBalanceOf(customer)));

describe("صندوقا حساب العميل في معاينة الفاتورة", () => {
  it("من له رصيد يراه أخضر بموجب — لا أحمر بسالب", () => {
    // «احمد محمد على سنار» في الإنتاج: net_balance = −130,000 أي له 130,000
    const shown = box({ net_balance: -130_000 });
    expect(shown.tone).toBe("credit");
    expect(shown.text).toBe("+130,000");
  });

  it("من عليه دَين يراه أحمر بسالب", () => {
    const shown = box({ net_balance: 100_000 });
    expect(shown.tone).toBe("debit");
    expect(shown.text).toBe("−100,000");
  });

  it("الحساب المتعادل «خالص» بلا إشارة", () => {
    expect(box({ net_balance: 0 })).toEqual({ text: "خالص", tone: "settled" });
  });

  it("العبور عكسٌ صريح لا تمريرٌ مباشر", () => {
    // لو عاد التمرير المباشر يوماً، ينقلب هذا التوقّع فوراً.
    expect(toDisplaySign(130_000)).toBe(-130_000);
    expect(signedAmountText(130_000).tone).toBe("credit");
    expect(box({ net_balance: 130_000 }).tone).toBe("debit");
  });
});
