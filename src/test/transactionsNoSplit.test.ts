/**
 * الدفعة الزائدة **لا تُقسم في جدول المعاملات أبداً**.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * دفعةُ 5,000 على فاتورةٍ قيمتها 4,000 تُكتب في القاعدة قيدَين — وهذا صحيحٌ
 * محاسبياً: `customer_payment` بـ4,000 يُقفل الفاتورة، و`customer_credit`
 * بـ1,000 يرفع رصيد العميل. لكنّ **جدول المعاملات** كان يعرض القيدين سطرَين،
 * فتبدو عمليةٌ واحدة عمليتين، ويُقرأ الرقم مرّتين.
 *
 * ## القاعدة
 * الدفاتر لا تُلمس — القيدان في القاعدة كما هما، والرصيد بحاله. الدمج عرضٌ
 * فقط، **ومحفوظ الجمع**: مجموع أي عمود قبل الدمج = مجموعه بعده. وأهمّ من
 * ذلك: المبلغ المدموج رقمٌ يُقرأ لا يُكتب — من يعيده إلى القاعدة يُفسد
 * الفاتورة، ولذلك يحمل السطر `overpayApplied` لكل كاتب.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { foldOverpayTransactions, overpaySurplusNote, indexLinkedOverpay } from "@/utils/paymentDisplay";
import { classifyCreditRow } from "@/utils/creditSource";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const isOverpay = (t: any) => classifyCreditRow(t).source === "overpay_invoice";
const fold = (rows: any[]) => foldOverpayTransactions(rows, isOverpay);
const sum = (rows: any[], k = "amount") => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

/** دفعة 5,000 على فاتورة 4,000 — مثال المستخدم حرفياً. */
const split5000 = [
  {
    id: "p1", type: "income", category: "customer_payment", amount: 4000, debit: 4000,
    reference_id: "inv-1", customer_id: "c1", date: "2026-08-02",
    created_at: "2026-08-02T10:00:00Z", description: "دفعة على الفاتورة INV-49417",
  },
  {
    id: "c1x", type: "income", category: "customer_credit", amount: 1000, debit: 1000,
    reference_id: "inv-1", customer_id: "c1", date: "2026-08-02",
    created_at: "2026-08-02T10:00:01Z", description: "فائض دفعة من الفاتورة INV-49417 — رصيد دائن",
    allocation: { kind: "overpay_surplus", invoice_id: "inv-1", invoice_number: "INV-49417" },
  },
];

describe("سطرٌ واحد لا سطران", () => {
  const out = fold(split5000);

  it("العملية الواحدة سطرٌ واحد", () => {
    expect(out).toHaveLength(1);
  });

  it("بالمبلغ الذي دفعه العميل فعلاً: 5,000", () => {
    expect(out[0].amount).toBe(5000);
  });

  it("وقيد الفائض لا يظهر سطراً مستقلاً", () => {
    expect(out.some((r: any) => r.id === "c1x")).toBe(false);
  });

  it("والفائض معلومٌ للعرض: 1,000", () => {
    expect(out[0].overpaySurplus).toBe(1000);
    expect(overpaySurplusNote(out[0].overpaySurplus)).toContain("1,000");
  });

  it("عمود «مدين» يتبع المبلغ — وإلا عاد الرقم مقسوماً من بابٍ آخر", () => {
    expect(out[0].debit).toBe(5000);
  });

  it("المجموع محفوظ: 4,000 + 1,000 = 5,000", () => {
    expect(sum(out)).toBe(sum(split5000));
    expect(sum(out, "debit")).toBe(sum(split5000, "debit"));
  });
});

describe("المبلغ المدموج يُقرأ ولا يُكتب", () => {
  it("`overpayApplied` يحفظ ما في القاعدة: 4,000", () => {
    const out = fold(split5000);
    expect(out[0].overpayApplied).toBe(4000);
  });

  it("وحوار تعديل الدفعة يأخذ منه لا من المبلغ المعروض", () => {
    const src = read("src/pages/TransactionsPage.tsx");
    expect(src).toMatch(/amount: Number\(t\.overpayApplied \?\? t\.amount \?\? 0\)/);
  });
});

