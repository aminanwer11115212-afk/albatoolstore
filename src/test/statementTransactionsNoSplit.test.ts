/**
 * جدول المعاملات في كشف الحساب: الدفعة سطرٌ واحد بالمبلغ المدفوع كاملاً.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع (بصورة)
 * فاتورةٌ بـ67,200 دُفع عليها 70,000. فظهر في «المعاملات» أسفل الكشف سطران:
 *
 *     دفعة على الفاتورة INV-74193 — رقم العملية: 6765   67,200
 *     فائض دفعة من الفاتورة INV-74193 — رصيد دائن        2,800
 *
 * وقال: «يظهر تفاصيل الفاتورة لكن لا يظهر أن الفاتورة كانت كذا ودفع كذا، بل
 * يظهر المبلغ المدفوع… في سطرٍ واحد دون تقسيمه».
 *
 * ## ولماذا وقع هنا بعد إصلاحه في شاشات المعاملات
 * القاعدة مطبَّقة في `TransactionsPage` و`FilteredTransactionsPage`
 * و`CustomerChargeHistory` — وبقي هذا الجدول خارجها. وهو النمط نفسه الذي
 * يتكرّر في هذا المشروع: يُصلَح موضعٌ ويبقى توأمه، فيرى المستخدم العطل
 * «عائداً» وهو لم يُصلَح أصلاً في مكانه.
 *
 * ## وترتيب المرشِّحات هو الإصلاح
 * الضمّ **قبل** مرشِّحات المبلغ والمصدر والنوع لا بعدها: لو رُشِّح أوّلاً لسقط
 * أحد القيدين أحياناً فتعذّر إقرانه بالآخر، فعاد الفائض سطراً وحده. وهذا ما
 * يفحصه القسم الأخير صراحةً.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { foldOverpayTransactions } from "@/utils/paymentDisplay";
import { classifyCreditRow } from "@/utils/creditSource";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const STATEMENT = "src/pages/CustomerStatementPage.tsx";

/** القيدان كما تكتبهما القاعدة لدفعةٍ زائدة — نفس أرقام صورة صاحب المستودع. */
const PAYMENT = {
  id: "tx-pay",
  category: "customer_payment",
  type: "income",
  amount: 67200,
  date: "2026-08-05",
  reference_id: "inv-1",
  description: "دفعة على الفاتورة INV-74193 — رقم العملية: 6765",
};
const SURPLUS = {
  id: "tx-over",
  category: "customer_credit",
  type: "income",
  amount: 2800,
  date: "2026-08-05",
  reference_id: "inv-1",
  description: "فائض دفعة من الفاتورة INV-74193 — رصيد دائن",
  allocation: { kind: "overpay", invoice_id: "inv-1", payment_id: "tx-pay" },
};

const fold = (rows: any[]) =>
  foldOverpayTransactions(rows, (t: any) => classifyCreditRow(t).source === "overpay_invoice");

describe("سطرٌ واحد بالمبلغ المدفوع", () => {
  const rows = fold([PAYMENT, SURPLUS]);

  it("سطران يصيران سطراً", () => {
    expect(rows).toHaveLength(1);
  });

  it("والمبلغ هو المدفوع كاملاً لا المطبَّق على الفاتورة", () => {
    expect(Number(rows[0].amount)).toBeCloseTo(70000, 2);
  });

  it("والسطر الباقي هو الدفعة لا الفائض", () => {
    expect(rows[0].id).toBe("tx-pay");
    expect(rows[0].category).toBe("customer_payment");
  });

  it("ولا يبقى للفائض ذكرٌ سطراً مستقلاً", () => {
    expect(rows.some((r: any) => r.id === "tx-over")).toBe(false);
    expect(rows.map((r: any) => r.description).join(" ")).not.toContain("فائض دفعة");
  });

  it("والفائض محفوظٌ في السطر لمن أراد تفصيله — لا يضيع", () => {
    expect(Number((rows[0] as any).overpaySurplus)).toBeCloseTo(2800, 2);
    expect(Number((rows[0] as any).overpayApplied)).toBeCloseTo(67200, 2);
  });
});

describe("وما ليس فائضاً لا يُمسّ", () => {
  it("دفعةٌ مطابقةٌ للفاتورة تبقى كما هي", () => {
    const exact = { ...PAYMENT, amount: 67200 };
    expect(fold([exact])).toHaveLength(1);
    expect(Number(fold([exact])[0].amount)).toBe(67200);
  });

  it("وشحنُ رصيدٍ مستقلّ يبقى سطره", () => {
    const charge = {
      id: "tx-charge", category: "customer_credit", type: "income",
      amount: 5000, date: "2026-08-05", description: "شحن رصيد",
    };
    const rows = fold([PAYMENT, charge]);
    expect(rows).toHaveLength(2);
    expect(rows.some((r: any) => r.id === "tx-charge")).toBe(true);
  });

  it("ودفعتان لفاتورتين لا تختلطان", () => {
    const other = { ...PAYMENT, id: "tx-pay-2", reference_id: "inv-2", amount: 1000 };
    const rows = fold([PAYMENT, SURPLUS, other]);
    expect(rows).toHaveLength(2);
    expect(Number(rows.find((r: any) => r.id === "tx-pay")!.amount)).toBeCloseTo(70000, 2);
    expect(Number(rows.find((r: any) => r.id === "tx-pay-2")!.amount)).toBe(1000);
  });
});

/* ─────────── الشاشة نفسها ─────────── */

describe("كشف الحساب يضمّ قبل أن يُرشِّح", () => {
  const src = read(STATEMENT);
  const block = src.slice(src.indexOf("const filteredTransactions"), src.indexOf("const toggleTxSort"));

  it("الشاشة تستدعي الضمّ — لا نسخةً محلّية للمنطق", () => {
    expect(src).toContain('from "@/utils/paymentDisplay"');
    expect(block).toContain("foldOverpayTransactions(");
  });

  it("والفائض يُعرف بمصدره لا بنصّ وصفه", () => {
    // مطابقةُ الوصف تنكسر بأوّل تعديلٍ على صياغته
    expect(block).toContain('classifyCreditRow(t).source === "overpay_invoice"');
    expect(block).not.toContain("فائض دفعة");
  });

  it("والضمّ قبل مرشِّحات المبلغ والمصدر والنوع", () => {
    const foldAt = block.indexOf("foldOverpayTransactions(");
    for (const marker of ["minAmount", "creditSourceFilter.size", "txTypeFilter !== \"all\""]) {
      expect(block.indexOf(marker), `المرشِّح ${marker} قبل الضمّ`).toBeGreaterThan(foldAt);
    }
  });

  it("ومرشِّح المدى قبله — الضمّ داخل الفترة لا عبرها", () => {
    const foldAt = block.indexOf("foldOverpayTransactions(");
    expect(block.indexOf("fromDate && t.date < fromDate")).toBeLessThan(foldAt);
  });
});

/**
 * القاعدة واحدة في النظام كلّه — وهذا ما يمنع عودتها في الموضع الرابع.
 */
describe("كل جدولٍ يعرض المعاملات يضمّ", () => {
  const TABLES = [
    "src/pages/TransactionsPage.tsx",
    "src/pages/FilteredTransactionsPage.tsx",
    "src/components/CustomerChargeHistory.tsx",
    "src/pages/CustomerStatementPage.tsx",
  ];

  it.each(TABLES)("%s", (file) => {
    expect(read(file)).toContain("foldOverpayTransactions");
  });
});
