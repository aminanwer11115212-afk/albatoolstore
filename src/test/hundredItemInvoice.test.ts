/**
 * فاتورةٌ بمئة صنف، مُغلَّفةٌ ومُرحَّلة — المسار كاملاً.
 *
 * ## لماذا هذا الاختبار
 * سأل صاحب المستودع: «تحقّق باختبار إذا تمّ إضافة فاتورة بـ100 منتج
 * وتغليفها وهكذا». والمئة ليست عدداً كبيراً فحسب — هي الحالة التي تكشف ما لا
 * تكشفه فاتورةُ بندَين:
 *
 *   • الإجماليات: خطأ تقريبٍ في البند الواحد يظهر مضروباً في مئة.
 *   • القالب: بندٌ يسقط في التنظيف، أو صندوق تغليفٍ يُدفع لصفحةٍ فيترك بياضاً.
 *   • التطابق: ورقة العميل تُبنى من القالب نفسه — فأيّ فرقٍ عند الكثرة عطل.
 *   • الرصيد: الفاتورة تُثقل حساب العميل بإجماليها، والدفعة تُنقصه — والعقد
 *     أن الشحن يُخزَّن ولا يُوزَّع.
 *
 * فالمسار هنا يُقطع كاملاً: شاشة الإدخال ← الإجماليات ← التغليف والترحيل ←
 * ورقة الطباعة ← ورقة العميل ← كشف الحساب والرصيد.
 */
import { describe, it, expect } from "vitest";
import { calcTotal, computeUnitPrice, type InvRow } from "@/utils/invoiceCreateHelpers";
import { formatPackaging, formatTransports } from "@/utils/printExtras";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildCustomerAccountView } from "@/utils/buildCustomerAccountView";

const RATE = 1400;
const ITEM_COUNT = 100;

/* ─────────── 1) شاشة الإدخال: مئة بند كما تُدخَل فعلاً ─────────── */

/** بندٌ كما تبنيه `pickProductIntoRow`: سعرٌ أجنبي ومعدّل، والمحلي مشتقّ. */
function buildRow(i: number): InvRow {
  const foreign = 1 + (i % 9) * 0.5;          // 1 … 5 دولار
  const row: any = {
    uid: `u${i}`,
    product_id: `p${i}`,
    product_name: `صنف رقم ${i + 1}`,
    productSearch: `صنف رقم ${i + 1}`,
    showSuggestions: false,
    selected: false,
    quantity: (i % 7) + 1,                     // 1 … 7
    foreign_price: foreign,
    exchange_rate: RATE,
    unit_price: computeUnitPrice(foreign, RATE),
    discount: i % 10 === 0 ? 5 : 0,            // كل عاشرٍ بخصم 5%
    unit: "قطعة",
    note: "",
    total: 0,
  };
  row.total = calcTotal(row);
  return row as InvRow;
}

const rows = Array.from({ length: ITEM_COUNT }, (_, i) => buildRow(i));

/** الإجماليات بنفس معادلة الشاشة (`totals` في `InvoiceCreateScreen`). */
const subtotal = rows.reduce((s, r) => s + r.quantity * r.unit_price, 0);
const itemDiscounts = rows.reduce((s, r) => s + (r.quantity * r.unit_price * r.discount) / 100, 0);
const grandTotal = Math.round((subtotal - itemDiscounts) * 100) / 100;

/* ─────────── 2) التغليف والترحيل لكل بند ─────────── */

const packagingItems = rows.map((r, i) => ({
  product_name: r.product_name,
  packs_count: (i % 4) + 1,
  pieces_per_pack: 6,
  quantity: r.quantity,
  description: i % 10 === 0 ? `ملاحظة تغليف البند ${i + 1}` : null,
  packaging_types: { name: i % 2 ? "كرتونة" : "كيس" },
}));

