/**
 * عرض حساب العميل حسب الفاتورة — بلا توزيع تلقائي ولا تسوية تراكمية.
 *
 * الثابت الحاكم: إجمالي حساب العميل = Σ(متبقي الفواتير بإشارته) − الرصيد
 * القابل للتوزيع = `net_balance` المحسوب من القاعدة، وهو نفسه ناتج تراكم
 * `effect` على كامل السلسلة.
 */
import { describe, it, expect } from "vitest";
import { buildCustomerAccountView, signedBalanceText, signedAmountText, effectText, stampOf } from "@/utils/buildCustomerAccountView";

const CUST = "c1";

const inv = (o: any) => ({
  id: o.id,
  invoice_number: o.invoice_number || o.id,
  date: o.date || "2026-01-01",
  created_at: o.created_at,
  total: 0,
  paid_amount: 0,
  status: "pending",
  ...o,
});
const tx = (o: any) => ({ id: o.id, customer_id: CUST, date: o.date || "2026-01-01", ...o });

/** net_balance بقاعدة recompute_customer_balance. */
const netOf = (invoices: any[], txs: any[]) => {
  const debt = invoices
    .filter((i) => i.status !== "cancelled")
    .reduce((s, i) => s + Math.max(Number(i.total || 0) - Number(i.paid_amount || 0), 0), 0);
  const credit = txs
    .filter((t) => t.category === "customer_credit")
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return Math.round((debt - credit) * 100) / 100;
};

describe("المثال المطلوب: دفع 5000 على فاتورة 4000", () => {
  // splitPayment يقيّد 4000 على الفاتورة ويحوّل الفائض 1000 لرصيد العميل
  const invoices = [inv({ id: "i1", invoice_number: "INV-1", date: "2026-03-01", created_at: "2026-03-01T09:15:00Z", total: 4000, paid_amount: 4000, status: "paid" })];
  const transactions = [
    tx({ id: "p1", category: "customer_payment", amount: 4000, reference_id: "i1", method: "cash", date: "2026-03-01", created_at: "2026-03-01T10:30:00Z" }),
    tx({ id: "o1", category: "customer_credit", amount: 1000, reference_id: "i1", date: "2026-03-01", created_at: "2026-03-01T10:30:00Z", description: "فائض دفعة على فاتورة INV-1" }),
  ];
  const net = netOf(invoices, transactions);
  const view = buildCustomerAccountView({ invoices, transactions, netBalance: net });

  // صندوق الفائض الواحد: الزيادة لم تعد تُخصم من متبقّي الفاتورة، بل تدخل
  // الصندوق القابل للتوزيع اليدوي كأي رصيد آخر — فلا يُحتسب المال مرّتين.
  it("الفاتورة نفسها تُقفل «خالص» — الزيادة ليست متبقّياً سالباً عليها", () => {
    expect(view.blocks[0].remaining).toBe(0);
    expect(view.blocks[0].linkedOverpay).toBe(1000);
    expect(signedBalanceText(view.blocks[0].remaining)).toEqual({ text: "خالص", tone: "settled" });
  });

  it("الزيادة تدخل صندوق الفائض الواحد بسطر باسم فاتورتها", () => {
    expect(view.creditPool.map((e) => e.kind)).toEqual(["overpay"]);
    expect(view.creditPoolTotal).toBe(1000);
    const row = view.rows.find((r) => r.kind === "credit")!;
    expect(row.label).toBe("دفعة زائدة +1,000");
    expect(row.remaining).toBe(1000);
  });

  it("إجمالي حساب العميل = net_balance", () => {
    expect(net).toBe(-1000);
    expect(view.accountTotal).toBe(net);
    expect(view.drift).toBe(0);
  });

  it("الرصيد الجاري ينتهي عند إجمالي الحساب", () => {
    const last = view.creditPool.at(-1)!;
    expect(last.runningBalance).toBe(view.accountTotal);
  });
});

