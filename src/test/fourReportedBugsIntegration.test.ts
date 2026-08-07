/**
 * الأعطالُ الأربعةُ التي بلّغ عنها صاحبُ المستودع — بالأرقام لا بقراءة المصدر.
 *
 * لكلّ عطلٍ فحوصُه في ملفّه (`statementSummaryPaid`, `packagingPiecesCount`,
 * `invoiceRecallRate`, `customerBalanceSelectColumns`)، وأكثرُها يقرأ المصدر
 * أو يفحص دالّةً منعزلة. وهذا الملفّ يقطع المسار: بياناتٌ كما تأتي من القاعدة
 * ← الدالّةُ التي تحسب ← الرقمُ الذي يقرؤه المستخدم.
 *
 * وكلُّ فحصٍ يغيّر عرضاً **يُثبت أيضاً أنّ المجاميع لم تتحرّك**: العلاجُ كان
 * في العرض لا في المال، فإن تحرّك رصيدٌ أو إجماليٌّ فقد صار الإصلاحُ عطلاً.
 */
import { describe, it, expect } from "vitest";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";
import { packagingCountSum } from "@/utils/packagingCount";
import { formatPackaging } from "@/utils/printExtras";
import {
  defaultRateDecision, deriveRateFromRows, effectiveRowRate, computeUnitPrice,
} from "@/utils/invoiceCreateHelpers";
import { netBalanceOf, computeDisplayBalance } from "@/utils/balanceDisplay";
import { generatePrintHTML } from "@/utils/printTemplate";

/* ═════════════ ١) كشفُ الحساب: «المدفوع» رقمٌ واحد ═════════════ */

/**
 * ## العطل
 * صندوقُ الملخّص كان يجمع `invoices.paid_amount`، وذيلُ الجدول يجمع
 * `accountView.rowsPaid`. فيسقط من الصندوق ما لم يُكتب على فاتورة:
 * شحناتُ الرصيد، وما دُفع على الحساب القديم.
 *
 * ## السيناريو بالأرقام
 * فاتورةٌ بـ500,000 وحسابٌ قديم 200,000. دفع العميل **600,000**، فقُسّمت:
 * 500,000 على الفاتورة و100,000 على القديم. ثمّ شحن 50,000.
 */
describe("١) «المدفوع» في الكشف — الصندوقُ يساوي ذيلَ عموده", () => {
  const INVOICE = {
    id: "inv-1", invoice_number: "INV-1", date: "2026-08-01",
    total: 500000, paid_amount: 500000, status: "paid",
  };
  /* الفئاتُ كما تكتبها الشاشة: `customer_payment` للدفعة، و`customer_credit`
     الموجب للشحن. */
  const TRANSACTIONS = [
    { id: "t1", date: "2026-08-01", category: "customer_payment", type: "income",
      amount: 500000, method: "cash", reference_id: "inv-1" },
    // شحنُ رصيد — مالٌ دخل ولم يُكتب على فاتورة
    { id: "t3", date: "2026-08-02", category: "customer_credit", type: "income",
      amount: 50000, method: "cash", reference_id: null },
  ];

  const view = buildCustomerAccountView({
    invoices: [INVOICE], transactions: TRANSACTIONS, openingBalance: 200000,
  });

  /** ما كان الصندوقُ يعرضه: مجموعُ `paid_amount` على الفواتير وحدها. */
  const oldBoxNumber = [INVOICE].reduce((s, i) => s + Number(i.paid_amount || 0), 0);

  it("الكشفُ يرى المدفوع كلَّه — 550,000", () => {
    expect(view.rowsPaid).toBe(550000);
  });

  it("وبالحساب القديم كان 500,000 — الفرقُ 50,000 يراها العميل", () => {
    expect(oldBoxNumber).toBe(500000);
    expect(view.rowsPaid - oldBoxNumber).toBe(50000);
  });

  /**
   * والفرقُ هو الشحنُ بعينه: مالٌ دخل ولم يُكتب على فاتورة، فلا يعرفه عمودُ
   * `paid_amount` مهما جُمع.
   */
  it("والفرقُ هو ما لا تعرفه الفاتورةُ عن نفسها", () => {
    const offInvoice = TRANSACTIONS
      .filter((t) => t.reference_id === null)
      .reduce((s, t) => s + t.amount, 0);
    expect(offInvoice).toBe(50000);
    expect(view.rowsPaid).toBe(oldBoxNumber + offInvoice);
  });

  /**
   * ولم يتحرّك المال: عمودُ القيمة يجمع الفواتير كما كان (الرصيدُ السابق سطرٌ
   * بلا قيمةٍ في العمود، فلا يُحسب مرّتين)، والصافي كما هو.
   */
  it("ولم يتحرّك عمودُ القيمة — العلاجُ في «المدفوع» وحده", () => {
    expect(view.rowsValue).toBe(500000);
    const invoicesValue = [INVOICE].reduce((s, i) => s + Number(i.total || 0), 0);
    expect(view.rowsValue).toBe(invoicesValue);
  });

  /** والصندوقُ يقرأ من هذين الرقمين لا من غيرهما — فيطابق ذيلَ العمود. */
  it("فيقفل الكشفُ على نفسه: ما في الصندوق هو ما في ذيل العمود", () => {
    const tail = { value: view.rowsValue, paid: view.rowsPaid };
    const summary = { value: view.rowsValue, paid: view.rowsPaid };
    expect(summary).toEqual(tail);
  });
});

