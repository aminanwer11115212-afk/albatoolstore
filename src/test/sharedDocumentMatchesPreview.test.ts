/**
 * ورقةُ رابط العميل هي ورقةُ المعاينة نفسها — يُثبَت بالناتج لا بالوعد.
 *
 * ## المسار الحيّ
 * `/share/document/:token` تقرأ من `get_shared_document` (دالّة قاعدة حارسها
 * التوكن) وتبني بـ`generatePrintHTML` — نفس الدالّة التي تبني المعاينة
 * والطباعة وواتساب PDF. فالتطابقُ **بنيويّ**: قالبٌ واحد لا نسختان.
 *
 * ## وما يبقى قابلاً للانحراف
 * ليس القالب، بل **ما يُمرَّر إليه**. فلو سقط حقلٌ من `buildSharedDocumentHTML`
 * — الشحن، أو الحساب القديم، أو الرصيد الحالي — لخرجت ورقةُ العميل مختلفةً
 * وإن كان القالب واحداً. وهذا ما وقع فعلاً قبل اليوم أكثر من مرّة.
 *
 * فيُبنى المستند من الطريقين بنفس البيانات، ويُقارَن الـHTML كلُّه.
 */
import { describe, it, expect } from "vitest";
import { generatePrintHTML } from "@/utils/printTemplate";
import { buildSharedDocumentHTML, SharedDocumentError } from "@/utils/sharedDocumentHtml";
import { formatPackaging, formatTransports } from "@/utils/printExtras";

const company = {
  company_name: "شركة البتول لإسبيرات المواتر والتكاتك",
  phone: "0909605576", manager_name: "مينا جابر", address: "عطبرة",
};

const customer = { name: "امين انور", phone: "0900", address: "عطبرة", email: "" };

const items = [
  { product_name: "استارتر CD110 اصلي", quantity: 1, unit_price: 54_600, total: 54_600, discount: 0, foreign_price: 0 },
  { product_name: "طارة امامية هجو", quantity: 1, unit_price: 154_000, total: 154_000, discount: 0, foreign_price: 0 },
];

const packaging: any[] = [];
const packagingItems = [
  { packaging_types: { name: "كرتونة" }, product_name: "استارتر CD110 اصلي", packs_count: 5, pieces_per_pack: 1, quantity: 5 },
];
const transports = [
  { transporters: { name: "شركة النقل", phone: "0912", address: "السوق" }, destinations: { name: "الخرطوم" } },
];

/** فاتورةٌ بحسابٍ قديم ودفعةٍ تتجاوزها — الحالة التي بلّغ عنها صاحب المستودع. */
const doc = {
  invoice_number: "INV-89170", date: "2026-08-06", due_date: null, type: "sales",
  subtotal: 377_860, discount: 0, shipping: 0, total: 377_860,
  paid_amount: 0, status: "partial", payment_method: "cash", notes: null,
};
const PREV_NET = 1_674_400;   // عليه
const CURRENT_NET = 274_400;  // عليه بعد الدفعة

/** ما تبنيه صفحةُ رابط العميل. */
const shared = () => buildSharedDocumentHTML({
  doc_type: "invoice", doc, items, customer, company,
  packaging, packaging_items: packagingItems, transports,
  prev_net: PREV_NET, current_net: CURRENT_NET,
});

/** ما تبنيه المعاينة والطباعة من نفس البيانات. */
const preview = () => generatePrintHTML({
  type: "invoice", isCash: false,
  number: doc.invoice_number, date: doc.date, dueDate: undefined,
  customer,
  items: items.map((it) => ({
    product_name: it.product_name, quantity: it.quantity, unit_price: it.unit_price,
    foreign_price: it.foreign_price, tax_amount: 0, discount: it.discount, total: it.total,
  })),
  subtotal: doc.subtotal, taxTotal: 0, discountTotal: doc.discount, shipping: doc.shipping,
  grandTotal: doc.total, paidAmount: doc.paid_amount,
  notes: undefined, company, status: doc.status, paymentMethod: doc.payment_method,
  previousDebt: PREV_NET, previousCredit: 0, currentNet: CURRENT_NET,
  packagingInfo: formatPackaging(packaging, packagingItems),
  transportInfo: formatTransports(transports),
  hiddenSections: [],
} as any);

describe("رابط العميل يبني ورقة المعاينة نفسها", () => {
  it("الـHTML متطابقٌ حرفاً بحرف", () => {
    // لا مقارنةَ حقولٍ ولا عيّنات: الناتجُ كلُّه أو لا شيء.
    expect(shared()).toBe(preview());
  });

  it("والأرقام التي تهمّ صاحب المحلّ حاضرةٌ فيه", () => {
    const html = shared();
    const cell = (section: string) =>
      html.match(new RegExp(`data-section="${section}"[\\s\\S]{0,2500}?class="summary-box-value"[^>]*>([^<]*)<`))?.[1].trim();
    expect(cell("invoice-value")).toBe("377,860");
    expect(cell("prev-account-row")).toBe("−1,674,400");
    expect(cell("majmoo-row")).toBe("2,052,260");
    expect(cell("paid-amount")).toBe("1,777,860");
    expect(cell("final-total")).toBe("−274,400");
  });

  it("والتغليفُ والترحيلُ يمرّان بنفس دوالّ المعاينة", () => {
    const html = shared();
    expect(html).toContain("الخرطوم");
    expect(html).toContain("كرتونة");
  });
});

describe("الشحن يصل رابط العميل", () => {
  // كان `shipping` يسقط من مسارات المشاركة، فتنقص «قيمة الفاتورة» بمقداره.
  it("قيمة الفاتورة تحمل الشحن", () => {
    const html = buildSharedDocumentHTML({
      doc_type: "invoice",
      doc: { ...doc, shipping: 250, subtotal: 377_860, total: 377_860 },
      items, customer, company, prev_net: 0, current_net: 0,
    });
    const v = html.match(/data-section="invoice-value"[\s\S]{0,2500}?class="summary-box-value"[^>]*>([^<]*)</)?.[1].trim();
    expect(v).toBe("378,110");
  });
});

describe("رفضُ الرابط يُقال بلغة العميل لا بشفرة", () => {
  it.each([
    ["expired", "انتهت صلاحية"],
    ["not_found", "الرابط غير صحيح"],
    ["doc_missing", "لم يعد موجوداً"],
  ])("%s", (code, text) => {
    expect(() => buildSharedDocumentHTML({ error: code } as any))
      .toThrow(SharedDocumentError);
    try {
      buildSharedDocumentHTML({ error: code } as any);
    } catch (e: any) {
      expect(e.message).toContain(text);
      expect(e.code).toBe(code);
    }
  });
});