describe("شحن رصيد لاحق يُخصم من مجموع الحساب ويبقى قابلاً للتوزيع", () => {
  const invoices = [inv({ id: "i1", invoice_number: "INV-1", date: "2026-03-01", total: 4000, paid_amount: 4000, status: "paid" })];
  const transactions = [
    tx({ id: "p1", category: "customer_payment", amount: 4000, reference_id: "i1", method: "cash", date: "2026-03-01" }),
    tx({ id: "o1", category: "customer_credit", amount: 1000, reference_id: "i1", date: "2026-03-01", description: "فائض دفعة على فاتورة INV-1" }),
    tx({ id: "ch", category: "customer_credit", amount: 4000, date: "2026-03-05", reference_no: "OP-9", allocation: { kind: "surplus" }, description: "شحن رصيد" }),
  ];
  const net = netOf(invoices, transactions);
  const view = buildCustomerAccountView({ invoices, transactions, netBalance: net });

  it("الشحنة والفائض معاً في الصندوق الواحد القابل للتوزيع", () => {
    expect(view.creditPool.map((e) => e.kind)).toEqual(["overpay", "credit_charge"]);
    expect(view.creditPoolTotal).toBe(5000); // فائض 1000 + شحن 4000
  });

  it("لا توزيع تلقائي: حالة الفاتورة ومدفوعها لم يتغيّرا بسبب الشحنة", () => {
    expect(view.blocks[0].paid).toBe(4000);
    expect(view.blocks.every((b) => b.movements.every((m) => m.kind !== "credit_settle"))).toBe(true);
  });

  it("المجموع النهائي = له 5,000 ويطابق net_balance", () => {
    expect(view.accountTotal).toBe(-5000);
    expect(view.accountTotal).toBe(net);
    expect(signedBalanceText(view.accountTotal)).toEqual({ text: "له +5,000", tone: "credit" });
  });

  it("تراكم الأثر على كامل السلسلة يساوي إجمالي الحساب", () => {
    const all = [...view.blocks.flatMap((b) => b.movements), ...view.creditPool];
    const sum = view.blocks.reduce((s, b) => s + b.total, 0) + all.reduce((s, e) => s + e.effect, 0);
    expect(Math.round(sum * 100) / 100).toBe(view.accountTotal);
  });
});

describe("العميل المدين", () => {
  const invoices = [
    inv({ id: "a", invoice_number: "A", date: "2026-01-01", total: 5000, paid_amount: 2000, status: "partial" }),
    inv({ id: "b", invoice_number: "B", date: "2026-02-01", total: 3000, paid_amount: 0 }),
  ];
  const transactions = [tx({ id: "p1", category: "customer_payment", amount: 2000, reference_id: "a", method: "cash" })];
  const view = buildCustomerAccountView({ invoices, transactions, netBalance: netOf(invoices, transactions) });

  it("المتبقي موجب ويُعرض «عليه» بالسالب", () => {
    expect(view.blocks.map((b) => b.remaining)).toEqual([3000, 3000]);
    expect(signedBalanceText(3000)).toEqual({ text: "عليه −3,000", tone: "debit" });
  });

  it("إجمالي الحساب = 6,000 عليه", () => {
    expect(view.accountTotal).toBe(6000);
    expect(view.drift).toBe(0);
  });

  it("الحساب الخالص يُعرض «خالص»", () => {
    expect(signedBalanceText(0)).toEqual({ text: "خالص", tone: "settled" });
    expect(signedBalanceText(0.004).tone).toBe("settled");
  });
});

describe("السداد اليدوي من الرصيد", () => {
  // المستخدم وزّع 1000 من رصيد العميل على الفاتورة عبر apply_customer_credit_to_invoice
  const invoices = [inv({ id: "a", invoice_number: "A", date: "2026-01-01", total: 5000, paid_amount: 1000, status: "partial" })];
  const transactions = [
    tx({ id: "ch", category: "customer_credit", amount: 3000, date: "2026-01-02", description: "شحن رصيد" }),
    tx({ id: "u1", category: "customer_credit", amount: -1000, reference_id: "a", date: "2026-01-03" }),
    tx({ id: "p1", category: "customer_payment", amount: 1000, reference_id: "a", method: "credit_balance", date: "2026-01-03" }),
  ];
  const net = netOf(invoices, transactions);
  const view = buildCustomerAccountView({ invoices, transactions, netBalance: net });

  it("الصفّان المتلازمان يُدمجان في حركة واحدة أثرها صفر", () => {
    const settle = view.blocks[0].movements.filter((m) => m.kind === "credit_settle");
    expect(settle).toHaveLength(1);
    expect(settle[0].effect).toBe(0);
    expect(settle[0].label).toBe("سداد من رصيد العميل");
  });

  it("الرصيد القابل للتوزيع = صافي الرصيد الدائن بعد ما استُهلك منه", () => {
    expect(view.blocks[0].remaining).toBe(4000);
    // شُحن 3000 واستُهلك 1000 ⇒ المتاح للتوزيع 2000 لا 3000
    expect(view.creditPoolTotal).toBe(2000);
  });

  it("إجمالي الحساب يطابق net_balance", () => {
    expect(net).toBe(2000);
    expect(view.accountTotal).toBe(net);
    expect(view.drift).toBe(0);
  });

  it("الرصيد الجاري ينتهي عند إجمالي الحساب", () => {
    const last = view.creditPool.at(-1) ?? view.blocks.at(-1)!.movements.at(-1)!;
    expect(last.runningBalance).toBe(view.accountTotal);
  });
});