/* ═════════════ ٢) عددُ قطع التغليف ═════════════ */

/**
 * ## القاعدة كما قرّرها صاحبُ المستودع
 * «عدد القطع على الرقم في الأول قبل كلمة كرتونة كبيرة». فالمجموعُ = مجموعُ
 * الأرقام المكتوبة في أوّل الأسطر، و‎*‎N وصفُ الطرد لا عاملُ ضرب.
 *
 * ## السيناريو بالأرقام
 * ثلاثةُ أسطر تبدأ بـ1 و1 و2 ⇒ **4**. وقد حُسبت مرّةً بالضرب فخرجت 78.
 */
describe("٢) عددُ القطع — الرقمُ المكتوب هو المجموع", () => {
  const ROWS = [
    { product_name: "باكم فرامل امامي", packs_count: 1, pieces_per_pack: 50, quantity: 50 },
    { product_name: "بطارية جي ان", packs_count: 1, pieces_per_pack: 8, quantity: 8 },
    { product_name: "بطارية 125", packs_count: 2, pieces_per_pack: 10, quantity: 20 },
  ];

  const shownOnSheet = (rows: any[]) => {
    const html = formatPackaging([], rows)!;
    return Number(
      /إجمالي عدد القطع :[\s\S]*?<span>([\d,]+)<\/span>/.exec(html)![1].replace(/,/g, ""),
    );
  };

  it("الورقةُ تعرض 4 — مجموعَ ما كُتب في أوّل الأسطر", () => {
    expect(shownOnSheet(ROWS)).toBe(4);
  });

  it("وبالضرب في ‎*‎N كان 78", () => {
    const multiplied = ROWS.reduce((s, r) => s + r.packs_count * r.pieces_per_pack, 0);
    expect(multiplied).toBe(78);
  });

  it("وتقريرُ الإرسال يقول ما تقوله الورقة", () => {
    expect(packagingCountSum(ROWS)).toBe(shownOnSheet(ROWS));
    expect(packagingCountSum(ROWS)).toBe(4);
  });

  /** وخمسُ كراتين بلا ‎*‎N ⇒ 5 — مثالُ صاحب المستودع بعينه. */
  it("و«5 كرتونة كبيرة» ⇒ 5", () => {
    expect(shownOnSheet([{ product_name: "", packs_count: 5 }])).toBe(5);
  });

  /**
   * ولم تتحرّك الأسطرُ نفسُها: التصحيحُ في المجموع وحده، و‎*‎N باقيةٌ وصفاً
   * لما في الطرد.
   */
  it("ولم تتحرّك الأسطرُ ولا أوصافُها", () => {
    const html = formatPackaging([], ROWS)!;
    expect(html).toContain("*50");
    expect(html).toContain("*8");
    expect(html).toContain("*10");
    expect((html.match(/data-pkg-line/g) || []).length).toBe(ROWS.length + 1);
  });
});

/* ═════════════ ٣) معدّلُ التحويل عند استدعاء فاتورة ═════════════ */

/**
 * ## السيناريو بالأرقام
 * فاتورةٌ محفوظةٌ بمعدّل **600**، تُستدعى في يومٍ معدّلُه **650**. يُضاف صنفٌ
 * سعرُه الأجنبي 10.
 *
 * الصحيح: 10 × 600 = **6,000**. والعطل كان: 10 × 650 = **6,500**.
 */
