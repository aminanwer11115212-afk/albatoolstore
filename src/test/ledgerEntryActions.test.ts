/**
 * البند 2 — تعديل/حذف الدفعات وشحنات الرصيد من سجل معاملات العميل.
 *
 * يتحقّق من: التصنيف المطابق لـ buildCustomerLedger، حارس استهلاك الرصيد،
 * وتطابق الرصيد المعروض بعد التنفيذ مع net_balance المحسوب من القيود.
 */
import { describe, it, expect } from "vitest";
import {
  classifyLedgerEntry,
  isEditableEntry,
  isDeletableEntry,
  findLinkedConsumptions,
  creditChargeDeletability,
  projectDeleteImpact,
  projectEditImpact,
  chargeGroupId,
  type LedgerTx,
  movementCapabilities,
  actionableMovements,
  BLOCK_MESSAGE,
} from "@/utils/ledgerEntryActions";
import { buildCustomerLedger } from "@/utils/buildCustomerLedger";

const CUST = "cust-1";

const tx = (over: Partial<LedgerTx>): LedgerTx => ({
  id: Math.random().toString(36).slice(2),
  customer_id: CUST,
  category: "customer_payment",
  amount: 100,
  date: "2026-01-01",
  ...over,
});

describe("classifyLedgerEntry — مطابق لتصنيف buildCustomerLedger", () => {
  it("دفعة مرتبطة بفاتورة", () => {
    expect(classifyLedgerEntry(tx({ reference_id: "inv-1" }))).toBe("payment_invoice");
  });
  it("دفعة مستقلة", () => {
    expect(classifyLedgerEntry(tx({ reference_id: null }))).toBe("payment_standalone");
  });
  it("سداد من رصيد دائن", () => {
    expect(classifyLedgerEntry(tx({ method: "credit_balance", reference_id: "inv-1" }))).toBe("payment_from_credit");
  });
  it("شحن رصيد", () => {
    expect(classifyLedgerEntry(tx({ category: "customer_credit", amount: 200 }))).toBe("credit_charge");
  });
  it("استهلاك رصيد", () => {
    expect(classifyLedgerEntry(tx({ category: "customer_credit", amount: -100 }))).toBe("credit_consume");
  });
});

describe("صلاحية التعديل/الحذف", () => {
  it("الدفعة المرتبطة بفاتورة وشحن الرصيد قابلان للتعديل والحذف", () => {
    const payment = tx({ reference_id: "inv-1" });
    const charge = tx({ category: "customer_credit", amount: 200 });
    for (const t of [payment, charge]) {
      expect(isEditableEntry(t)).toBe(true);
      expect(isDeletableEntry(t)).toBe(true);
    }
  });

  it("قيد استهلاك الرصيد لا يُعدَّل ولا يُحذف مباشرة", () => {
    const consume = tx({ category: "customer_credit", amount: -100 });
    expect(isEditableEntry(consume)).toBe(false);
    expect(isDeletableEntry(consume)).toBe(false);
  });

  it("سداد من رصيد دائن لا يُعدَّل من هنا", () => {
    expect(isEditableEntry(tx({ method: "credit_balance", reference_id: "inv-1" }))).toBe(false);
  });
});

describe("findLinkedConsumptions — ربط الاستهلاك بشحنته", () => {
  it("عبر مجموعة الشحنة", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200, allocation: { group_id: "g1", kind: "surplus" } });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -100, allocation: { group_id: "g1", kind: "invoice_alloc" } });
    const other = tx({ id: "u2", category: "customer_credit", amount: -50, allocation: { group_id: "g2" } });
    expect(findLinkedConsumptions(charge, [charge, consume, other]).map((t) => t.id)).toEqual(["u1"]);
  });

  it("عبر charge_tx_id", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200 });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -80, allocation: { charge_tx_id: "c1" } });
    expect(findLinkedConsumptions(charge, [charge, consume])).toHaveLength(1);
  });

  it("عبر رقم العملية في الوصف — نفس ربط buildCustomerLedger", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200, reference_no: "OP-77" });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -60, description: "خصم — رقم العملية OP-77" });
    expect(findLinkedConsumptions(charge, [charge, consume])).toHaveLength(1);
  });

  it("لا يربط استهلاك عميل آخر", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200, allocation: { group_id: "g1" } });
    const other = tx({ id: "u1", customer_id: "cust-2", category: "customer_credit", amount: -100, allocation: { group_id: "g1" } });
    expect(findLinkedConsumptions(charge, [charge, other])).toHaveLength(0);
  });

  it("chargeGroupId يقرأ المجموعة أو null", () => {
    expect(chargeGroupId(tx({ allocation: { group_id: "g9" } }))).toBe("g9");
    expect(chargeGroupId(tx({}))).toBeNull();
  });
});

