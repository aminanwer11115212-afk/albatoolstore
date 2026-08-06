/**
 * حسابُ العميل في الورقة — واحدٌ في المعاينة وفي شاشة الإدخال.
 *
 * ## العطل كما أرسله صاحب المستودع بورقتين متجاورتين
 * زرُّ «واتساب PDF» في تعديل الفاتورة أرسل للعميل ورقةً تقول إنّ عليه
 * 377,860 — وله في الحقيقة 47,740:
 *
 * |                | المعاينة  | زرّ واتساب     |
 * |----------------|-----------|----------------|
 * | الحساب القديم  | 25,600 له | **غائب**       |
 * | جملة الحساب    | 352,260   | 377,860        |
 * | المدفوع        | 400,000   | **0**          |
 * | رصيد العميل    | 47,740 له | −377,860 عليه  |
 *
 * ## والسبب أنّ الشاشة لا تمرّر الحساب أصلاً
 * `buildCurrentPrintHTML` لم تكن تمرّر `previousDebt` ولا `previousCredit`
 * ولا `currentNet` ولا `paidAmount`، فيسقط القالب إلى أصفاره.
 *
 * وهو أخطرُ ما يقع: اختلافٌ في **المال** لا في الشكل، يستلمه العميل ورقةً
 * بدَينٍ ليس عليه.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db: Record<string, any[]> = { invoices: [], transactions: [] };

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const filters: Array<(r: any) => boolean> = [];
    const c: any = {
      select: () => c,
      eq: (col: string, v: any) => { filters.push((r) => r[col] === v); return c; },
      in: (col: string, vs: any[]) => { filters.push((r) => vs.includes(r[col])); return c; },
      then: (ok: any, no?: any) =>
        Promise.resolve({ data: (db[table] || []).filter((r) => filters.every((f) => f(r))), error: null }).then(ok, no),
    };
    return c;
  };
  return { supabase: { from: (t: string) => chain(t) } };
});

import {
  accountArgsForQuote,
  accountArgsForInvoice,
  splitNet,
  NO_ACCOUNT,
} from "@/utils/documentAccountArgs";
import { generatePrintHTML } from "@/utils/printTemplate";

beforeEach(() => {
  db.invoices = [];
  db.transactions = [];
});

/* ─────────── ١) قسمةُ الصافي ─────────── */

describe("splitNet", () => {
  it("الموجبُ دَينٌ على العميل", () => {
    expect(splitNet(500)).toEqual({ previousDebt: 500, previousCredit: 0 });
  });

  it("والسالبُ رصيدٌ له", () => {
    expect(splitNet(-500)).toEqual({ previousDebt: 0, previousCredit: 500 });
  });

  it("والصفرُ لا هذا ولا ذاك", () => {
    expect(splitNet(0)).toEqual({ previousDebt: 0, previousCredit: 0 });
  });

  /** القالبُ لا يقرأ إلا الفرق، فالقسمةُ بالإشارة تكفي. */
  it("والفرقُ يعود الصافيَ نفسه", () => {
    for (const n of [700, -250, 0, 1_000_000]) {
      const { previousDebt, previousCredit } = splitNet(n);
      expect(previousDebt - previousCredit).toBe(n);
    }
  });
});

/* ─────────── ٢) عرضُ السعر لا يحرّك حساباً ─────────── */

describe("accountArgsForQuote", () => {
  it("رصيدُ العميل كما هو، ولا مدفوع", () => {
    const a = accountArgsForQuote({ balance: 300, credit_balance: 0 });
    expect(a.previousDebt).toBe(300);
    expect(a.paidAmount).toBe(0);
    // العرضُ لا يشتقّ رصيداً نهائياً — هو السابقُ نفسه
    expect(a.currentNet).toBeNull();
  });

  it("و`net_balance` من القاعدة تُفضَّل على الطرح", () => {
    const a = accountArgsForQuote({ balance: 900, credit_balance: 100, net_balance: 250 });
    expect(a.previousDebt).toBe(250);
  });

  it("والرصيدُ الدائن يظهر ائتماناً", () => {
    const a = accountArgsForQuote({ balance: 0, credit_balance: 400 });
    expect(a.previousCredit).toBe(400);
    expect(a.previousDebt).toBe(0);
  });

  it("وبلا عميلٍ لا حساب", () => {
    expect(accountArgsForQuote(null)).toEqual(NO_ACCOUNT);
  });
});

