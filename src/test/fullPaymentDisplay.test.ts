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

describe("indexLinkedOverpay — الفائض ينتسب لدفعته لا لفاتورته", () => {
  const isOverpay = () => true;
  const pay = (id: string, ref: string, at: string) =>
    ({ id, category: "customer_payment", reference_id: ref, created_at: at });
  const credit = (id: string, ref: string, amount: number, at: string) =>
    ({ id, category: "customer_credit", reference_id: ref, amount, created_at: at });

  it("دفعةٌ واحدة بفائض: الفائض عليها", () => {
    const map = indexLinkedOverpay([
      pay("p1", "i1", "2026-08-02T10:00:00Z"),
      credit("c1", "i1", 1000, "2026-08-02T10:00:01Z"),
    ], isOverpay);
    expect(map.get("p1")).toBe(1000);
  });

  /**
   * العطل الذي كشفَته المراجعة: فاتورةٌ 4,000 على دفعتين 2,000 ثم 3,000.
   * الثانية وحدها تتجاوز المتبقي. والفهرس بالفاتورة كان ينسب الفائض للاثنتين
   * فيُقرأ «3,000» و«4,000» — مجموعهما 7,000 وقد دُفع 5,000.
   */
  it("دفعتان وفائضٌ واحد: الفائض على الثانية وحدها", () => {
    const map = indexLinkedOverpay([
      pay("p1", "i1", "2026-08-02T10:00:00Z"),
      pay("p2", "i1", "2026-08-05T10:00:00Z"),
      credit("c1", "i1", 1000, "2026-08-05T10:00:01Z"),
    ], isOverpay);
    expect(map.get("p2")).toBe(1000);
    expect(map.get("p1")).toBeUndefined();
  });

  it("فائضان لدفعتين: كلٌّ إلى دفعته", () => {
    const map = indexLinkedOverpay([
      pay("p1", "i1", "2026-08-02T10:00:00Z"),
      credit("c1", "i1", 300, "2026-08-02T10:00:01Z"),
      pay("p2", "i1", "2026-08-09T10:00:00Z"),
      credit("c2", "i1", 700, "2026-08-09T10:00:01Z"),
    ], isOverpay);
    expect(map.get("p1")).toBe(300);
    expect(map.get("p2")).toBe(700);
  });

  it("فواتير مختلفة لا تتداخل", () => {
    const map = indexLinkedOverpay([
      pay("p1", "i1", "2026-08-02T10:00:00Z"),
      credit("c1", "i1", 1000, "2026-08-02T10:00:01Z"),
      pay("p2", "i2", "2026-08-02T10:00:00Z"),
      credit("c2", "i2", 200, "2026-08-02T10:00:01Z"),
    ], isOverpay);
    expect(map.get("p1")).toBe(1000);
    expect(map.get("p2")).toBe(200);
  });

  it("يتجاهل الاستهلاك (السالب) وغير المرتبط", () => {
    const map = indexLinkedOverpay([
      credit("c1", "i1", -1000, "2026-08-02T10:00:00Z"),
      { id: "c2", category: "customer_credit", amount: 1000, reference_id: null },
      pay("p1", "i1", "2026-08-02T10:00:00Z"),
    ], isOverpay);
    expect(map.size).toBe(0);
  });

  it("الشحن العادي لا يُحسب فائضاً", () => {
    const map = indexLinkedOverpay([
      pay("p1", "i1", "2026-08-02T10:00:00Z"),
      credit("c1", "i1", 1000, "2026-08-02T10:00:01Z"),
    ], () => false);
    expect(map.size).toBe(0);
  });

  it("فائضٌ بلا دفعةٍ على فاتورته لا يُنسب لأحد", () => {
    const map = indexLinkedOverpay(
      [credit("c1", "i1", 1000, "2026-08-02T10:00:00Z")],
      isOverpay,
    );
    expect(map.size).toBe(0);
  });
});

describe("كشف الحساب بدفعتين — لا تضخيم", () => {
  const invoices = [{
    id: "i1", invoice_number: "INV-1", date: "2026-08-02", created_at: "2026-08-02T09:00:00Z",
    total: 4000, paid_amount: 4000, status: "paid",
  }];
  const transactions = [
    { id: "t1", category: "customer_payment", amount: 2000, reference_id: "i1", date: "2026-08-02", created_at: "2026-08-02T10:00:00Z", method: "cash" },
    { id: "t2", category: "customer_payment", amount: 2000, reference_id: "i1", date: "2026-08-05", created_at: "2026-08-05T10:00:00Z", method: "cash" },
    { id: "t3", category: "customer_credit", amount: 1000, reference_id: "i1", date: "2026-08-05", created_at: "2026-08-05T10:00:01Z", method: "cash", description: "فائض دفعة على فاتورة INV-1" },
  ];

  it("الدفعة الأولى تُقرأ 2,000 والثانية 3,000 — لا 3,000 و3,000", () => {
    const view = buildCustomerAccountView({ invoices, transactions });
    const pays = view.blocks[0].movements.filter((m) => m.kind === "payment");
    expect(pays[0].label).toContain("2,000");
    expect(pays[1].label).toContain("3,000");
  });

  it("مجموع ما يقرؤه المستخدم = ما دفعه فعلاً (5,000)", () => {
    const view = buildCustomerAccountView({ invoices, transactions });
    const nums = view.blocks[0].movements
      .filter((m) => m.kind === "payment")
      .map((m) => Number(m.label.match(/دفعة ([\d,]+)/)![1].replace(/,/g, "")));
    expect(nums.reduce((s, n) => s + n, 0)).toBe(5000);
  });

  it("والمجاميع لم تتحرّك", () => {
    const view = buildCustomerAccountView({ invoices, transactions });
    expect(view.accountTotal).toBe(-1000);
    expect(view.drift).toBe(0);
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