describe("creditChargeDeletability — حارس الحذف", () => {
  it("شحنة غير مستهلَكة: الحذف مسموح", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200 });
    const res = creditChargeDeletability(charge, [charge]);
    expect(res.canDelete).toBe(true);
    expect(res.reason).toBe("ok");
    expect(res.availableCredit).toBe(200);
  });

  it("شحنة استُهلكت جزئياً بربط صريح: الحذف ممنوع", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200, allocation: { group_id: "g1" } });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -120, allocation: { group_id: "g1" } });
    const res = creditChargeDeletability(charge, [charge, consume]);
    expect(res.canDelete).toBe(false);
    expect(res.reason).toBe("explicit_consumption");
    expect(res.linkedConsumed).toBe(120);
  });

  it("شحنة استُهلكت كلياً: الحذف ممنوع", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200, allocation: { group_id: "g1" } });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -200, allocation: { group_id: "g1" } });
    expect(creditChargeDeletability(charge, [charge, consume]).canDelete).toBe(false);
  });

  it("استهلاك غير مربوط صراحةً لكنه أنقص الرصيد المتبقي: الحذف ممنوع أيضاً", () => {
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200 });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -150, description: "استهلاك" });
    const res = creditChargeDeletability(charge, [charge, consume]);
    expect(res.canDelete).toBe(false);
    expect(res.reason).toBe("insufficient_remaining_credit");
    expect(res.availableCredit).toBe(50);
  });

  it("شحنتان وواحدة فقط استُهلكت: الشحنة السليمة تبقى قابلة للحذف", () => {
    const c1 = tx({ id: "c1", category: "customer_credit", amount: 200, allocation: { group_id: "g1" } });
    const c2 = tx({ id: "c2", category: "customer_credit", amount: 300, allocation: { group_id: "g2" } });
    const used = tx({ id: "u1", category: "customer_credit", amount: -200, allocation: { group_id: "g1" } });
    const all = [c1, c2, used];
    expect(creditChargeDeletability(c1, all).canDelete).toBe(false);
    // المتبقي 300 ≥ قيمة c2 ⇒ لم يُمَس منها شيء
    expect(creditChargeDeletability(c2, all).canDelete).toBe(true);
  });
});

describe("أثر العملية على الرصيد", () => {
  it("حذف دفعة يرفع المديونية بقيمتها", () => {
    const payment = tx({ reference_id: "inv-1", amount: 400 });
    expect(projectDeleteImpact(payment, 100)).toEqual({ before: 100, after: 500, delta: 400 });
  });

  it("حذف شحن رصيد يُنقص الرصيد الدائن بقيمته", () => {
    const charge = tx({ category: "customer_credit", amount: 200 });
    // العميل له 200 (صافي −200) ⇒ بعد الحذف يصبح خالصاً
    expect(projectDeleteImpact(charge, -200)).toEqual({ before: -200, after: 0, delta: 200 });
  });

  it("تعديل مبلغ الدفعة للأعلى يُنقص المديونية بالفرق", () => {
    const payment = tx({ reference_id: "inv-1", amount: 400 });
    expect(projectEditImpact(payment, 100, 500)).toEqual({ before: 100, after: 0, delta: -100 });
  });
});

