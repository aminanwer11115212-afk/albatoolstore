import { describe, it, expect } from "vitest";
import {
  SETTLE_EPS,
  autoAllocateFifo,
  round2,
  simulateSettlement,
  validateSettlement,
  type OpenInvoice,
} from "@/lib/creditSettlement";

/**
 * اختبارات «سداد فواتير من رصيد العميل» — مرآة منطق RPC settle_invoices_from_credit.
 * الثابت الحاكم: السداد من الرصيد لا يغيّر صافي حساب العميل إطلاقاً
 * (net = balance - credit يبقى كما هو قبل وبعد السداد).
 */

const inv = (id: string, date: string, total: number, paid: number): OpenInvoice => ({
  id,
  invoice_number: `INV-${id}`,
  date,
  total,
  paid_amount: paid,
  remaining: round2(Math.max(total - paid, 0)),
});

const byId = (list: OpenInvoice[]) => new Map(list.map((i) => [i.id, i]));

describe("autoAllocateFifo — التوزيع التلقائي الأقدم أولاً", () => {
  const invoices = [
    inv("b", "2026-02-01", 500, 0),   // متبقي 500
    inv("a", "2026-01-01", 300, 100), // متبقي 200 (الأقدم)
    inv("c", "2026-03-01", 400, 0),   // متبقي 400
  ];

  it("يملأ الأقدم أولاً حتى ينفد الرصيد", () => {
    const alloc = autoAllocateFifo(invoices, 600);
    expect(alloc.get("a")).toBe(200); // الأقدم كاملاً
    expect(alloc.get("b")).toBe(400); // الباقي 400 من 500
    expect(alloc.has("c")).toBe(false);
  });

  it("رصيد يغطي الكل → كل الفواتير تُسدَّد بالكامل", () => {
    const alloc = autoAllocateFifo(invoices, 2000);
    expect(alloc.get("a")).toBe(200);
    expect(alloc.get("b")).toBe(500);
    expect(alloc.get("c")).toBe(400);
    const total = Array.from(alloc.values()).reduce((s, v) => round2(s + v), 0);
    expect(total).toBe(1100); // مجموع المتبقي
  });

  it("رصيد صفر/سالب → لا توزيع", () => {
    expect(autoAllocateFifo(invoices, 0).size).toBe(0);
    expect(autoAllocateFifo(invoices, -50).size).toBe(0);
  });

  it("لا يتجاوز مجموع التوزيع الرصيد المتاح أبداً", () => {
    for (const credit of [1, 150, 199.99, 200.01, 555.5, 1099.99]) {
      const alloc = autoAllocateFifo(invoices, credit);
      const total = Array.from(alloc.values()).reduce((s, v) => round2(s + v), 0);
      expect(total).toBeLessThanOrEqual(credit + SETTLE_EPS);
    }
  });

  it("كسور عشرية (0.1+0.2) لا تسرّب انحرافاً", () => {
    const list = [inv("x", "2026-01-01", 0.3, 0)];
    const alloc = autoAllocateFifo(list, 0.1 + 0.2);
    expect(alloc.get("x")).toBe(0.3);
  });
});

describe("validateSettlement — قواعد ما قبل الإرسال (نفس قواعد الـ RPC)", () => {
  const invoices = [inv("a", "2026-01-01", 300, 100), inv("b", "2026-02-01", 500, 0)];
  const map = byId(invoices);

  it("قائمة فارغة مرفوضة", () => {
    expect(validateSettlement([], map, 1000)).toMatchObject({ ok: false, reason: "empty" });
  });

  it("مبلغ صفر أو سالب مرفوض", () => {
    expect(validateSettlement([{ invoice_id: "a", amount: 0 }], map, 1000)).toMatchObject({ ok: false, reason: "invalid_amount" });
    expect(validateSettlement([{ invoice_id: "a", amount: -5 }], map, 1000)).toMatchObject({ ok: false, reason: "invalid_amount" });
  });

  it("فاتورة غير معروفة مرفوضة", () => {
    expect(validateSettlement([{ invoice_id: "zzz", amount: 10 }], map, 1000)).toMatchObject({ ok: false, reason: "unknown_invoice" });
  });

  it("تجاوز المتبقي على الفاتورة مرفوض", () => {
    expect(validateSettlement([{ invoice_id: "a", amount: 200.5 }], map, 1000)).toMatchObject({ ok: false, reason: "exceeds_remaining" });
  });

  it("التكرارات تُجمَّع لنفس الفاتورة قبل فحص المتبقي (يمنع ازدواج السداد)", () => {
    // 150 + 100 = 250 > المتبقي 200 ⇒ يجب الرفض رغم أن كل مبلغ منفرداً ≤ المتبقي.
    const v = validateSettlement(
      [{ invoice_id: "a", amount: 150 }, { invoice_id: "a", amount: 100 }],
      map,
      1000,
    );
    expect(v).toMatchObject({ ok: false, reason: "exceeds_remaining" });
  });

  it("تجاوز الرصيد الدائن مرفوض", () => {
    const v = validateSettlement(
      [{ invoice_id: "a", amount: 200 }, { invoice_id: "b", amount: 500 }],
      map,
      600, // المجموع 700 > 600
    );
    expect(v).toMatchObject({ ok: false, reason: "exceeds_credit" });
  });

  it("طلب سليم يمرّ ويُرجع المجموع", () => {
    const v = validateSettlement(
      [{ invoice_id: "a", amount: 200 }, { invoice_id: "b", amount: 300 }],
      map,
      600,
    );
    expect(v).toEqual({ ok: true, total: 500 });
  });

  it("سماحية الكسور: المتبقي بالضبط والرصيد بالضبط يمرّان", () => {
    expect(validateSettlement([{ invoice_id: "a", amount: 200 }], map, 200)).toMatchObject({ ok: true });
  });
});