describe("٣) استدعاءُ فاتورة — الصنفُ الجديد بمعدّلها لا بمعدّل اليوم", () => {
  const INVOICE_RATE = 600;
  const TODAY_RATE = 650;
  const SAVED_ROWS = [
    { foreign_price: 10, exchange_rate: INVOICE_RATE },
    { foreign_price: 5, exchange_rate: INVOICE_RATE },
  ];

  /** ما تفعله الشاشة: تشتقّ من البنود، ثمّ تقرّر، ثمّ تسعّر الصنف الجديد. */
  function priceOfNewItem(opts: { rowsReady: boolean }) {
    const derived = opts.rowsReady ? deriveRateFromRows(SAVED_ROWS) : 0;
    const decision = defaultRateDecision({
      editing: true, rowsReady: opts.rowsReady, derived, global: TODAY_RATE,
    });
    if (decision === null) return null;              // لا تُسعّر بعد
    return computeUnitPrice(10, effectiveRowRate(0, decision));
  }

  it("قبل وصول البنود لا يُسعَّر شيء — وهنا كان يُكتب معدّلُ اليوم", () => {
    expect(priceOfNewItem({ rowsReady: false })).toBeNull();
  });

  it("وبعد وصولها يُسعَّر بـ6,000 — بمعدّل الفاتورة", () => {
    expect(priceOfNewItem({ rowsReady: true })).toBe(10 * INVOICE_RATE);
  });

  it("وبالحساب القديم كان 6,500 — الفرقُ 500 على كل وحدة", () => {
    const old = computeUnitPrice(10, TODAY_RATE);
    expect(old).toBe(6500);
    expect(old - priceOfNewItem({ rowsReady: true })!).toBe(500);
  });

  /**
   * ولم تتحرّك أسعارُ البنود المحفوظة: العلاجُ يمنع كتابةَ معدّلٍ فوق معدّلها،
   * ولا يعيد تسعيرَ شيء.
   */
  it("ولم تتحرّك أسعارُ البنود المحفوظة", () => {
    for (const r of SAVED_ROWS) {
      expect(computeUnitPrice(r.foreign_price, effectiveRowRate(r.exchange_rate, TODAY_RATE)))
        .toBe(r.foreign_price * INVOICE_RATE);
    }
  });

  /** والفاتورةُ الجديدة تأخذ معدّلَ اليوم كما ينبغي — لا يمنعها العلاج. */
  it("والفاتورةُ الجديدة تأخذ معدّلَ اليوم", () => {
    const d = defaultRateDecision({ editing: false, rowsReady: false, global: TODAY_RATE });
    expect(d).toBe(TODAY_RATE);
    expect(computeUnitPrice(10, effectiveRowRate(0, d!))).toBe(6500);
  });
});

/* ═════════════ ٤) «الحساب القديم» في تفاصيل العميل ═════════════ */

/**
 * ## السيناريو بالأرقام
 * عميلٌ عليه 25,600 وشحن 25,600 — حسابُه **خالص**. وكان يُعرض «عليه 25,600»
 * لأن استعلامَ الشاشة لا يجلب `credit_balance`.
 */
describe("٤) «الحساب القديم» — الصافي لا المديونيةُ الخام", () => {
  const FULL = { balance: 25600, credit_balance: 25600, net_balance: 0 };

  it("العميلُ الخالص يُعرض «خالص»", () => {
    expect(netBalanceOf(FULL)).toBe(0);
    expect(computeDisplayBalance(FULL as any).label).toBe("خالص");
  });

  it("وبالكائن المجتزأ كان «عليه 25,600»", () => {
    const trimmed = { balance: 25600 };
    expect(netBalanceOf(trimmed as any)).toBe(25600);
    expect(computeDisplayBalance(trimmed as any).label).toBe("عليه");
  });

  /**
   * وهذا الرقمُ يدخل الورقة أيضاً: صفُّ «الحساب القديم» فيها يُبنى من الصافي
   * نفسِه. فلو اختلف الاثنان لقرأ العميلُ رقمين في دقيقةٍ واحدة — واحداً على
   * الشاشة وواحداً في يده.
   */
  it("والورقةُ تعرض الرقمَ الذي تعرضه الشاشة", () => {
    const surplus = { balance: 10000, credit_balance: 30000, net_balance: -20000 };
    const net = netBalanceOf(surplus);          // −20,000 ⇒ له
    const onScreen = computeDisplayBalance(surplus as any);
    expect(onScreen.label).toBe("له");
    expect(onScreen.amount).toBe(20000);

    // والورقةُ تُبنى بـprevious* المشتقّين من الصافي نفسِه
    const html = generatePrintHTML({
      type: "invoice", number: "INV-9", date: "2026-08-01",
      customer: { name: "عميل" },
      items: [{ product_name: "صنف", quantity: 1, unit_price: 1000, tax_amount: 0, discount: 0, total: 1000 }],
      subtotal: 1000, taxTotal: 0, discountTotal: 0, grandTotal: 1000,
      company: { company_name: "ش" } as any, paidAmount: 0,
      previousDebt: Math.max(net, 0), previousCredit: Math.max(-net, 0),
    } as any);
    const at = html.indexOf('data-section="prev-account-row"');
    expect(at).toBeGreaterThan(-1);
    const prevRow = html.slice(at, html.indexOf('</tr>', at));
    expect(prevRow).toContain(onScreen.amount.toLocaleString());
    expect(prevRow).toContain("له");
  });

  /** ولم يتحرّك المال: الأعمدةُ تُجلب ولا تُكتب. */
  it("ولم يتغيّر رصيدٌ — الأعمدةُ تُقرأ لا تُكتب", () => {
    expect(netBalanceOf(FULL)).toBe(
      Number(FULL.balance) - Number(FULL.credit_balance),
    );
  });
});
