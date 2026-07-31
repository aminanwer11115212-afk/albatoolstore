/**
 * رسالة واتساب لشحن رصيد العميل — تحكي القصة كاملة بترتيبها:
 * ماذا شُحن، وكيف كان الحساب، وكم ابتلع الشحن منه، وما بقي.
 *
 *   عميلنا العزيز ايهاب الدين امدرمان
 *   تم شحن +50,000
 *   الحساب −100,000
 *   تم خصم +50,000
 *   المتبقي −50,000
 *   التاريخ 31/07/2026
 *
 * ## معنى السطور
 *   «تم شحن»  — المبلغ المشحون كاملاً.
 *   «الحساب»  — صافي حساب العميل **قبل** الشحن.
 *   «تم خصم»  — ما ابتلعه الشحن من دَين العميل القائم.
 *                **يُحذف السطر كاملاً إذا لم يكن هناك خصم** — لا يُكتب «0».
 *   «المتبقي» — صافي حساب العميل **بعد** الشحن.
 *
 * ## الإشارة
 * كل المبالغ الموقّعة بإشارة **العرض** الموحّدة في النظام كلّه:
 *   «+» في مصلحة العميل (رصيد له، أو خصم يُنقص دَينه)
 *   «−» عليه
 * وهي نفسها إشارة `signedAmountText` في كشف الحساب، فلا تعني «+» شيئاً في
 * الرسالة وشيئاً آخر في الكشف. الصفر بلا إشارة.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => Math.abs(r2(n)).toLocaleString();

export interface ChargeMessageInput {
  customerName: string;
  /** المبلغ المشحون */
  amount: number;
  /** صافي حساب العميل قبل الشحن بإشارة الدفاتر: موجب = عليه دَين */
  netBefore: number;
  /** YYYY-MM-DD */
  date: string;
}

/** «31/07/2026» — وإن جاء التاريخ بصيغة غير متوقّعة يُعاد كما هو. */
export function formatChargeDate(date: string): string {
  const [yy, mm, dd] = String(date || "").split("-");
  return yy && mm && dd ? `${dd}/${mm}/${yy}` : String(date || "");
}

/** ما ابتلعه الشحن من الدَّين القائم — لا يتجاوز المبلغ ولا الدَّين. */
export function chargeApplied(amount: number, netBefore: number): number {
  const owed = Math.max(r2(netBefore), 0);
  return r2(Math.min(Math.max(r2(amount), 0), owed));
}

/** رقم موقّع بإشارة العرض. الصفر بلا إشارة — «+0» تُقرأ ركيكة. */
function signed(shown: number): string {
  const n = r2(shown);
  if (Math.abs(n) < 0.01) return "0";
  return `${n < 0 ? "−" : "+"}${money(n)}`;
}

export function buildChargeWhatsAppMessage(input: ChargeMessageInput): string {
  const { customerName, date } = input;
  const amount = Math.max(r2(input.amount), 0);
  const netBefore = r2(input.netBefore);
  const applied = chargeApplied(amount, netBefore);
  // بإشارة العرض: موجب لصالح العميل، فتُعكس إشارة الدفاتر.
  const shownBefore = r2(-netBefore);
  const shownAfter = r2(-(netBefore - amount));

  return [
    `عميلنا العزيز ${customerName}`,
    `تم شحن +${money(amount)}`,
    `الحساب ${signed(shownBefore)}`,
    // بلا خصم لا سطر أصلاً — «تم خصم 0» سطر فارغ المعنى يشوّش القراءة.
    ...(applied > 0.009 ? [`تم خصم +${money(applied)}`] : []),
    `المتبقي ${signed(shownAfter)}`,
    `التاريخ ${formatChargeDate(date)}`,
  ].join("\n");
}