describe("تطابق الرصيد مع net_balance بعد الحذف — سيناريوهات متعددة", () => {
  /** net_balance المحسوب من القيود بنفس قاعدة recompute_customer_balance. */
  const netFrom = (invoices: any[], txs: LedgerTx[]) => {
    const debt = invoices
      .filter((i) => i.status !== "cancelled")
      .reduce((s, i) => s + Math.max(Number(i.total || 0) - Number(i.paid_amount || 0), 0), 0);
    const credit = txs
      .filter((t) => t.category === "customer_credit")
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    return Math.round((debt - credit) * 100) / 100;
  };

  it("فاتورة 500 بدفعة 400 — حذف الدفعة يعيد المتبقي إلى 500", () => {
    const invoices = [{ id: "inv-1", invoice_number: "INV-1", date: "2026-01-01", total: 500, paid_amount: 400, status: "partial" }];
    const payment = tx({ id: "p1", reference_id: "inv-1", amount: 400 });
    const before = netFrom(invoices, [payment]);
    expect(before).toBe(100);
    expect(projectDeleteImpact(payment, before).after).toBe(500);

    // الحالة الفعلية بعد الحذف: paid_amount ينقص بقيمة الدفعة (فعل RPC)
    const after = netFrom([{ ...invoices[0], paid_amount: 0 }], []);
    expect(after).toBe(projectDeleteImpact(payment, before).after);
  });

  it("فاتورتان وشحنة رصيد — حذف الشحنة غير المستهلَكة يطابق net_balance", () => {
    const invoices = [
      { id: "inv-1", invoice_number: "INV-1", date: "2026-01-01", total: 500, paid_amount: 500, status: "paid" },
      { id: "inv-2", invoice_number: "INV-2", date: "2026-02-01", total: 300, paid_amount: 300, status: "paid" },
    ];
    const charge = tx({ id: "c1", category: "customer_credit", amount: 250, date: "2026-03-01" });
    const before = netFrom(invoices, [charge]);
    expect(before).toBe(-250); // له 250

    expect(creditChargeDeletability(charge, [charge]).canDelete).toBe(true);
    const projected = projectDeleteImpact(charge, before).after;
    expect(projected).toBe(netFrom(invoices, []));
    expect(projected).toBe(0);
  });

  it("مثال البند 3: فاتورة 500، دفعة 400، شحنة 200 تغطّي المتبقي 100 وتترك 100 دائن", () => {
    const invoices = [{ id: "inv-1", invoice_number: "INV-1", date: "2026-01-01", total: 500, paid_amount: 500, status: "paid" }];
    const charge = tx({ id: "c1", category: "customer_credit", amount: 200, date: "2026-02-01", allocation: { group_id: "g1" } });
    const consume = tx({ id: "u1", category: "customer_credit", amount: -100, date: "2026-02-01", allocation: { group_id: "g1", kind: "invoice_alloc" } });
    const cashPay = tx({ id: "p1", reference_id: "inv-1", amount: 400, date: "2026-01-05" });
    const creditPay = tx({ id: "p2", reference_id: "inv-1", amount: 100, method: "credit_balance", date: "2026-02-01" });
    const txs = [cashPay, charge, consume, creditPay];

    // الفائض بعد التغطية = 100 رصيد دائن
    expect(netFrom(invoices, txs)).toBe(-100);

    // الشحنة استُهلك منها ⇒ الحذف المباشر ممنوع
    const guard = creditChargeDeletability(charge, txs);
    expect(guard.canDelete).toBe(false);
    expect(guard.linkedConsumed).toBe(100);

    // ودفتر الأستاذ يقفل على نفس الرقم
    const ledger = buildCustomerLedger({ invoices, transactions: txs, includeDeleted: false });
    expect(ledger.closing).toBe(-100);
  });
});

