/**
 * «الحساب القديم» في رابط العميل يساوي الرقم نفسه في المعاينة — دائماً.
 *
 * الطريقة المختصرة («اطرح هذه الفاتورة من الرصيد الحالي») تُدخل في «القديم»
 * فواتيرَ أُنشئت **بعد** هذه الفاتورة، وتقصّ عند الصفر فتشوّه الصافي حين
 * يجتمع دَينٌ ورصيد. فلو بقيت في دالّة الحافة لخرج للعميل رقمٌ يخالف ما يراه
 * صاحب المستودع في الشاشة — وهو ما يُفترض أن يطابقه.
 *
 * الدالّتان في بيئتين (Node وDeno) فلا تستوردان بعضهما؛ هذا الاختبار هو ما
 * يمنع انحرافهما.
 */
import { describe, it, expect } from "vitest";
import { netBeforeInvoice } from "@/utils/customerNetBefore";
import { netBeforeInvoiceEdge } from "../../supabase/functions/document-share/template";

const both = (invoiceId: string, invoices: any[], transactions: any[]) => ({
  app: netBeforeInvoice(invoiceId, { invoices, transactions }),
  edge: netBeforeInvoiceEdge(invoiceId, invoices, transactions),
});

const inv = (id: string, total: number, at: string, extra: Record<string, any> = {}) => ({
  id, total, status: "pending", date: at.slice(0, 10), created_at: at, ...extra,
});
const tx = (id: string, category: string, amount: number, at: string, extra: Record<string, any> = {}) => ({
  id, category, amount, date: at.slice(0, 10), created_at: at, ...extra,
});

describe("تطابق الدالّتين على الحالات الحقيقية", () => {
  it("فاتورةٌ وحيدة: لا حساب قديم", () => {
    const { app, edge } = both("i1", [inv("i1", 1000, "2026-08-01T10:00:00Z")], []);
    expect(edge).toBe(app);
    expect(edge).toBe(0);
  });

  it("فاتورةٌ سابقة غير مسدَّدة تدخل القديم", () => {
    const invoices = [inv("i0", 700, "2026-07-01T10:00:00Z"), inv("i1", 1000, "2026-08-01T10:00:00Z")];
    const { app, edge } = both("i1", invoices, []);
    expect(edge).toBe(app);
    expect(edge).toBe(700);
  });

  it("**فاتورةٌ لاحقة لا تدخل القديم** — العطل الذي عالجَته الطريقة التاريخية", () => {
    const invoices = [
      inv("i1", 1000, "2026-08-01T10:00:00Z"),
      inv("i2", 5000, "2026-08-20T10:00:00Z"), // بعدها بكثير
    ];
    const { app, edge } = both("i1", invoices, []);
    expect(edge).toBe(app);
    expect(edge).toBe(0); // لا 5000 ولا 6000
  });

  it("دفعةٌ سابقة تُنقص القديم", () => {
    const invoices = [inv("i0", 700, "2026-07-01T10:00:00Z"), inv("i1", 1000, "2026-08-01T10:00:00Z")];
    const txs = [tx("t0", "customer_payment", 300, "2026-07-05T10:00:00Z", { reference_id: "i0" })];
    const { app, edge } = both("i1", invoices, txs);
    expect(edge).toBe(app);
    expect(edge).toBe(400);
  });

  it("حركات الفاتورة نفسها لا تسبق إنشاءها مهما قال الطابع", () => {
    // قيدٌ بتاريخٍ بلا وقت يُعامَل كبداية اليوم فيسبق فاتورة العاشرة صباحاً
    const invoices = [inv("i1", 1000, "2026-08-01T10:00:00Z")];
    const txs = [{ id: "t1", category: "customer_payment", amount: 400, date: "2026-08-01", reference_id: "i1" }];
    const { app, edge } = both("i1", invoices, txs);
    expect(edge).toBe(app);
    expect(edge).toBe(0); // لا −400
  });

  it("زوج السداد من الرصيد أثره صفر في الاثنتين", () => {
    const invoices = [inv("i0", 700, "2026-07-01T10:00:00Z"), inv("i1", 1000, "2026-08-01T10:00:00Z")];
    const txs = [
      tx("c1", "customer_credit", -700, "2026-07-10T10:00:00Z", { reference_id: "i0" }),
      tx("p1", "customer_payment", 700, "2026-07-10T10:00:01Z", { reference_id: "i0", method: "credit_balance" }),
    ];
    const { app, edge } = both("i1", invoices, txs);
    expect(edge).toBe(app);
    expect(edge).toBe(700); // الفاتورة القديمة وحدها؛ الزوج أثره صفر
  });

  it("شحن رصيدٍ سابق يقلب القديم لصالح العميل", () => {
    const invoices = [inv("i1", 1000, "2026-08-01T10:00:00Z")];
    const txs = [tx("c1", "customer_credit", 900, "2026-07-20T10:00:00Z")];
    const { app, edge } = both("i1", invoices, txs);
    expect(edge).toBe(app);
    expect(edge).toBe(-900);
  });

  it("فاتورةٌ ملغاة لا تُحتسب", () => {
    const invoices = [
      inv("i0", 700, "2026-07-01T10:00:00Z", { status: "cancelled" }),
      inv("i1", 1000, "2026-08-01T10:00:00Z"),
    ];
    const { app, edge } = both("i1", invoices, []);
    expect(edge).toBe(app);
    expect(edge).toBe(0);
  });

  it("فاتورةٌ غير موجودة ⇒ `null` في الاثنتين (لا صفر)", () => {
    const { app, edge } = both("مجهولة", [inv("i1", 1000, "2026-08-01T10:00:00Z")], []);
    expect(edge).toBe(app);
    expect(edge).toBeNull();
  });
});

describe("سلسلةٌ طويلة مختلطة — الرقم واحد إلى آخر القائمة", () => {
  const invoices = [
    inv("a", 500, "2026-01-05T09:00:00Z"),
    inv("b", 600, "2026-02-05T09:00:00Z"),
    inv("c", 300, "2026-03-05T09:00:00Z"),
    inv("d", 500, "2026-04-05T09:00:00Z"),
    inv("e", 500, "2026-05-05T09:00:00Z"),
  ];
  const txs = [
    tx("p1", "customer_payment", 300, "2026-01-10T09:00:00Z", { reference_id: "a" }),
    tx("p2", "customer_payment", 400, "2026-02-10T09:00:00Z", { reference_id: "b" }),
    tx("ch", "customer_credit", 300, "2026-02-20T09:00:00Z"),
    tx("p3", "customer_payment", 200, "2026-03-10T09:00:00Z", { reference_id: "c" }),
    tx("p4", "customer_payment", 1000, "2026-04-10T09:00:00Z", { reference_id: "d" }),
    tx("ov", "customer_credit", 500, "2026-04-10T09:00:01Z", { reference_id: "d" }),
  ];

  it.each(["a", "b", "c", "d", "e"])("الفاتورة %s: الحافة = التطبيق", (id) => {
    const { app, edge } = both(id, invoices, txs);
    expect(edge).toBe(app);
  });

  it("والقيمة صحيحة لا مجرّد متطابقة", () => {
    // قبل «e»: 500+600+300+500 فواتير − (300+400+300+200+1000+500) حركات
    expect(netBeforeInvoiceEdge("e", invoices, txs)).toBe(-800);
  });
});