describe("لا نسبة بلا رابط صريح — إلغاء استنتاج FIFO", () => {
  it("شحنة واستهلاك بلا reference_id لا يُنسبان لأي فاتورة", () => {
    const invoices = [inv({ id: "a", invoice_number: "A", total: 1000, paid_amount: 0 })];
    const transactions = [
      tx({ id: "ch", category: "customer_credit", amount: 500, date: "2026-01-02", description: "شحن رصيد" }),
      tx({ id: "u", category: "customer_credit", amount: -200, date: "2026-01-03" }),
    ];
    const view = buildCustomerAccountView({ invoices, transactions });
    expect(view.blocks[0].movements).toHaveLength(0);
    expect(view.creditPool.map((e) => e.kind)).toEqual(["credit_charge", "credit_settle"]);
  });

  it("حركة تشير لفاتورة غير معروضة تذهب للرصيد لا لفاتورة أخرى", () => {
    const invoices = [inv({ id: "a", invoice_number: "A", total: 1000, paid_amount: 0 })];
    const transactions = [tx({ id: "p", category: "customer_payment", amount: 300, reference_id: "ghost", method: "cash" })];
    const view = buildCustomerAccountView({ invoices, transactions });
    expect(view.blocks[0].movements).toHaveLength(0);
    expect(view.creditPool).toHaveLength(1);
  });
});

describe("التفاصيل بدقة الساعة", () => {
  it("يستخرج التاريخ واليوم والساعة من created_at", () => {
    const s = stampOf({ date: "2026-07-30", created_at: "2026-07-30T14:45:00" });
    expect(s.date).toBe("2026-07-30");
    expect(s.time).toBe("14:45");
    expect(s.dayName).toBe("الخميس");
  });

  it("بلا created_at يبقى الوقت فارغاً بدل اختلاقه", () => {
    const s = stampOf({ date: "2026-07-30" });
    expect(s.date).toBe("2026-07-30");
    expect(s.time).toBe("");
    expect(s.dayName).toBe("الخميس");
  });

  it("الحركات داخل الفاتورة مرتّبة زمنياً بالساعة", () => {
    const invoices = [inv({ id: "a", invoice_number: "A", date: "2026-01-01", total: 1000, paid_amount: 900 })];
    const transactions = [
      tx({ id: "p2", category: "customer_payment", amount: 600, reference_id: "a", method: "cash", date: "2026-01-01", created_at: "2026-01-01T15:00:00Z" }),
      tx({ id: "p1", category: "customer_payment", amount: 300, reference_id: "a", method: "cash", date: "2026-01-01", created_at: "2026-01-01T09:00:00Z" }),
    ];
    const view = buildCustomerAccountView({ invoices, transactions });
    expect(view.blocks[0].movements.map((m) => m.id)).toEqual(["pay:p1", "pay:p2"]);
    expect(view.blocks[0].movements.map((m) => m.runningBalance)).toEqual([700, 100]);
  });
});

describe("الفواتير الملغاة", () => {
  it("لا تدخل الكتل ولا المجاميع", () => {
    const invoices = [
      inv({ id: "a", invoice_number: "A", total: 1000, paid_amount: 0 }),
      inv({ id: "x", invoice_number: "X", total: 900, paid_amount: 0, status: "cancelled" }),
    ];
    const view = buildCustomerAccountView({ invoices, transactions: [], netBalance: netOf(invoices, []) });
    expect(view.blocks.map((b) => b.invoiceNumber)).toEqual(["A"]);
    expect(view.accountTotal).toBe(1000);
    expect(view.drift).toBe(0);
  });
});

describe("إشارة العرض بلغة العميل — «+» أخضر و«−» أحمر", () => {
  it("ما يصبّ في مصلحة العميل يُعرض «+» بلون الدائن", () => {
    // دفعة/شحن أثرهما الداخلي سالب (ينقص ما علينا) ⇒ يُعرضان «+» أخضر
    expect(effectText(-300)).toEqual({ text: "+300", tone: "credit" });
  });

  it("ما يزيد على العميل يُعرض «−» بلون المدين", () => {
    expect(effectText(500)).toEqual({ text: "−500", tone: "debit" });
  });

  it("لا إشارة بلا أثر", () => {
    expect(effectText(0).tone).toBe("settled");
  });

  it("تطابق إشارة الرصيد: «له +» أخضر و«عليه −» أحمر", () => {
    // نفس اتجاه الإشارة في الحركة والرصيد — فلا يرى العميل «+» أخضر هنا و«+» أحمر هناك
    expect(signedBalanceText(-300)).toEqual({ text: "له +300", tone: "credit" });
    expect(signedBalanceText(500)).toEqual({ text: "عليه −500", tone: "debit" });
    expect(effectText(-300).text.startsWith("+")).toBe(true);
    expect(effectText(-300).tone).toBe(signedBalanceText(-300).tone);
    expect(effectText(500).text.startsWith("−")).toBe(true);
    expect(effectText(500).tone).toBe(signedBalanceText(500).tone);
  });
});

