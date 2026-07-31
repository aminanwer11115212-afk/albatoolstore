/**
 * رسالة واتساب لشحن رصيد العميل — صيغة **ثابتة** لا تتغيّر من حالة لأخرى،
 * فيألفها العميل ويقرأها بنظرة واحدة:
 *
 *   مرحبا أمين اسماعيل
 *   تم شحن +500
 *   تم خصم 300
 *   المتبقي +200
 *   التاريخ 31/07/2026
 *
 * ## معنى السطور
 *   «تم شحن»  — المبلغ المشحون كاملاً.
 *   «تم خصم»  — ما ابتلعه الشحن من دَين العميل القائم (صفر إن لم يكن عليه شيء).
 *   «المتبقي» — صافي حساب العميل **بعد** الشحن بإشارة العرض:
 *                 موجب «+» رصيد له مخزَّن عندنا،
 *                 سالب «−» ما زال عليه.
 *
 * الإشارة هنا هي نفسها المستعملة في كشف الحساب (`signedAmountText`)، فلا يرى
 * العميل «+» يعني شيئاً في الرسالة وشيئاً آخر في الكشف.
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

export function buildChargeWhatsAppMessage(input: ChargeMessageInput): string {
  const { customerName, date } = input;
  const amount = Math.max(r2(input.amount), 0);
  const applied = chargeApplied(amount, input.netBefore);
  // بإشارة العرض: موجب لصالح العميل. `netAfter` بإشارة الدفاتر أولاً ثم نعكسها.
  const shownAfter = r2(-(r2(input.netBefore) - amount));

  // الصفر بلا إشارة: «+0» تقرأ ركيكة، والحساب الخالص لا يحتاج إشارة أصلاً.
  const afterText =
    Math.abs(shownAfter) < 0.01 ? "0" : `${shownAfter < 0 ? "−" : "+"}${money(shownAfter)}`;

  return [
    `مرحبا ${customerName}`,
    `تم شحن +${money(amount)}`,
    `تم خصم ${money(applied)}`,
    `المتبقي ${afterText}`,
    `التاريخ ${formatChargeDate(date)}`,
  ].join("\n");
}