/* ─────────── ٣) الفاتورة: القديمُ من الدفتر ─────────── */

describe("accountArgsForInvoice", () => {
  const CUST = "c1";
  const OLD = { id: "inv-old", customer_id: CUST, total: 200000, paid_amount: 0, status: "unpaid", date: "2026-08-01", created_at: "2026-08-01T09:00:00Z" };
  const THIS = { id: "inv-this", customer_id: CUST, total: 500000, paid_amount: 500000, status: "paid", date: "2026-08-05", created_at: "2026-08-05T09:00:00Z" };

  it("«الحساب القديم» ما كان قبلها لا الرصيدُ الحالي مطروحاً منه", async () => {
    db.invoices = [OLD, THIS];
    const a = await accountArgsForInvoice("inv-this", { balance: 200000, credit_balance: 0 }, 500000, CUST);
    expect(a.previousDebt).toBe(200000);
    expect(a.paidAmount).toBe(500000);
  });

  it("والرصيدُ الحالي يُمرَّر — منه يُشتقّ المدفوع في القالب", async () => {
    db.invoices = [OLD, THIS];
    const a = await accountArgsForInvoice("inv-this", { balance: 0, credit_balance: 47740 }, 400000, CUST);
    expect(a.currentNet).toBe(-47740);
  });

  /** فاتورةٌ لم تُحفظ ليست في الدفتر: القديمُ رصيدُ العميل كما هو. */
  it("وفاتورةٌ لم تُحفظ: القديمُ هو الحالي والمدفوعُ صفر", async () => {
    const a = await accountArgsForInvoice(null, { balance: 25600, credit_balance: 0 }, 0, CUST);
    expect(a.previousDebt).toBe(25600);
    expect(a.paidAmount).toBe(0);
    expect(a.currentNet).toBeNull();
  });

  it("وبلا عميلٍ لا حساب — فاتورةُ الكاش", async () => {
    expect(await accountArgsForInvoice("inv-1", null, 0, null)).toEqual(NO_ACCOUNT);
  });

  /** الخطأُ لا يُصفّر الحساب: الرصيدُ الحالي أقربُ ما يُعرف. */
  it("وتعذُّرُ القراءة لا يُخرج صفراً", async () => {
    const a = await accountArgsForInvoice("inv-غائبة", { balance: 88000, credit_balance: 0 }, 0, CUST);
    expect(a.previousDebt).toBe(88000);
  });
});

/* ─────────── ٤) الحارس: الورقتان تحملان الأرقام نفسها ─────────── */

/**
 * المقارنةُ على **الورقة الناتجة** لا على الوسائط: هي ما يراه العميل. فلو
 * مرّر أحد المسارين وسائطَ ناقصة لظهر الفرق في الأرقام المطبوعة.
 */
