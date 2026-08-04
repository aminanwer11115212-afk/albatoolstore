/**
 * الخصم اليدوي على حساب العميل — «شحن رصيد بالسالب ليكون عليه».
 *
 * ## المنطق الجديد كما طلبه صاحب المستودع
 * يُكتب المبلغ **سالباً** في شاشة شحن الرصيد فيصير خصماً يزيد دَين العميل،
 * بدل رصيدٍ له. وكان مرفوضاً بـ«أدخل مبلغاً صحيحاً».
 *
 * ## المسار الذي يقطعه هذا الملف
 * الشاشة ← القيد المكتوب ← تصنيفه ← كشف الحساب ← الأثر على الرصيد ← رسالة
 * الواتساب. فالعطل هنا لا يظهر في دالّةٍ منعزلة: الخصم قد يُكتب صحيحاً ثم
 * يقرأه الكشف «استهلاك رصيد» بأثرٍ صفري — وهو ما يحرسه أكثر ما هنا.
 */
import { describe, it, expect } from "vitest";
import {
  buildManualDebitPayload,
  isCustomerDebitAmount,
  netAfterDebit,
  MANUAL_DEBIT_KIND,
} from "@/utils/customerDebitEntry";
import { classifyCreditRow } from "@/utils/creditSource";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";
import { buildCustomerLedger } from "@/utils/buildCustomerLedger";
import { buildChargeWhatsAppMessage } from "@/utils/chargeWhatsAppMessage";

const debitRow = (amount: number, over: Record<string, any> = {}) => ({
  id: "d1",
  ...buildManualDebitPayload({
    customerId: "c1", amount, date: "2026-08-04", method: "cash",
    accountId: "acc1", referenceNo: null,
  }),
  created_at: "2026-08-04T10:00:00Z",
  ...over,
});

/* ─────────── 1) القيد المكتوب ─────────── */

describe("القيد المكتوب", () => {
  const row = buildManualDebitPayload({
    customerId: "c1", amount: -5000, date: "2026-08-04", method: "cash",
    accountId: "acc1", referenceNo: " TRX-9 ",
  });

  it("فئته `customer_credit` — نفس فئة الشحن، والإشارة هي الفارق", () => {
    expect(row.category).toBe("customer_credit");
  });

  it("والمبلغ سالبٌ كما أُدخل — لا يُقلَب ولا يُؤخذ مطلقه", () => {
    expect(row.amount).toBe(-5000);
  });

  it("ووسمُ الخصم صريح — بدونه يُقرأ استهلاكَ رصيد", () => {
    expect(row.allocation.kind).toBe(MANUAL_DEBIT_KIND);
  });

  it("ورقم العملية يُلحق بالوصف مشذّباً", () => {
    expect(row.description).toBe("خصم على حساب العميل — TRX-9");
  });

  it("وبلا رقمٍ يبقى اللفظ وحده", () => {
    const bare = buildManualDebitPayload({ customerId: "c1", amount: -1, date: "2026-08-04", method: "cash" });
    expect(bare.description).toBe("خصم على حساب العميل");
  });

  it("`isCustomerDebitAmount` يفرّق بالإشارة لا بغيرها", () => {
    expect(isCustomerDebitAmount(-1)).toBe(true);
    expect(isCustomerDebitAmount(0)).toBe(false);
    expect(isCustomerDebitAmount(1)).toBe(false);
    expect(isCustomerDebitAmount("-3")).toBe(true);
  });
});

/* ─────────── 2) التصنيف ─────────── */

describe("التصنيف يفرّق الخصم عن استهلاك الرصيد", () => {
  it("الخصم اليدوي يُصنَّف `manual_debit`", () => {
    expect(classifyCreditRow(debitRow(-5000) as any).source).toBe("manual_debit");
  });

  it("واستهلاك الرصيد يبقى `credit_used` — لم يتغيّر", () => {
    const used = { category: "customer_credit", amount: -5000, allocation: { kind: "credit_used" }, description: "استخدام رصيد دائن" };
    expect(classifyCreditRow(used).source).toBe("credit_used");
  });

  it("والسالب بلا وسمٍ يبقى استهلاكاً — البيانات القديمة على حالها", () => {
    expect(classifyCreditRow({ category: "customer_credit", amount: -5000 }).source).toBe("credit_used");
  });

  it("والشحن الموجب لم يُمسّ", () => {
    expect(classifyCreditRow({ category: "customer_credit", amount: 5000, description: "شحن رصيد" }).source).toBe("manual_charge");
  });
});

/* ─────────── 3) كشف الحساب ─────────── */