// شكل الصفّ كما يصل من القاعدة: المرحِّل جدولٌ مرتبط، والوجهة كذلك.
const transports = [
  { transporters: { name: "شركة النقل السريع", phone: "0912345678", address: "السوق القديم" }, destinations: { name: "بنغازي" } },
  { transporters: { name: "مندوب التسليم", phone: "0925555555", address: "مخزن رقم 3" }, destinations: { name: "مصراتة" } },
];

const packagingInfo = formatPackaging([], packagingItems)!;
const transportInfo = formatTransports(transports)!;

const printData = {
  type: "invoice" as const,
  number: "INV-100",
  date: "2026-08-04",
  customer: { name: "عميل تجريبي", phone: "0911111111" },
  items: rows.map((r) => ({
    product_name: r.product_name,
    quantity: r.quantity,
    unit_price: r.unit_price,
    tax_amount: 0,
    discount: r.discount,
    total: r.total,
  })),
  subtotal,
  taxTotal: 0,
  discountTotal: itemDiscounts,
  grandTotal,
  paidAmount: 0,
  dueAmount: grandTotal,
  company: { name: "متجر ألبا للأدوات", phone: "0910000000", address: "طرابلس" },
  packagingInfo,
  transportInfo,
};

/* ─────────── الفحوص ─────────── */

describe("الإجماليات عند مئة بند", () => {
  it("مئة بند كلّها صالحة — لا بندَ سقط في البناء", () => {
    expect(rows).toHaveLength(ITEM_COUNT);
    expect(rows.every((r) => r.unit_price > 0 && r.quantity > 0)).toBe(true);
  });

  it("إجمالي البند = كمية × سعر − خصمه", () => {
    for (const r of rows.slice(0, 5)) {
      const expected = Math.round(r.quantity * r.unit_price * (1 - r.discount / 100) * 100) / 100;
      expect(r.total).toBeCloseTo(expected, 2);
    }
  });

  it("مجموع البنود = إجمالي الفاتورة — لا فرقَ تقريبٍ متراكم", () => {
    const sumOfRows = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100;
    expect(sumOfRows).toBeCloseTo(grandTotal, 2);
  });

  it("والسعر المحلي رقمٌ صحيح في المئة كلّها — لا كسور على الورقة", () => {
    expect(rows.every((r) => Number.isInteger(r.unit_price))).toBe(true);
  });
});

describe("ورقة الطباعة تحمل المئة كاملة", () => {
  const html = generatePrintHTML(printData as any);

  it("كل صنفٍ من المئة موجود", () => {
    const missing = rows.filter((r) => !html.includes(r.product_name)).map((r) => r.product_name);
    expect(missing).toEqual([]);
  });

  it("وكل بند تغليفٍ من المئة موجود", () => {
    // جدول التغليف: صفُّ الترويسة + مئة بند + صفُّ المجموع
    expect(packagingInfo.match(/<tr[ >]/g)).toHaveLength(ITEM_COUNT + 2);
    expect(html).toContain("نوع التغليف");
    expect(html).toContain("عدد القطع");
  });

  it("والترحيل بمرحّليه ووجهتيهما", () => {
    expect(html).toContain("بنغازي");
    expect(html).toContain("مصراتة");
    expect(html).toContain("شركة النقل السريع");
    expect(html).toContain("0912345678");
  });

  it("والإجمالي مطبوعٌ بالرقم المحسوب", () => {
    expect(html).toContain(grandTotal.toLocaleString());
  });

  it("والورقة تكتمل بعد المئة — التواقيع في آخرها", () => {
    expect(html).toContain("توقيع المستلم");
    expect(html.indexOf("توقيع المستلم")).toBeGreaterThan(html.indexOf(rows[99].product_name));
  });

  it("صندوقا التغليف والترحيل ينقسمان على الصفحات — وإلا تُرك بياضٌ صفحة", () => {
    expect(html).toMatch(/\.extra-row, \.extra-box \{ page-break-inside: auto/);
  });
});

/**
 * ورقة العميل ليست نسخةً ثانية: صفحة `/share/document/:token` تبني بـ
 * `generatePrintHTML` نفسها (راجع `sharedDocumentHtml.ts`). فالمقارنة هنا
 * على أن القالب الواحد يحتمل المئة — لا على تطابق نسختين.
 */
describe("ورقة العميل من القالب نفسه", () => {
  it("قالبٌ واحد يُستدعى مرّتين يُخرج الورقة نفسها حرفياً", () => {
    const a = generatePrintHTML(printData as any);
    const b = generatePrintHTML(printData as any);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10_000);
  });

  it("وإخفاء التغليف يسري على الورقتين لأنه في القالب لا في الصفحة", () => {
    const hidden = generatePrintHTML({ ...printData, hiddenSections: ["packaging"] } as any);
    expect(hidden).not.toContain("نوع التغليف");
    expect(hidden).not.toContain("عدد القطع");
    expect(hidden).toContain(rows[0].product_name); // البنود باقية
  });
});