describe("ورقةُ الشاشة وورقةُ المعاينة تحملان الأرقام نفسها", () => {
  const CUST = "c1";
  const items = [{ product_name: "بطارية", quantity: 1, unit_price: 377860, tax_amount: 0, discount: 0, total: 377860 }];
  const sheet = (extra: any) =>
    generatePrintHTML({
      type: "invoice", number: "INV-89170", date: "2026-08-06",
      customer: { name: "امين انور" },
      items, subtotal: 377860, taxTotal: 0, discountTotal: 0, grandTotal: 377860,
      company: null, ...extra,
    } as any);

  /**
   * أرقامُ صاحب المستودع حرفاً بحرف: رصيدٌ سابقٌ **له** 25,600، وفاتورةٌ
   * 377,860، ودفعةٌ 400,000 ⇒ جملةُ الحساب 352,260 والرصيدُ له 47,740.
   *
   * و«المدفوع» يُشتقّ من الرصيد لا من `paid_amount` — راجع القالب: دفعةٌ
   * تُوزَّع على فاتورةٍ ودَينٍ قديم تُقرأ ناقصةً لو أُخذت من التوزيع.
   */
  it("حالةُ صاحب المستودع: رصيدٌ له 47,740 لا دَينٌ 377,860", async () => {
    db.invoices = [
      { id: "INV-89170", customer_id: CUST, total: 377860, paid_amount: 400000, status: "paid", date: "2026-08-06", created_at: "2026-08-06T09:00:00Z" },
    ];
    // رصيدٌ سابقٌ للعميل: شحنٌ قبل الفاتورة
    db.transactions = [
      { id: "t1", customer_id: CUST, category: "customer_credit", amount: 25600, date: "2026-08-01", created_at: "2026-08-01T09:00:00Z" },
    ];
    const args = await accountArgsForInvoice(
      "INV-89170", { balance: 0, credit_balance: 47740 }, 400000, CUST,
    );
    // القديمُ رصيدٌ له 25,600
    expect(args.previousCredit).toBe(25600);
    expect(args.currentNet).toBe(-47740);

    const html = sheet(args);
    expect(html).toContain("الحساب القديم");
    expect(html).toContain("352,260");   // جملة الحساب
    expect(html).toContain("400,000");   // المدفوع — مشتقٌّ من الرصيد
    expect(html).toContain("47,740");    // رصيد العميل له
    // ولا يظهر الدَّينُ الخاطئ الذي أرسلته الورقةُ المعطوبة
    expect(html).not.toContain("−377,860");
  });

  it("وبلا الوسائط تخرج الورقةُ بالدَّين الخاطئ — وهو العطل بعينه", () => {
    const html = sheet({});
    expect(html).not.toContain("الحساب القديم");
    expect(html).toContain("−377,860");
  });

  it("والمسارُ الواحد يُخرج الورقةَ نفسها مرّتين", async () => {
    db.invoices = [
      { id: "inv-old", customer_id: CUST, total: 25600, paid_amount: 0, status: "unpaid", date: "2026-08-01", created_at: "2026-08-01T09:00:00Z" },
      { id: "INV-89170", customer_id: CUST, total: 377860, paid_amount: 400000, status: "paid", date: "2026-08-06", created_at: "2026-08-06T09:00:00Z" },
    ];
    const cust = { balance: 0, credit_balance: 47740 };
    const a = await accountArgsForInvoice("INV-89170", cust, 400000, CUST);
    const b = await accountArgsForInvoice("INV-89170", cust, 400000, CUST);
    expect(sheet(a)).toBe(sheet(b));
  });

  /**
   * وعرضُ السعر لا يُظهر «الحساب القديم» — العرضُ لا يدخل الحساب. لكنّه
   * يُظهر رصيدَ العميل، فيجب أن يكون واحداً في الشاشة والمعاينة.
   */
  it("وعرضُ السعر: رصيدُ العميل واحدٌ في الشاشة والمعاينة", () => {
    const cust = { balance: 25600, credit_balance: 0 };
    const quote = (extra: any) =>
      generatePrintHTML({
        type: "quote", number: "QT-1", date: "2026-08-06",
        customer: { name: "امين انور" }, items,
        subtotal: 377860, taxTotal: 0, discountTotal: 0, grandTotal: 377860,
        company: null, ...extra,
      } as any);
    const a = quote(accountArgsForQuote(cust));
    expect(a).toBe(quote(accountArgsForQuote(cust)));
    expect(a).toContain("رصيد العميل الحالي");
    expect(a).toContain("25,600");
    // وبلا الوسائط يختفي الرصيد — وهو الفرق الذي كان
    expect(quote({})).not.toContain("25,600");
  });
});
