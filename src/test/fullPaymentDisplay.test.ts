/**
 * البند الأخير — «إذا دفع 5,000 والفاتورة 4,000 تظهر دفع كذه على كذه».
 *
 * `splitPayment` يكتب دفعةَ 5,000 على فاتورةٍ قيمتها 4,000 قيدَين:
 * `customer_payment` بـ4,000 و`customer_credit` بـ1,000. صحيحٌ محاسبياً،
 * لكنّ العميل دفع مرّةً واحدة 5,000 — فكان يقرأ «دفعة 4,000» ويسأل عن الألف.
 *
 * العلاج في العرض لا في القيود: القيدان يبقيان كما هما — لا رصيد يُمَسّ ولا
 * توزيع يتغيّر — ويُذكر في النصّ ما دُفع كاملاً وعلى أي قيمة وأين ذهب الفائض.
 * ولهذا تفحص هذه الاختبارات النصَّ **وتثبت أن المجاميع لم تتحرّك**.
 */
import { describe, it, expect } from "vitest";
import {
  paymentStatement,
  paymentCustomerText,
  fullPaidAmount,
  indexLinkedOverpay,
} from "@/utils/paymentDisplay";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";
import { buildCustomerLedger } from "@/utils/buildCustomerLedger";
import { splitPayment } from "@/utils/overpayment";

describe("paymentStatement — المثال المطلوب", () => {
  it("دفع 5,000 على فاتورة قيمتها 4,000", () => {
    expect(paymentStatement({
      applied: 4000, surplus: 1000, invoiceNumber: "INV-1", invoiceTotal: 4000,
    })).toBe("دفعة 5,000 على فاتورة INV-1 (4,000)");
  });

  it("بلا فائض: المبلغ نفسه والقيمة بجانبه", () => {
    expect(paymentStatement({
      applied: 4000, surplus: 0, invoiceNumber: "INV-1", invoiceTotal: 4000,
    })).toBe("دفعة 4,000 على فاتورة INV-1 (4,000)");
  });

  it("دفعة غير مرتبطة بفاتورة", () => {
    expect(paymentStatement({ applied: 3000 })).toBe("دفعة 3,000 من العميل");
  });

  it("جملة العميل تذكر أين ذهب الفائض", () => {
    const txt = paymentCustomerText({
      applied: 4000, surplus: 1000, invoiceNumber: "INV-1", invoiceTotal: 4000, via: "الخزنة",
    });
    expect(txt).toContain("دفعتم 5,000");
    expect(txt).toContain("قيمتها 4,000");
    expect(txt).toContain("منها 1,000 أُضيفت إلى رصيدكم");
  });
});

describe("fullPaidAmount", () => {
  it("المطبَّق + الفائض", () => {
    expect(fullPaidAmount({ applied: 4000, surplus: 1000 })).toBe(5000);
  });

  it("يطابق ما أدخله المستخدم في `splitPayment`", () => {
    const split = splitPayment({ amount: 5000, total: 4000, alreadyPaid: 0 });
    expect(fullPaidAmount({ applied: split.applied, surplus: split.overpay })).toBe(5000);
  });

  it("فائض سالب أو غائب لا يُنقص المدفوع", () => {
    expect(fullPaidAmount({ applied: 4000 })).toBe(4000);
    expect(fullPaidAmount({ applied: 4000, surplus: -50 })).toBe(4000);
  });
});

describe("indexLinkedOverpay — الفهرسة قبل المرور", () => {
  const isOverpay = () => true;

  it("يجمع فوائض الفاتورة الواحدة", () => {
    const map = indexLinkedOverpay([
      { category: "customer_credit", amount: 1000, reference_id: "i1" },
      { category: "customer_credit", amount: 500, reference_id: "i1" },
      { category: "customer_credit", amount: 200, reference_id: "i2" },
    ], isOverpay);
    expect(map.get("i1")).toBe(1500);
    expect(map.get("i2")).toBe(200);
  });

  it("يتجاهل الاستهلاك (السالب) وغير المرتبط", () => {
    const map = indexLinkedOverpay([
      { category: "customer_credit", amount: -1000, reference_id: "i1" },
      { category: "customer_credit", amount: 1000, reference_id: null },
      { category: "customer_payment", amount: 1000, reference_id: "i1" },
    ], isOverpay);
    expect(map.size).toBe(0);
  });

  it("الشحن العادي لا يُحسب فائضاً", () => {
    const map = indexLinkedOverpay(
      [{ category: "customer_credit", amount: 1000, reference_id: "i1" }],
      () => false,
    );
    expect(map.size).toBe(0);
  });
});

/** الحالة الحيّة: فاتورة 4,000 ودفعة 5,000 مقسومة كما تكتبها القاعدة. */
const invoices = [{
  id: "i1", invoice_number: "INV-1", date: "2026-08-02", created_at: "2026-08-02T10:00:00Z",
  total: 4000, paid_amount: 4000, status: "paid",
}];
const transactions = [
  {
    id: "t1", category: "customer_payment", amount: 4000, reference_id: "i1",
    date: "2026-08-02", created_at: "2026-08-02T10:05:00Z", method: "cash",
  },
  {
    id: "t2", category: "customer_credit", amount: 1000, reference_id: "i1",
    date: "2026-08-02", created_at: "2026-08-02T10:05:01Z", method: "cash",
    description: "فائض دفعة على فاتورة INV-1",
  },
];

describe("كشف الحساب: الدفعة تُقرأ كاملة", () => {
  const view = buildCustomerAccountView({ invoices, transactions });
  const block = view.blocks.find((b) => b.invoiceId === "i1")!;
  const payment = block.movements.find((m) => m.kind === "payment")!;

  it("بيان الحركة يذكر 5,000 على 4,000", () => {
    expect(payment.label).toContain("5,000");
    expect(payment.label).toContain("4,000");
  });

  it("لكنّ أثر القيد على الرصيد لم يتغيّر — الفائض له قيده", () => {
    expect(payment.effect).toBe(-4000);
  });

  it("سطر الفاتورة المسطَّح يعرض 4,000 قيمةً و5,000 مدفوعاً و+1,000 فائضاً", () => {
    const row = view.rows.find((r) => r.id === "inv:i1")!;
    expect(row.value).toBe(4000);
    expect(row.paid).toBe(5000);
    expect(row.remaining).toBe(1000);
  });

  it("صافي الحساب: للعميل 1,000 — لم يتحرّك بتغيير النصّ", () => {
    expect(view.accountTotal).toBe(-1000);
    expect(view.drift).toBe(0);
  });
});

describe("دفتر الأستاذ: البيان نفسه والمجاميع نفسها", () => {
  const led = buildCustomerLedger({ invoices, transactions });

  it("بيان الدفعة يذكر المدفوع كاملاً", () => {
    const pay = led.events.find((e) => e.kind === "payment")!;
    expect(pay.statement).toBe("دفعة 5,000 على فاتورة INV-1 (4,000)");
  });

  it("المبلغ في عمود الدائن يبقى قيدَه وحده — لا ازدواج", () => {
    const pay = led.events.find((e) => e.kind === "payment")!;
    expect(pay.credit).toBe(4000);
  });

  it("المجاميع والرصيد الختامي لم تتحرّك", () => {
    expect(led.totalDebit).toBe(4000);
    expect(led.totalCredit).toBe(5000);
    expect(led.closing).toBe(-1000);
  });
});