describe("قدرات الحركة — المصدر الواحد الذي تقرأ منه الواجهة", () => {
  const t = (o: Partial<LedgerTx>): LedgerTx => ({
    id: "x", customer_id: "c1", amount: 100, date: "2026-01-01", ...o,
  });

  it("دفعة مرتبطة بفاتورة: تُعدَّل وتُحذف", () => {
    const caps = movementCapabilities(
      t({ category: "customer_payment", method: "cash", reference_id: "inv-1" }), []);
    expect(caps).toMatchObject({
      kind: "payment_invoice", label: "دفعة على فاتورة",
      canEdit: true, canDelete: true, editBlockedBy: null, deleteBlockedBy: null,
    });
  });

  // revise_invoice_payment يرفض بلا فاتورة، بينما cancel_invoice_payment يقبل
  // أثر الدفعة ينزل على الرصيد التراكمي لا على فاتورةٍ بعينها، فلا معنى
  // لاشتراط فاتورة مرتبطة لتعديلها.
  it("دفعة مستقلة: تُعدَّل وتُحذف بلا قيد", () => {
    const caps = movementCapabilities(
      t({ category: "customer_payment", method: "cash", reference_id: null }), []);
    expect(caps.canDelete).toBe(true);
    expect(caps.canEdit).toBe(true);
    expect(caps.editBlockedBy).toBeNull();
  });

  it("قيد استهلاك الرصيد: لا يُعدَّل ولا يُحذف من هنا", () => {
    for (const tx of [
      t({ category: "customer_credit", amount: -100, reference_id: "inv-1" }),
      t({ category: "customer_payment", method: "credit_balance", reference_id: "inv-1" }),
    ]) {
      const caps = movementCapabilities(tx, []);
      expect(caps.canEdit).toBe(false);
      expect(caps.canDelete).toBe(false);
      expect(caps.deleteBlockedBy).toBe("credit_consumption");
    }
  });

  it("شحنة بمجموعة وغير مستهلَكة: تُعدَّل وتُحذف", () => {
    const charge = t({ category: "customer_credit", amount: 500, allocation: { group_id: "g1" } });
    const caps = movementCapabilities(charge, [charge]);
    expect(caps).toMatchObject({ kind: "credit_charge", canEdit: true, canDelete: true });
  });

  // الشحن يُخزَّن ولا يُوزَّع، فالشحنة قيدٌ واحد يُعدَّل مباشرةً ثم يُعاد
  // حساب الرصيد التراكمي — لا حاجة لمجموعة تخصيص.
  it("شحنة بلا مجموعة: تُعدَّل وتُحذف بلا قيد", () => {
    const charge = t({ category: "customer_credit", amount: 500 });
    const caps = movementCapabilities(charge, [charge]);
    expect(caps.canDelete).toBe(true);
    expect(caps.canEdit).toBe(true);
    expect(caps.editBlockedBy).toBeNull();
  });

  // لا منع بعد اليوم — والتحذير يبقى إخباراً بأن الحذف سيعكس استهلاكاً وقع
  // فعلاً على فواتير، فيرى المستخدم أثر فعله قبل أن يفعله.
  it("شحنة استُهلك منها: تُعدَّل وتُحذف، والتحذير يبقى إخباراً لا منعاً", () => {
    const charge = t({ id: "c", category: "customer_credit", amount: 500, allocation: { group_id: "g1" } });
    const used = t({ id: "u", category: "customer_credit", amount: -200, allocation: { group_id: "g1" } });
    const caps = movementCapabilities(charge, [charge, used]);
    expect(caps.canDelete).toBe(true);
    expect(caps.deleteBlockedBy).toBeNull();
    expect(caps.deleteWarning).toBe("explicit_consumption");
    expect(caps.canEdit).toBe(true);
    expect(caps.editBlockedBy).toBeNull();
  });

  it("لا شحنة مقفلة عن الحذف مهما كان استهلاكها", () => {
    const cases = [
      [t({ id: "a", category: "customer_credit", amount: 500, allocation: { group_id: "g" } }),
       t({ id: "b", category: "customer_credit", amount: -500, allocation: { group_id: "g" } })],
      [t({ id: "c", category: "customer_credit", amount: 100 }),
       t({ id: "d", category: "customer_credit", amount: -90 })],
    ];
    for (const rows of cases) {
      expect(movementCapabilities(rows[0], rows).canDelete).toBe(true);
    }
  });

  it("كل سبب منع له رسالة عربية", () => {
    const reasons = [
      "credit_consumption", "no_linked_invoice", "no_charge_group",
      "explicit_consumption", "insufficient_remaining_credit", "not_supported",
    ] as const;
    for (const r of reasons) {
      expect(BLOCK_MESSAGE[r]).toBeTruthy();
      expect(BLOCK_MESSAGE[r].length).toBeGreaterThan(10);
    }
  });

  it("actionableMovements تُرجع ما يمكن فعل شيء به فقط، الأحدث أولاً", () => {
    const rows = [
      t({ id: "old", category: "customer_payment", method: "cash", reference_id: "i", date: "2026-01-01" }),
      t({ id: "new", category: "customer_payment", method: "cash", reference_id: "i", date: "2026-03-01" }),
      t({ id: "consume", category: "customer_credit", amount: -50, date: "2026-02-01" }),
    ];
    const out = actionableMovements(rows);
    expect(out.map((r) => r.tx.id)).toEqual(["new", "old"]);
  });
});
