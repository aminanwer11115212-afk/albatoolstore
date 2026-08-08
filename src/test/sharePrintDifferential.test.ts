/**
 * تطابقُ ورقةِ العميل وورقةِ المستخدم — يُقاس بالكنس لا بالعين.
 *
 * ## لماذا هذا الفحص موجود
 * المنطقُ المالي مكتوبٌ **مرّتين** عمداً: مرّةً في `src/utils/printTemplate.ts`
 * للطباعة والمعاينة وواتساب PDF، ومرّةً في
 * `supabase/functions/document-share/template.ts` للرابط العام الذي يفتحه
 * العميل. والازدواج ليس اختياراً: دالّةُ الحافّة لا تستورد من `src/`.
 *
 * فما دام نسختان، فالسؤال ليس «هل نُقلت الصيغة صحيحةً اليوم» بل «هل تبقى
 * كذلك غداً». والقراءةُ لا تجيب: النسختان متشابهتان بما يكفي ليمرّ الفرقُ من
 * العين. فيُكنس فضاءُ المدخلات ويُقارن كلُّ صفٍّ من ملخّص الحساب.
 *
 * وهذا الكنسُ هو ما كشف الفرقَ الوحيد الباقي فعلاً: `invoiceValue` كانت تقرأ
 * `subtotal` في ورقة العميل و`subtotal + shipping` في ورقة المستخدم. ولم
 * يظهر في الحالات المتّسقة — لأن `grandTotal + discount` يساويهما معاً حين
 * تكون `total` محسوبةً صحيحة — بل ظهر حين ينحرف الصفّ. أي أنه عطلٌ نائم:
 * صحيحٌ في الاختبار المصنوع، خاطئٌ على صفٍّ حقيقي فيه شحن.
 *
 * ونفسُ المنطق يسري على إعادة تشغيل السجلّ: `netBeforeInvoice` في التطبيق
 * و`netBeforeInvoiceEdge` في الحافّة.
 */
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildDocHTML, netBeforeInvoiceEdge } from "../../supabase/functions/document-share/template";
import { netBeforeInvoice } from "@/utils/customerNetBefore";

/** صفوف ملخّص الحساب التي يجب أن تتطابق حرفاً بحرف. */
const SECTIONS = [
  "invoice-value", "discount-row", "prev-account-row",
  "majmoo-row", "paid-amount", "final-total",
] as const;

function cell(html: string, section: string): string | null {
  const m = html.match(
    new RegExp(`data-section="${section}"[\\s\\S]*?class="summary-box-value"[^>]*>([^<]*)<`),
  );
  return m ? m[1].trim() : null;
}

/** مولّد حتمي — الفشل يُعاد إنتاجه بنفس البذرة. */
function seeded(seed: number) {
  let s = seed;
  const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return { next, pick: <T,>(a: readonly T[]): T => a[Math.floor(next() * a.length)] };
}

interface Scenario {
  subtotal: number; discountTotal: number; shipping: number; grandTotal: number;
  paidAmount: number; previousDebt: number; previousCredit: number;
  currentNet: number | null; isQuote: boolean;
}

function bothSheets(o: Scenario) {
  const print = generatePrintHTML({
    type: o.isQuote ? "quote" : "invoice",
    number: "DOC-1", date: "2026-08-08", customer: { name: "عميل" }, items: [],
    taxTotal: 0, company: {},
    subtotal: o.subtotal, discountTotal: o.discountTotal, shipping: o.shipping,
    grandTotal: o.grandTotal, paidAmount: o.paidAmount,
    previousDebt: o.previousDebt, previousCredit: o.previousCredit, currentNet: o.currentNet,
  } as any);
  const share = buildDocHTML({
    docTitle: o.isQuote ? "عرض سعر" : "فاتورة مبيعات",
    docNumber: "DOC-1", date: "2026-08-08", customer: { name: "عميل" }, items: [], company: {},
    subtotal: o.subtotal, discountTotal: o.discountTotal, shipping: o.shipping,
    grandTotal: o.grandTotal, paidAmount: o.paidAmount,
    previousDebt: o.previousDebt, previousCredit: o.previousCredit, currentNet: o.currentNet,
    isQuote: o.isQuote,
  } as any);
  return { print, share };
}