describe("الجدول المسطّح — الشكل الذي طلبه العميل", () => {
  // فاتورتان بـ200 لكل منهما ثم شحن 500: الشحن يبتلع 400 ويبقى 100 مخزّناً.
  const invoices = [
    { id: "a", invoice_number: "A", date: "2026-07-20", created_at: "2026-07-20T09:00:00", total: 200, paid_amount: 0, status: "pending" },
    { id: "b", invoice_number: "B", date: "2026-07-21", created_at: "2026-07-21T09:00:00", total: 200, paid_amount: 0, status: "pending" },
  ];
  const transactions = [
    { id: "ch", category: "customer_credit", amount: 500, reference_no: "OP-7", date: "2026-07-25", created_at: "2026-07-25T12:00:00", description: "شحن رصيد" },
  ];
  const view = () => buildCustomerAccountView({ invoices, transactions, netBalance: -100 });

  it("ثلاثة أسطر: فاتورتان وسطر شحن بمبلغه — والعمود يُجمع", () => {
    const v = view();
    const rows = v.rows.map((r) => [r.label, r.value, r.paid, signedAmountText(r.remaining).text]);
    expect(rows).toEqual([
      ["فاتورة A", 200, 0, "\u2212200"],
      ["فاتورة B", 200, 0, "\u2212200"],
      ["تم شحن +500", null, 500, "+500"],
    ]);
    // ‎−200 ‎−200 ‎+500 = ‎+100 وهو صافي الحساب: له 100
    expect(v.rows.reduce((s, r) => s + r.remaining, 0)).toBe(100);
  });

  it("لا أسطر سداد من الرصيد إطلاقاً", () => {
    const invs = [{ id: "a", invoice_number: "A", date: "2026-01-01", created_at: "2026-01-01T09:00:00", total: 300, paid_amount: 300, status: "paid" }];
    const txs = [
      { id: "p", category: "customer_payment", amount: 200, reference_id: "a", method: "cash", date: "2026-01-01", created_at: "2026-01-01T09:30:00" },
      { id: "ch", category: "customer_credit", amount: 300, date: "2026-01-02", created_at: "2026-01-02T09:00:00", description: "شحن رصيد" },
      { id: "s", category: "customer_credit", amount: -100, reference_id: "a", method: "credit_balance", date: "2026-01-03", created_at: "2026-01-03T09:00:00" },
      { id: "sp", category: "customer_payment", amount: 100, reference_id: "a", method: "credit_balance", date: "2026-01-03", created_at: "2026-01-03T09:00:00" },
    ];
    const v = buildCustomerAccountView({ invoices: invs, transactions: txs, netBalance: -200 });
    expect(v.rows.map((r) => r.kind)).toEqual(["invoice", "credit"]);
    expect(v.rows.every((r) => !/سداد من رصيد/.test(r.label))).toBe(true);
    // سطر الفاتورة يحمل النقد وحده (200) لا paid_amount (300) — وإلا انكسر الطرح
    expect(v.rows[0].paid).toBe(200);
    expect(v.rowsValue - v.rowsPaid).toBe(v.accountTotal);
    expect(v.drift).toBe(0);
  });

  it("الطرح يقفل: Σالقيمة − Σالمدفوع = صافي الحساب", () => {
    const v = view();
    expect(v.rowsValue).toBe(400);
    expect(v.rowsPaid).toBe(500);
    expect(v.rowsValue - v.rowsPaid).toBe(v.accountTotal);
    expect(signedAmountText(-v.accountTotal).text).toBe("+100");
    expect(v.drift).toBe(0);
  });

  // البيان مختصر عمداً: الأثر مقروء من العمودين، والتفاصيل في شاشة المعاملات.
  it("سطر الشحن مبلغ وحده بلا شرح — بلا دَين قبله", () => {
    const v = buildCustomerAccountView({
      invoices: [],
      transactions: [{ id: "ch", category: "customer_credit", amount: 500, date: "2026-07-25", created_at: "2026-07-25T12:00:00", description: "شحن رصيد" }],
      netBalance: -500,
    });
    expect(v.rows[0].label).toBe("تم شحن +500");
    expect(v.rows[0].remaining).toBe(500);
  });

  it("سطر الشحن مبلغ وحده — والمتبقي يبقى سالباً إن لم يكفِ الدَّين", () => {
    const v = buildCustomerAccountView({
      invoices: [{ id: "a", invoice_number: "A", date: "2026-01-01", created_at: "2026-01-01T09:00:00", total: 1000, paid_amount: 0, status: "pending" }],
      transactions: [{ id: "ch", category: "customer_credit", amount: 400, date: "2026-01-02", created_at: "2026-01-02T09:00:00", description: "شحن رصيد" }],
      netBalance: 600,
    });
    expect(v.rows[1].label).toBe("تم شحن +400");
    // مبلغ الشحن نفسه — لا الرصيد الجاري بعده. العمود يُجمع رأسياً:
    // −1000 (الفاتورة) + 400 (الشحن) = −600 وهو صافي الحساب.
    expect(signedAmountText(v.rows[1].remaining).text).toBe("+400");
    expect(v.rows.reduce((s, r) => s + r.remaining, 0)).toBe(-600);
  });

  /**
   * كل صف يُحسب وحده، ومجموع العمود = صافي الحساب — بالأرقام التي رسمها
   * صاحب المستودع بنفسه. هذا ما يجعل الكشف قابلاً للتحقّق بجمعٍ بسيط.
   */
  it("عمود «المتبقي» يُجمع رأسياً فيعطي صافي الحساب", () => {
    const inv = (n: number, total: number, paid: number) => ({
      id: `i${n}`, invoice_number: `INV-${n}`,
      date: `2026-01-0${n}`, created_at: `2026-01-0${n}T09:00:00`,
      total, paid_amount: paid, status: "pending",
    });
    const v = buildCustomerAccountView({
      invoices: [
        inv(1, 500, 300), inv(2, 600, 400), inv(3, 300, 200),
        inv(4, 500, 1000), inv(5, 500, 100),
      ],
      transactions: [{
        id: "ch", category: "customer_credit", amount: 300,
        date: "2026-01-06", created_at: "2026-01-06T09:00:00", description: "شحن رصيد",
      }],
      netBalance: 100,
    });
    expect(v.rows.map((r) => r.remaining)).toEqual([-200, -200, -100, 500, -400, 300]);
    expect(v.rows.reduce((s, r) => s + r.remaining, 0)).toBe(-100);
  });

  it("البيان لا يحمل أي شرح للخصم — مكانه الأعمدة لا الكلمات", () => {
    const v = view();
    const charge = v.rows.find((r) => r.kind === "credit")!;
    expect(charge.label).not.toMatch(/خُصم|مخزّن|صافي الحساب/);
  });
});