describe("simulateSettlement — الثابت المحاسبي: الصافي لا يتغيّر", () => {
  const invoices = [
    inv("a", "2026-01-01", 300, 100), // متبقي 200
    inv("b", "2026-02-01", 500, 0),   // متبقي 500
    inv("c", "2026-03-01", 400, 350), // متبقي 50
  ];
  // balance المخزَّن = Σ المتبقي (نفس معادلة recompute_customer_balance)
  const balance = 750;

  it("سداد كامل الرصيد: net قبل = net بعد تماماً", () => {
    const credit = 600;
    const sim = simulateSettlement(
      invoices,
      [{ invoice_id: "a", amount: 200 }, { invoice_id: "b", amount: 350 }, { invoice_id: "c", amount: 50 }],
      balance,
      credit,
    );
    expect(sim.appliedTotal).toBe(600);
    expect(sim.balanceAfter).toBe(150);  // 750 - 600
    expect(sim.creditAfter).toBe(0);     // 600 - 600
    expect(sim.netBefore).toBe(150);     // 750 - 600
    expect(sim.netAfter).toBe(150);      // 150 - 0
    expect(sim.netAfter).toBe(sim.netBefore); // ⭐ الثابت الحاكم
  });

  it("سداد جزئي: الصافي ثابت أيضاً", () => {
    const sim = simulateSettlement(invoices, [{ invoice_id: "b", amount: 123.45 }], balance, 200);
    expect(sim.appliedTotal).toBe(123.45);
    expect(sim.netAfter).toBe(sim.netBefore);
  });

  it("عميل رصيده الدائن أكبر من مديونيته: يبقى «له» بنفس الفارق", () => {
    const credit = 1000; // net = 750 - 1000 = -250 (له)
    const sim = simulateSettlement(
      invoices,
      [{ invoice_id: "a", amount: 200 }, { invoice_id: "b", amount: 500 }, { invoice_id: "c", amount: 50 }],
      balance,
      credit,
    );
    expect(sim.appliedTotal).toBe(750);
    expect(sim.balanceAfter).toBe(0);
    expect(sim.creditAfter).toBe(250);
    expect(sim.netBefore).toBe(-250);
    expect(sim.netAfter).toBe(-250);
  });

  it("حالات الفواتير بعد السداد: paid عند التغطية الكاملة و partial عند الجزئية", () => {
    const sim = simulateSettlement(
      invoices,
      [{ invoice_id: "a", amount: 200 }, { invoice_id: "b", amount: 100 }],
      balance,
      300,
    );
    const a = sim.perInvoice.find((p) => p.invoice_id === "a")!;
    const b = sim.perInvoice.find((p) => p.invoice_id === "b")!;
    expect(a.new_status).toBe("paid");
    expect(a.remaining_after).toBe(0);
    expect(b.new_status).toBe("partial");
    expect(b.remaining_after).toBe(400);
  });

  it("المطلوب فوق المتبقي يُقصّ على المتبقي (دفاع ضد السباق — نفس LEAST في الـ RPC)", () => {
    const sim = simulateSettlement(invoices, [{ invoice_id: "c", amount: 500 }], balance, 600);
    const c = sim.perInvoice.find((p) => p.invoice_id === "c")!;
    expect(c.applied).toBe(50); // المتبقي فقط
    expect(sim.netAfter).toBe(sim.netBefore);
  });

  it("كسور عشرية متراكمة عبر عدة فواتير: لا انحراف في الصافي", () => {
    const list = [
      inv("x", "2026-01-01", 123.45, 23.44),   // متبقي 100.01
      inv("y", "2026-01-02", 67.89, 0),         // متبقي 67.89
      inv("z", "2026-01-03", 999.99, 899.99),   // متبقي 100
    ];
    const bal = round2(100.01 + 67.89 + 100);
    const credit = 250.5;
    const alloc = autoAllocateFifo(list, credit);
    const items = Array.from(alloc.entries()).map(([invoice_id, amount]) => ({ invoice_id, amount }));
    const sim = simulateSettlement(list, items, bal, credit);
    expect(Math.abs(sim.netAfter - sim.netBefore)).toBeLessThanOrEqual(SETTLE_EPS);
    expect(sim.appliedTotal).toBeLessThanOrEqual(credit + SETTLE_EPS);
  });

  it("توزيع تلقائي ثم محاكاة: التركيبة الكاملة تحفظ الصافي دائماً (property check)", () => {
    for (const credit of [10, 99.99, 250, 500.5, 749.99, 750, 5000]) {
      const alloc = autoAllocateFifo(invoices, credit);
      const items = Array.from(alloc.entries()).map(([invoice_id, amount]) => ({ invoice_id, amount }));
      if (!items.length) continue;
      const v = validateSettlement(items, byId(invoices), credit);
      expect(v.ok, `credit=${credit} يجب أن يكون توزيعه صالحاً`).toBe(true);
      const sim = simulateSettlement(invoices, items, balance, credit);
      expect(Math.abs(sim.netAfter - sim.netBefore), `credit=${credit}`).toBeLessThanOrEqual(SETTLE_EPS);
    }
  });
});