describe("ما لا يُدمج", () => {
  it("شحن الرصيد اليدوي سطرٌ مستقل — ليس فائض دفعة", () => {
    const rows = [
      { id: "p", type: "income", category: "customer_payment", amount: 4000, reference_id: "inv-1", created_at: "2026-08-02T10:00:00Z" },
      { id: "ch", type: "income", category: "customer_credit", amount: 1000, reference_id: "inv-1", created_at: "2026-08-02T10:00:01Z", description: "شحن رصيد للعميل", allocation: { kind: "surplus" } },
    ];
    expect(fold(rows)).toHaveLength(2);
  });

  it("استهلاك الرصيد (مبلغ سالب) لا يُضمّ", () => {
    const rows = [
      { id: "p", type: "income", category: "customer_payment", amount: 4000, reference_id: "inv-1", created_at: "2026-08-02T10:00:00Z" },
      { id: "u", type: "income", category: "customer_credit", amount: -1000, reference_id: "inv-1", created_at: "2026-08-02T10:00:01Z", description: "استخدام رصيد دائن" },
    ];
    expect(fold(rows)).toHaveLength(2);
  });

  it("فائضٌ بلا دفعةٍ تقابله يبقى سطره — لا يضيع المبلغ", () => {
    const orphan = [split5000[1]];
    const out = fold(orphan);
    expect(out).toHaveLength(1);
    expect(sum(out)).toBe(1000);
  });

  it("جدولٌ بلا فائضٍ أصلاً يعود كما هو", () => {
    const rows = [{ id: "a", type: "expense", amount: 300, credit: 300, description: "إيجار" }];
    expect(fold(rows)).toEqual(rows);
  });
});

/**
 * فاتورة 4,000 دُفعت 2,000 ثم 3,000: الفائض 1,000 من الثانية وحدها.
 * ولو نُسب إلى الفاتورة لضُخِّم السطران معاً — 3,000 و4,000 — ومجموعهما
 * 7,000 على فاتورةٍ دُفع فيها 5,000.
 */
describe("دفعتان على فاتورة واحدة", () => {
  const rows = [
    { id: "p1", type: "income", category: "customer_payment", amount: 2000, debit: 2000, reference_id: "inv-1", created_at: "2026-08-01T09:00:00Z" },
    { id: "p2", type: "income", category: "customer_payment", amount: 2000, debit: 2000, reference_id: "inv-1", created_at: "2026-08-02T09:00:00Z" },
    { id: "cr", type: "income", category: "customer_credit", amount: 1000, debit: 1000, reference_id: "inv-1", created_at: "2026-08-02T09:00:01Z", description: "فائض دفعة من الفاتورة INV-1" },
  ];
  const out = fold(rows);

  it("سطران لا ثلاثة", () => {
    expect(out).toHaveLength(2);
  });

  it("الفائض للدفعة الثانية وحدها", () => {
    expect(out.find((r: any) => r.id === "p1")!.amount).toBe(2000);
    expect(out.find((r: any) => r.id === "p2")!.amount).toBe(3000);
  });

  it("والمجموع 5,000 لا 7,000", () => {
    expect(sum(out)).toBe(5000);
  });
});

/**
 * مسار الدفع السريع في صفحة الفاتورة كان يكتب قيد الدفعة **بلا فئة**، فبقيت
 * دفعاتٌ في القاعدة لا يعرفها أحد دفعةً. تُزاوَج هنا بأثرها (إيراد مرتبط
 * بفاتورة)، وأُصلح المصدر فلا تتكرّر.
 */
describe("الدفعات القديمة بلا فئة", () => {
  it("تُزاوَج بفائضها فلا تبقى مقسومة", () => {
    const rows = [
      { id: "p", type: "income", amount: 4000, reference_id: "inv-9", created_at: "2026-05-01T10:00:00Z", description: "دفعة" },
      { id: "c", type: "income", category: "customer_credit", amount: 1000, reference_id: "inv-9", created_at: "2026-05-01T10:00:01Z", description: "فائض دفعة فاتورة INV-9 - سلفة عميل" },
    ];
    const out = fold(rows);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(5000);
  });

  it("والمصدر أُصلح: صفحة الفاتورة تكتب الفئة صراحةً", () => {
    const src = read("src/pages/InvoiceViewPage.tsx");
    expect(src).toContain('category: "customer_payment"');
  });
});

describe("كشف الحساب لم يتغيّر — `indexLinkedOverpay` على عهده", () => {
  it("يُرجع الخريطة نفسها التي تبني عليها الكشوف", () => {
    const map = indexLinkedOverpay(split5000, isOverpay);
    expect(map.get("p1")).toBe(1000);
    expect(map.size).toBe(1);
  });
});

/** الشاشتان اللتان تعرضان العمليات تمرّان من الدمج — لا واحدةٌ دون أخرى. */
describe("كل جداول العمليات تدمج", () => {
  it.each(["src/pages/TransactionsPage.tsx", "src/pages/FilteredTransactionsPage.tsx"])(
    "%s",
    (file) => {
      const src = read(file);
      expect(src).toContain("foldOverpayTransactions");
      // الدمج قبل البحث والتقسيم إلى صفحات، وإلا افترق القيدان بين صفحتين
      expect(src.indexOf("foldOverpayTransactions")).toBeLessThan(src.indexOf("perPage"));
    },
  );
});
