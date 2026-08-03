/**
 * رسالة واتساب لشحن رصيد العميل.
 *
 *   👤 العميل: عميل تجريبي تبع مينا
 *
 *   💳 كان عليك: 200,000
 *   ✅ تم سداد: 100,000
 *   📌 المتبقي عليك: 100,000
 *   📅 02/08/2026
 *
 * ## لماذا اختفت الإشارات من هنا وحدها
 * الإشارة الموحّدة في النظام (`+` أخضر لصالح العميل، `−` عليه) لغةُ **كشفٍ
 * محاسبي** يقرؤه صاحب المستودع. أما هذه فرسالةٌ تصل العميل نفسه على واتساب،
 * بلا لون يفرّق ولا عمودٍ يشرح، فـ«−100,000» تُقرأ ناقصاً حسابياً لا ديناً.
 * فحُملت الجهةُ في اللفظ: «عليك» و«لك» — أوضح من رمزٍ يحتاج مفتاحاً، ولا
 * يناقض الكشف لأنه يقول الشيء نفسه بكلماته.
 *
 * ## معنى السطور
 *   «كان عليك/لك»    — صافي حساب العميل **قبل** السداد.
 *   «تم سداد»        — المبلغ المستلَم كاملاً.
 *   «المتبقي عليك/لك» — صافي الحساب **بعد** السداد.
 *
 * والحسابُ المقفل لا يُكتب «0» فيه: «كان حسابك مسدداً» و«تم السداد بالكامل»
 * جملتان تُقرآن، والصفرُ رقمٌ لا يقول شيئاً.
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

/**
 * حال الحساب بلغة العميل: الجهة في اللفظ والمبلغ بلا إشارة.
 * `net` بإشارة الدفاتر — موجب = على العميل.
 */
function accountLine(net: number, owedLabel: string, creditLabel: string, settled: string): string {
  const n = r2(net);
  if (Math.abs(n) < 0.01) return settled;
  return n > 0 ? `${owedLabel}: ${money(n)}` : `${creditLabel}: ${money(n)}`;
}

export function buildChargeWhatsAppMessage(input: ChargeMessageInput): string {
  const { customerName, date } = input;
  const amount = Math.max(r2(input.amount), 0);
  const netBefore = r2(input.netBefore);
  const netAfter = r2(netBefore - amount);

  return [
    `👤 العميل: ${customerName}`,
    "",
    `💳 ${accountLine(netBefore, "كان عليك", "كان لك رصيد", "كان حسابك مسدداً")}`,
    `✅ تم سداد: ${money(amount)}`,
    `📌 ${accountLine(netAfter, "المتبقي عليك", "رصيدك الآن", "تم السداد بالكامل")}`,
    `📅 ${formatChargeDate(date)}`,
  ].join("\n");
}
