/**
 * الفائضُ يظهر على الفاتورة — لا تُعلن نفسَها خالصةً وتسكت عنه.
 *
 * ## ما بلّغ عنه صاحبُ المستودع
 * «المدفوع لمّا يكون أكتر من الفاتورة، الفاتورة جوّه بتظهر خالصة. مثال:
 * الفاتورة ٢٠٠٠ والمدفوع ٢١٠٠ — كده باقي للعميل ١٠٠ له، ويلّا الفاتورة
 * بتظهر خالصة».
 *
 * ## ولمَ اختفى
 * `splitPayment` تقصّ `paid_amount` عند الإجمالي — 2000 لا 2100 — وتكتب
 * الزائدَ قيدَ `customer_credit` مربوطاً بالفاتورة. والقصُّ صحيحٌ في موضعه:
 * الفائضُ ليس ديناً سالباً على الفاتورة، مكانه رصيدُ العميل.
 *
 * لكنّ أثرَه أنّ الفاتورة تقول «مدفوعة» ولا يبقى فيها أثرٌ للمئة. فيقرؤها
 * صاحبُها «تمّت» ولا يعلم أنّ للعميل عنده بقيّة.
 *
 * والرقمُ **مكتوبٌ في القاعدة أصلاً** — فلا يُشتقّ ولا يُغيَّر حساب: إنّما
 * يُقرأ ويُعرض.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { invoiceOverpay } from "@/utils/invoiceOverpay";
import { splitPayment } from "@/utils/overpayment";
import { invoiceDue } from "@/utils/invoiceDue";
import { signedAmountText } from "@/utils/buildCustomerAccountView";
import { toDisplaySign } from "@/components/invoice/InvoiceBalanceBoxes";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const INV = "inv-2000";

/* ═══════════ ١) مثالُ صاحب المستودع بأرقامه ═══════════ */

describe("فاتورةُ ٢٠٠٠ والمدفوع ٢١٠٠", () => {
  const split = splitPayment({ amount: 2100, total: 2000, alreadyPaid: 0 });

  it("الفاتورةُ تُقفل بـ2000 والفائضُ 100", () => {
    expect(split.applied).toBe(2000);
    expect(split.overpay).toBe(100);
    expect(split.newPaid).toBe(2000);
  });

  it("والمتبقّي صفر — فتبدو خالصة", () => {
    expect(invoiceDue({ total: 2000, paid_amount: split.newPaid })).toBe(0);
  });

  /** والمئةُ مكتوبةٌ قيداً مربوطاً بالفاتورة — كانت موجودةً ولا تُقرأ. */
  it("والفائضُ يُقرأ من قيوده: 100", () => {
    const txs = [
      { category: "customer_payment", amount: 2000, reference_id: INV },
      { category: "customer_credit", amount: 100, reference_id: INV },
    ];
    expect(invoiceOverpay(INV, txs)).toBe(100);
  });

  it("ويُعرض «له» أخضرَ لا «عليه»", () => {
    const shown = signedAmountText(toDisplaySign(-100));
    expect(shown.tone).toBe("credit");
    expect(shown.text).toContain("100");
    expect(shown.text.startsWith("+")).toBe(true);
  });
});

/* ═══════════ ٢) وحدودُ القراءة ═══════════ */

describe("قراءةُ الفائض", () => {
  it("لا فائضَ لفاتورةٍ دُفعت بالضبط", () => {
    expect(invoiceOverpay(INV, [{ category: "customer_payment", amount: 2000, reference_id: INV }])).toBe(0);
  });

  it("ولا يُخلط فائضُ فاتورةٍ بأخرى", () => {
    const txs = [
      { category: "customer_credit", amount: 100, reference_id: INV },
      { category: "customer_credit", amount: 900, reference_id: "inv-آخر" },
    ];
    expect(invoiceOverpay(INV, txs)).toBe(100);
  });

  /**
   * قيودُ **استهلاك** الرصيد سالبةٌ وتحمل `reference_id` الفاتورة التي
   * سُدِّدت منه لا التي وُلد منها. فجمعُها يخصم من فائض فاتورةٍ ما استُهلك
   * على أخرى — ولهذا يُجمع الموجبُ وحده.
   */
  it("والاستهلاكُ السالبُ لا يأكل الفائض", () => {
    const txs = [
      { category: "customer_credit", amount: 100, reference_id: INV },
      { category: "customer_credit", amount: -100, reference_id: INV },
    ];
    expect(invoiceOverpay(INV, txs)).toBe(100);
  });

  it("والدفعاتُ ليست فائضاً", () => {
    expect(invoiceOverpay(INV, [{ category: "customer_payment", amount: 5000, reference_id: INV }])).toBe(0);
  });

  it("وبلا قيودٍ صفر — لا NaN", () => {
    expect(invoiceOverpay(INV, [])).toBe(0);
    expect(invoiceOverpay(INV, null)).toBe(0);
    expect(invoiceOverpay("", [{ category: "customer_credit", amount: 5, reference_id: "" }])).toBe(0);
  });
});

/* ═══════════ ٣) ولا يُغيَّر حسابٌ — إنّما يُعرض ═══════════ */

describe("العرضُ لا يمسّ الحساب", () => {
  it("`invoiceDue` ما زالت تقصّ عند الصفر", () => {
    expect(invoiceDue({ total: 2000, paid_amount: 2100 })).toBe(0);
  });

  it("و`splitPayment` ما زالت تقصّ `paid_amount` عند الإجمالي", () => {
    expect(splitPayment({ amount: 2100, total: 2000, alreadyPaid: 0 }).newPaid).toBe(2000);
  });
});

/* ═══════════ ٤) والصندوقُ يظهر في الفاتورة ═══════════ */

describe("صندوقُ الفائض", () => {
  const SRC = read("src/components/invoice/InvoiceBalanceBoxes.tsx");

  it("يقرأ الفائضَ من المصدر الواحد", () => {
    expect(SRC).toMatch(/from "@\/utils\/invoiceOverpay"/);
    expect(SRC).toMatch(/setOverpay\(invoiceOverpay\(invoiceId, txs \|\| \[\]\)\)/);
  });

  it("ولا يظهر إلا إذا وقع فائض", () => {
    expect(SRC).toMatch(/overpay > 0\.01 &&/);
  });

  it("ويُمرَّر بإشارة الدفاتر معكوسةً — فيُقرأ «له»", () => {
    expect(SRC).toMatch(/value=\{-overpay\}/);
  });

  /** ولا استعلامَ إضافي: القيودُ محمَّلةٌ أصلاً لحساب «الحساب القديم». */
  it("ولا استعلامَ زائداً لأجله", () => {
    expect((SRC.match(/from\("transactions"\)/g) || []).length).toBe(1);
  });
});