/* ─────────── 3) الحساب والرصيد ─────────── */

describe("أثر الفاتورة على حساب العميل", () => {
  const invoice = {
    id: "inv-100",
    invoice_number: "INV-100",
    date: "2026-08-04",
    created_at: "2026-08-04T09:00:00Z",
    total: grandTotal,
    paid_amount: 0,
    status: "unpaid",
  };

  it("الفاتورة تُثقل الحساب بإجماليها لا بمجموعٍ آخر", () => {
    const view = buildCustomerAccountView({
      invoices: [invoice] as any,
      transactions: [],
      accountNameById: new Map(),
      netBalance: grandTotal,
    } as any);
    const block = view.blocks.find((b: any) => b.invoiceId === "inv-100")!;
    expect(block.total).toBeCloseTo(grandTotal, 2);
    expect(block.remaining).toBeCloseTo(grandTotal, 2);
  });

  it("ودفعةٌ كاملة تُقفلها بلا فائض", () => {
    const view = buildCustomerAccountView({
      invoices: [{ ...invoice, paid_amount: grandTotal, status: "paid" }] as any,
      transactions: [
        {
          id: "pay-1", category: "customer_payment", type: "income", amount: grandTotal,
          reference_id: "inv-100", date: "2026-08-05", created_at: "2026-08-05T09:00:00Z",
          method: "cash", description: "دفعة على الفاتورة INV-100",
        },
      ] as any,
      accountNameById: new Map(),
      netBalance: 0,
    } as any);
    const block = view.blocks.find((b: any) => b.invoiceId === "inv-100")!;
    expect(block.remaining).toBeCloseTo(0, 2);
  });

  it("ودفعةٌ زائدة لا تُوزَّع على شيء — تُخزَّن رصيداً", () => {
    const over = 50_000;
    const view = buildCustomerAccountView({
      invoices: [{ ...invoice, paid_amount: grandTotal, status: "paid" }] as any,
      transactions: [
        {
          id: "pay-1", category: "customer_payment", type: "income", amount: grandTotal,
          reference_id: "inv-100", date: "2026-08-05", created_at: "2026-08-05T09:00:00Z", method: "cash",
        },
        {
          id: "cr-1", category: "customer_credit", type: "income", amount: over,
          reference_id: "inv-100", date: "2026-08-05", created_at: "2026-08-05T09:00:01Z",
          description: "فائض دفعة من الفاتورة INV-100 — رصيد دائن",
          allocation: { kind: "overpay_surplus", invoice_id: "inv-100", invoice_number: "INV-100" },
        },
      ] as any,
      accountNameById: new Map(),
      netBalance: -over,
    } as any);
    const block = view.blocks.find((b: any) => b.invoiceId === "inv-100")!;
    // الفاتورة مقفلة، والفائض في صندوق الرصيد لا مخصوماً منها مرّةً ثانية
    expect(block.remaining).toBeCloseTo(0, 2);
  });
});
