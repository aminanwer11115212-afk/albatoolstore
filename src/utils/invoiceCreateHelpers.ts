import React from "react";

/** أنواع وأدوات مساعدة مستخرجة من InvoiceCreatePage — منطق نقي بدون closure. */

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  balance: number | null;
  company: string | null;
}

export interface Product {
  id: string;
  name: string;
  sale_price: number | null;
  foreign_price: number | null;
  unit: string | null;
  stock_quantity: number | null;
  warehouse_id?: string | null;
}

export interface InvRow {
  uid: string;
  dbId?: string | null;
  product_id: string | null;
  product_name: string;
  productSearch: string;
  quantity: number;
  foreign_price: number;
  exchange_rate: number;
  unit_price: number;
  discount: number;
  total: number;
  unit: string | null;
  showSuggestions: boolean;
  selected: boolean;
  note: string;
}

export function newRow(rate: number = 1): InvRow {
  return {
    uid: crypto.randomUUID(),
    dbId: null,
    product_id: null,
    product_name: "",
    productSearch: "",
    quantity: 1,
    foreign_price: 0,
    exchange_rate: rate,
    unit_price: 0,
    discount: 0,
    total: 0,
    unit: null,
    showSuggestions: false,
    selected: false,
    note: "",
  };
}

/**
 * سعر الصرف الافتراضي للبنود الجديدة.
 *
 * الفاتورة الجديدة تأخذه من جدول `exchange_rates`. الفاتورة القديمة كانت
 * تأخذه من بنودها فقط، فإذا لم يحمل أي بند سعراً أجنبياً بقي على 1 وأُدرج
 * الصنف الجديد بسعره الأجنبي الخام كسعر محلي. الأولوية هنا للمشتق من
 * الفاتورة (حتى تبقى بنودها متجانسة) ثم للسعر العام، و1 كملاذ أخير.
 */
export function resolveDefaultRate(derivedRate?: number | null, globalRate?: number | null): number {
  const derived = Number(derivedRate) || 0;
  if (derived > 0) return derived;
  const global = Number(globalRate) || 0;
  if (global > 0) return global;
  return 1;
}

/** سعر الصرف المشتقّ من بنود فاتورة محفوظة (أول بند يحمل سعراً أجنبياً). */
export function deriveRateFromRows(rows: Array<{ foreign_price?: any; exchange_rate?: any }>): number {
  const hit = rows.find((r) => (Number(r.foreign_price) || 0) > 0 && (Number(r.exchange_rate) || 0) > 0);
  return hit ? Number(hit.exchange_rate) : 0;
}

/**
 * قيم السعر عند اختيار منتج لصف — مسار واحد للفاتورة الجديدة والقديمة.
 * يُفضَّل السعر الأجنبي من بطاقة المنتج، ويُستخدم سعر البيع كبديل.
 */
export function priceFromProduct(
  p: { foreign_price?: number | null; sale_price?: number | null },
  exchangeRate: number,
): { foreign_price: number; unit_price: number } {
  const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
  const rate = Number(exchangeRate) || 1;
  return { foreign_price: fp, unit_price: Math.round(fp * rate * 100) / 100 };
}

/**
 * صف مُحمَّل من فاتورة قديمة بلا سعر أجنبي مخزَّن، بينما بطاقة المنتج تحمل واحداً:
 * نملأ السعر الأجنبي ونشتقّ سعر الصرف منه بحيث **يبقى السعر المحلي كما هو**
 * حرفياً — فلا يتغيّر أي إجمالي أو رصيد، ويتطابق العرض مع مسار الإضافة.
 * يعيد `null` إذا لم يكن هناك ما يُملأ.
 */
export function backfillForeignPrice(
  row: { foreign_price?: any; unit_price?: any },
  card: { foreign_price?: number | null } | undefined | null,
): { foreign_price: number; exchange_rate: number } | null {
  if ((Number(row.foreign_price) || 0) > 0) return null;
  const up = Number(row.unit_price) || 0;
  const cardFp = Number(card?.foreign_price) || 0;
  if (up <= 0 || cardFp <= 0) return null;
  return { foreign_price: cardFp, exchange_rate: Math.round((up / cardFp) * 1000) / 1000 };
}

/**
 * إعادة تسعير الصفوف بعد تغيير سعر الصرف.
 * الصفوف التي لا تحمل سعراً أجنبياً تُترك كما هي — ضربها في السعر كان يصفّر
 * سعرها المحلي ويتلف بنود الفواتير القديمة المسعّرة محلياً.
 */
export function applyRateToRow<T extends { foreign_price: number; unit_price: number; exchange_rate: number }>(
  row: T,
  rate: number,
): T {
  if ((Number(row.foreign_price) || 0) <= 0) return row;
  return { ...row, exchange_rate: rate, unit_price: Math.round(row.foreign_price * rate * 100) / 100 };
}

export function calcTotal(r: InvRow): number {
  const sub = r.quantity * r.unit_price;
  const afterDisc = sub - sub * (r.discount / 100);
  return Math.round(afterDisc * 100) / 100;
}

export const btnStyle = (bg: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3,
  background: bg, color: "#fff", border: "none",
  borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", height: 26, lineHeight: 1.1, whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
});

// بصمة مختصرة لبنود الفاتورة لاكتشاف ما إن تغيّرت قبل الحفظ
export function invoiceItemsHash(items: Array<{ product_id?: string | null; quantity?: any; unit_price?: any; foreign_price?: any; discount?: any; unit?: any; product_name?: any }>): string {
  return items
    .map((it) => [
      it.product_id || "",
      Number(it.quantity) || 0,
      Number(it.unit_price) || 0,
      Number(it.foreign_price) || 0,
      Number(it.discount) || 0,
      it.unit || "",
      it.product_name || "",
    ].join("|"))
    .join("§");
}