describe("ملخّص الحساب: ورقة المستخدم وورقة العميل", () => {
  /**
   * `grandTotal` تُولَّد أحياناً منحرفةً عن `subtotal − discount + shipping`
   * عمداً. فالصفوف المنحرفة موجودة في القاعدة فعلاً — وهي بالضبط ما يكشف
   * فرقاً تُخفيه الحالاتُ المتّسقة.
   */
  it("٥٠٠٠ حالة: كل صفٍّ متطابق حرفياً", () => {
    const { pick, next } = seeded(20260808);
    const diffs: Array<{ scenario: Scenario; section: string; print: string | null; share: string | null }> = [];

    for (let i = 0; i < 5000; i++) {
      const subtotal = pick([0, 300, 1000, 123.45, 500_000]);
      const discountTotal = pick([0, 50, 100.5, 25_600]);
      const shipping = pick([0, 0, 250, 1_200.75]);
      const consistent = Math.round((subtotal - discountTotal + shipping) * 100) / 100;
      const scenario: Scenario = {
        subtotal, discountTotal, shipping,
        // منحرفة أحياناً — راجع التعليق أعلاه
        grandTotal: pick([consistent, consistent, subtotal, 999]),
        paidAmount: pick([0, 100, 400, 1500, 600_000]),
        previousDebt: pick([0, 200_000, 25_600, 47_740]),
        previousCredit: pick([0, 25_600, 47_740]),
        currentNet: pick([null, 0, 100_000, -100, -47_740]),
        isQuote: next() < 0.25,
      };
      const { print, share } = bothSheets(scenario);
      for (const section of SECTIONS) {
        const a = cell(print, section);
        const b = cell(share, section);
        if (a !== b) diffs.push({ scenario, section, print: a, share: b });
      }
    }

    const summary = diffs.slice(0, 3).map((d) =>
      `${d.section}: الطباعة «${d.print}» ≠ الرابط «${d.share}» — ${JSON.stringify(d.scenario)}`,
    );
    expect({ count: diffs.length, summary }).toEqual({ count: 0, summary: [] });
  });

  it("الشحن يدخل «قيمة الفاتورة» في الورقتين — العطل الذي كشفه الكنس", () => {
    // صفٌّ منحرف: `total` لا تحمل الشحن. قبل الإصلاح كانت ورقة العميل تنقص
    // 250 عن ورقة المستخدم في هذا السطر وحده.
    const scenario: Scenario = {
      subtotal: 1000, discountTotal: 0, shipping: 250, grandTotal: 1000,
      paidAmount: 0, previousDebt: 0, previousCredit: 0, currentNet: null, isQuote: false,
    };
    const { print, share } = bothSheets(scenario);
    expect(cell(print, "invoice-value")).toBe("1,250");
    expect(cell(share, "invoice-value")).toBe("1,250");
  });

  it("حالة صاحب المحلّ: 600,000 على فاتورة 500,000 وقديمٍ 200,000", () => {
    const scenario: Scenario = {
      subtotal: 500_000, discountTotal: 0, shipping: 0, grandTotal: 500_000,
      paidAmount: 0, previousDebt: 200_000, previousCredit: 0,
      currentNet: 100_000, isQuote: false,
    };
    const { print, share } = bothSheets(scenario);
    for (const [label, html] of [["print", print], ["share", share]] as const) {
      expect({ label, v: cell(html, "prev-account-row") }).toEqual({ label, v: "−200,000" });
      expect({ label, v: cell(html, "majmoo-row") }).toEqual({ label, v: "700,000" });
      // «المدفوع» يُشتقّ من الرصيد لا من توزيع الدفعة على الفواتير
      expect({ label, v: cell(html, "paid-amount") }).toEqual({ label, v: "600,000" });
      expect({ label, v: cell(html, "final-total") }).toEqual({ label, v: "−100,000" });
    }
  });

  it("الفائض يصل العميل `+` أخضر — لا صفراً مقصوصاً", () => {
    const scenario: Scenario = {
      subtotal: 300, discountTotal: 0, shipping: 0, grandTotal: 300,
      paidAmount: 400, previousDebt: 0, previousCredit: 0, currentNet: -100, isQuote: false,
    };
    const { print, share } = bothSheets(scenario);
    expect(cell(print, "final-total")).toBe("+100");
    expect(cell(share, "final-total")).toBe("+100");
    expect(share).toMatch(/data-section="final-total"[^>]*color:#16a34a/);
  });
});

describe("إعادة تشغيل سجلّ الحساب: التطبيق والحافّة", () => {
  /**
   * `netBeforeInvoice` و`netBeforeInvoiceEdge` نسختان من نفس الخوارزمية.
   * ومنهما يخرج «الحساب القديم» على الورقتين — فاختلافُهما اختلافٌ في المال.
   */
  it("٣٠٠٠ سجلّ عشوائي: نفس الصافي", () => {
    const { pick } = seeded(776);
    const diffs: unknown[] = [];

    for (let i = 0; i < 3000; i++) {
      const invoiceCount = 1 + Math.floor(pick([0, 1, 2, 3]) as number);
      const invoices = Array.from({ length: invoiceCount }, (_, k) => ({
        id: `inv${k}`,
        total: pick([100, 500, 1000, 123.45]),
        paid_amount: pick([0, 100, 500]),
        status: pick(["pending", "paid", "partial", "cancelled"]),
        date: pick(["2026-01-01", "2026-02-01", "2026-03-01"]),
        created_at: pick([null, "2026-01-15T08:00:00Z", "2026-02-01T10:00:00Z"]),
      }));
      const txCount = Math.floor(pick([0, 1, 2, 3, 4]) as number);
      const transactions = Array.from({ length: txCount }, (_, k) => ({
        id: `tx${k}`,
        category: pick(["customer_payment", "customer_credit"]),
        amount: pick([100, -100, 250, 500, -250]),
        method: pick([null, "cash", "bank", "credit_balance"]),
        reference_id: pick([null, "inv0", "inv1"]),
        date: pick(["2026-01-01", "2026-02-01", "2026-03-01"]),
        created_at: pick([null, "2026-02-01T09:00:00Z"]),
      }));
      const target = `inv${Math.floor(pick([0, 0, 1]) as number)}`;

      const app = netBeforeInvoice(target, { invoices, transactions });
      const edge = netBeforeInvoiceEdge(target, invoices, transactions);
      if (app !== edge) diffs.push({ target, app, edge, invoices, transactions });
    }

    expect({ count: diffs.length, first: diffs[0] ?? null }).toEqual({ count: 0, first: null });
  });
});