describe("صندوق الفائض الواحد", () => {
  it("الدفعة الزائدة تدخل الصندوق ولا تُخصم من متبقّي فاتورتها", () => {
    const invoices = [{ id: "a", invoice_number: "A", date: "2026-01-01", created_at: "2026-01-01T09:00:00", total: 4000, paid_amount: 4000, status: "paid" }];
    const transactions = [
      { id: "p", category: "customer_payment", amount: 4000, reference_id: "a", method: "cash", date: "2026-01-01", created_at: "2026-01-01T10:00:00" },
      { id: "o", category: "customer_credit", amount: 1000, reference_id: "a", date: "2026-01-01", created_at: "2026-01-01T10:00:00", description: "فائض دفعة على فاتورة A" },
    ];
    const v = buildCustomerAccountView({ invoices, transactions, netBalance: -1000 });
    expect(v.blocks[0].remaining).toBe(0);      // الفاتورة خالصة لا «له +1000»
    expect(v.creditPoolTotal).toBe(1000);       // المال في الصندوق وحده
    expect(v.accountTotal).toBe(-1000);
    expect(v.drift).toBe(0);
    const extra = v.rows.find((r) => r.kind === "credit")!;
    expect(extra.label).toBe("دفعة زائدة +1,000");
    expect(extra.remaining).toBe(1000);
    expect(v.rowsValue - v.rowsPaid).toBe(v.accountTotal);
  });
});

describe("signedAmountText", () => {
  it("موجب أخضر بإشارة + وسالب أحمر بإشارة −", () => {
    expect(signedAmountText(300)).toEqual({ text: "+300", tone: "credit" });
    expect(signedAmountText(-100)).toEqual({ text: "\u2212100", tone: "debit" });
    expect(signedAmountText(0)).toEqual({ text: "خالص", tone: "settled" });
  });
});