describe("كشف الحساب يقرؤه خصماً لا استهلاكاً", () => {
  const view = (rows: any[]) => buildCustomerAccountView({
    invoices: [], transactions: rows, accountNameById: new Map(), netBalance: 5000,
  } as any);

  it("أثره زيادةُ الدَّين لا صفر", () => {
    const out: any = view([debitRow(-5000)]);
    const all = JSON.stringify(out);
    expect(all).toContain("خصم على حساب العميل");
    // لا يُقرأ سداداً من الرصيد
    expect(all).not.toContain("سداد من رصيد العميل");
    // والأثر موجب: عليه 5,000 — لا صفر كما يفعل استهلاك الرصيد
    expect(all).toContain('"effect":5000');
    expect(all).not.toContain('"kind":"credit_settle"');
  });

  it("ودفتر الحركات يسجّله مديناً", () => {
    const ledger = buildCustomerLedger({
      invoices: [], transactions: [debitRow(-5000)], accountNameById: new Map(),
    } as any);
    const ev = (ledger.events || []).find((e: any) => String(e.id).includes("d1"))!;
    expect(ev).toBeTruthy();
    expect(ev.kind).not.toBe("credit_used");
    expect(ev.debit).toBe(5000);
  });

  it("واستهلاك الرصيد الحقيقي ما زال يُدمج كما كان", () => {
    const used = {
      id: "u1", category: "customer_credit", amount: -3000, date: "2026-08-04",
      created_at: "2026-08-04T10:00:00Z", allocation: { kind: "credit_used" },
      description: "استخدام رصيد دائن",
    };
    expect(JSON.stringify(view([used]))).toContain("سداد من رصيد العميل");
  });
});

/* ─────────── 4) الأثر على الرصيد ─────────── */

/**
 * القاعدة تحسب `credit_balance = Σ amount` لقيود `customer_credit`، و
 * `net_balance = balance − credit_balance`. فالخصم السالب يُنقص الرصيد
 * فيرفع الصافي — وهذه الحسبة نفسها تُعرض قبل الحفظ.
 */
describe("الأثر على صافي الحساب — موجب = عليه", () => {
  it("عليه 200,000 ثم خصم 5,000 ⇒ عليه 205,000", () => {
    expect(netAfterDebit(200_000, -5_000)).toBe(205_000);
  });

  it("وله 3,000 ثم خصم 10,000 ⇒ عليه 7,000", () => {
    expect(netAfterDebit(-3_000, -10_000)).toBe(7_000);
  });

  it("والشحن الموجب ما زال يُنقص الدَّين", () => {
    expect(netAfterDebit(200_000, 50_000)).toBe(150_000);
  });

  it("ومحاكاة حساب القاعدة تعطي الرقم نفسه", () => {
    // balance = 200,000 ، وقيدان: شحن 20,000 وخصم −5,000
    const balance = 200_000;
    const creditBalance = 20_000 + -5_000;
    expect(balance - creditBalance).toBe(185_000);
    expect(netAfterDebit(netAfterDebit(balance, 20_000), -5_000)).toBe(185_000);
  });
});

/* ─────────── 5) الرسالة ─────────── */

describe("رسالة العميل تقول «تم خصم»", () => {
  const msg = buildChargeWhatsAppMessage({
    customerName: "عميل", amount: -5_000, netBefore: 200_000, date: "2026-08-04",
  });

  it("سطر المبلغ خصمٌ لا شحن", () => {
    expect(msg).toContain("➖ تم خصم: 5,000");
    expect(msg).not.toContain("تم شحن");
  });

  it("والمتبقي عليه يزيد", () => {
    expect(msg).toContain("📌 المتبقي عليك: 205,000");
  });
});

/* ─────────── 6) العقد الذي لا يُخرق ─────────── */

/**
 * الشحن يُخزَّن ولا يُوزَّع (راجع CLAUDE.md). والخصم كذلك: قيدٌ واحد لا يمسّ
 * فاتورةً ولا يغيّر حالتها.
 */
describe("الخصم لا يُوزَّع على فاتورة", () => {
  const row = buildManualDebitPayload({ customerId: "c1", amount: -5000, date: "2026-08-04", method: "cash" });

  it("بلا `reference_id` — غير مرتبطٍ بفاتورة", () => {
    expect(row.reference_id).toBeUndefined();
  });

  it("ولا يحمل حقول سدادٍ لفاتورة", () => {
    expect(row).not.toHaveProperty("paid_amount");
    expect(row).not.toHaveProperty("invoice_id");
  });
});
