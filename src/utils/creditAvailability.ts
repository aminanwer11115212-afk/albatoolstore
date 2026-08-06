/**
 * الرصيدُ الدائن المتاح للإنفاق — لا يكون سالباً أبداً.
 *
 * ## العطل الذي عالجه
 * شحنٌ بالسالب يجعل `credit_balance` سالباً (خصمٌ على العميل). ثمّ في نافذة
 * الدفع يُقصَّ «الرصيد المستخدَم» بسقفٍ هو الرصيد نفسه:
 *
 *     const cu = Math.min(Math.max(0, creditUse), credit);
 *
 * فإذا كان `credit = -5000` صارت `Math.min(0, -5000) = -5000` — أي أن
 * **الخصم يُطرح من الدفعة**. فبفاتورةٍ 11,200 وحسابٍ قديم 5,000 (المطلوب
 * 16,200) ودفعةٍ 16,000 خرج «حساب العميل بعد الدفع: عليه 5,200» — والصواب
 * **200**. صوّره صاحب المستودع.
 *
 *     paid = 16,000 + (-5,000) = 11,000
 *     16,200 - 11,000 = 5,200      ← الرقم الخاطئ بعينه
 *
 * ## والمفهوم نفسه كان ناقصاً
 * «الرصيد الدائن» في القاعدة عددٌ ذو إشارة: موجبُه رصيدٌ للعميل، وسالبُه
 * خصمٌ عليه. أمّا **المتاح للإنفاق** فلا معنى لسالبه: من عليه خصمٌ لا يملك
 * رصيداً يدفع منه. فيُقصّ عند الصفر مرّةً واحدة هنا، لا في كل موضعٍ يستعمله.
 *
 * وأثرُه كان في العرض وحده — مسارُ الحفظ يقصّ بـ`Math.max(0, …)` فلم يكتب
 * قيداً خاطئاً. لكنّ المستخدم يقرّر على ما يرى.
 */

/** ما يملكه العميل فعلاً ليدفع منه — الخصمُ ليس رصيداً. */
export function availableCredit(creditBalance: number | null | undefined): number {
  const c = Number(creditBalance);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** المستخدَم من الرصيد: بين الصفر والمتاح، مهما طُلب. */
export function creditUsed(
  requested: number | string | null | undefined,
  creditBalance: number | null | undefined,
): number {
  const want = Number(requested);
  const asked = Number.isFinite(want) && want > 0 ? want : 0;
  return Math.min(asked, availableCredit(creditBalance));
}
