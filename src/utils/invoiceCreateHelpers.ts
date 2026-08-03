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

/** تدوير نقدي موحّد — منزلتان. مصدرٌ واحد حتى لا يختلف بندٌ عن بند. */
export function roundMoney(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * السعر المحلي = الأجنبي × المعدّل، مدوَّراً مرّةً واحدة.
 *
 * الضرب الخام كان مبعثراً في ستّة مواضع (شريط الإضافة، حقل السعر الأجنبي،
 * حقل المعدّل، نافذة المنتج السريع، استيراد الرسالة — في الشاشتين)، فينتج
 * `51799.999999999994` ويظهر في الجدول رقماً بكسورٍ لا معنى لها.
 */
export function computeUnitPrice(foreignPrice: unknown, rate: unknown): number {
  return roundMoney((Number(foreignPrice) || 0) * (Number(rate) || 0));
}

/**
 * السعر المحلي لبطاقة المنتج = الأجنبي × المعدّل، **رقماً صحيحاً بلا كسور**.
 *
 * يختلف عن `computeUnitPrice` عمداً: سعر البند في الفاتورة قد يحتاج القروش
 * (خصمٌ نسبي، كمية كسرية)، أمّا سعر البطاقة فرقمٌ يُعلَن للزبون ويُكتب على
 * الرفّ — و«2,520.00» لا تُقرأ ولا تُنطق. فالتدوير هنا للوحدة الكاملة:
 *
 *     2   × 1400 = 2,800
 *     1.8 × 1400 = 2,520
 *     33  × 1400 = 46,200
 */
export function productLocalPrice(foreignPrice: unknown, rate: unknown): number {
  const fp = Number(foreignPrice) || 0;
  const r = Number(rate) || 0;
  if (fp <= 0 || r <= 0) return 0;
  return Math.round(fp * r);
}

/** دقّة اشتقاق المعدّل من (المحلي ÷ الأجنبي). */
export const RATE_PRECISION = 6;

/**
 * معدّل الصفّ مشتقّاً من سعرَيه.
 *
 * الدقّة هنا ليست تجميلاً: كانت ثلاث منازل، فبندٌ محلّيه 51,800 وأجنبيّه 763.63
 * يُشتقّ له 67.834، وأيّ إعادة حساب لاحقة تُرجع 51,800.23 — كسورٌ تظهر للمستخدم
 * من لا شيء. بستّ منازل يبقى الفرق دون نصف قرش فيبتلعه `roundMoney`.
 */
export function deriveRowRate(unitPrice: unknown, foreignPrice: unknown): number {
  const up = Number(unitPrice) || 0;
  const fp = Number(foreignPrice) || 0;
  if (fp <= 0 || up <= 0) return 1;
  const f = 10 ** RATE_PRECISION;
  return Math.round((up / fp) * f) / f;
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
/**
 * سعر الصرف الفعلي لصفٍّ عند اختيار منتج له.
 *
 * ## العطل الذي عالجَته
 * الصفّ الفارغ يُنشأ بـ`exchange_rate: 1` قيمةً أوّلية لا اختياراً. والحارس
 * القديم كان `rate > 0 ? rowRate : defaultRate` — والواحد أكبر من صفر، فيمرّ.
 *
 * فمن يستدعي فاتورة قديمة ويضيف صنفاً يحصل على:
 *
 *     unit_price = 763.63 × 1 = 763.63     بدل   763.63 × 67.8 = 51,800
 *
 * أي أن **السعر الأجنبي ينزل مكان المحلي** — ولا يبدو خطأً صارخاً، بل رقماً
 * بكسورٍ صغير، فيمرّ على من لا يحفظ السعر.
 *
 * ## القاعدة
 * معدّل الصفّ يُحترم إلا أن يكون `1` بينما للمستند معدّلٌ حقيقي غيره — فالواحد
 * حينها بقيّةُ التهيئة لا قراراً. ومستندٌ معدّله 1 فعلاً يبقى على 1 لأن
 * `defaultRate` يساويه.
 */
export function effectiveRowRate(rowRate: unknown, defaultRate: unknown): number {
  const r = Number(rowRate) || 0;
  const d = Number(defaultRate) || 0;
  if (d > 0 && (r <= 0 || r === 1)) return d;
  return r > 0 ? r : 1;
}

export function priceFromProduct(
  p: { foreign_price?: number | null; sale_price?: number | null },
  exchangeRate: number,
): { foreign_price: number; unit_price: number } {
  const fp = Number(p.foreign_price) || Number(p.sale_price) || 0;
  const rate = Number(exchangeRate) || 1;
  return { foreign_price: fp, unit_price: computeUnitPrice(fp, rate) };
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
  return { foreign_price: cardFp, exchange_rate: deriveRowRate(up, cardFp) };
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
  return { ...row, exchange_rate: rate, unit_price: computeUnitPrice(row.foreign_price, rate) };
}

export function calcTotal(r: InvRow): number {
  const sub = r.quantity * r.unit_price;
  const afterDisc = sub - sub * (r.discount / 100);
  return roundMoney(afterDisc);
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
