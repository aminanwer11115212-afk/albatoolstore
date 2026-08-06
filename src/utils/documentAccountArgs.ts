/**
 * وسائطُ حساب العميل في الورقة — مصدرٌ واحد لكل من يبنيها.
 *
 * ## العطل الذي عالجه
 * زرُّ «واتساب PDF» في تعديل الفاتورة كان يُرسل للعميل ورقةً تقول إنّ عليه
 * 377,860 — وله في الحقيقة 47,740. أرسل صاحب المستودع الورقتين متجاورتين:
 *
 * |                  | المعاينة    | زرّ واتساب |
 * |------------------|-------------|------------|
 * | الحساب القديم    | 25,600 له   | **غائب**   |
 * | جملة الحساب      | 352,260     | 377,860    |
 * | المدفوع          | 400,000     | **0**      |
 * | رصيد العميل      | 47,740 له   | −377,860 عليه |
 *
 * ## والسبب أنّ الشاشة لا تمرّر الحساب أصلاً
 * `buildCurrentPrintHTML` في شاشة الإدخال لا تمرّر `previousDebt` ولا
 * `previousCredit` ولا `currentNet` ولا `paidAmount`. فيسقط القالب إلى
 * أصفاره: لا حسابَ قديم، ولا مدفوع، والرصيدُ الحالي = جملة الفاتورة كلُّها
 * على العميل.
 *
 * وصفحةُ المعاينة تحسبها وتمرّرها — فافترقت الورقتان في **المال** لا في
 * الشكل. وهو أخطرُ ما يقع: العميل يستلم ورقةً بدَينٍ ليس عليه.
 *
 * ## ولهذا صار الحساب هنا
 * أربعةُ مواضع تبني الورقة (معاينةُ الفاتورة، وشاشةُ تعديلها، ومعاينةُ عرض
 * السعر، وشاشتُه). فما دام كلٌّ يحسب لنفسه، عاد الافتراق. والحسابُ الآن
 * دالّةٌ واحدة، ويحرسه اختبارُ تطابقٍ يقارن المخرجين.
 */
import { supabase } from "@/integrations/supabase/client";
import { netBalanceOf } from "@/utils/balanceDisplay";
import { netBeforeInvoice } from "@/utils/customerNetBefore";

/** ما يقرؤه القالب من حساب العميل. */
export interface DocumentAccountArgs {
  previousDebt: number;
  previousCredit: number;
  /** الرصيد الفعلي بعد المستند — منه يُشتقّ «المدفوع». `null` لمستندٍ لم يُحفظ. */
  currentNet: number | null;
  oldBalance: number;
  paidAmount: number;
}

/** صفٌّ فيه رصيدُ العميل بأي من صيغه. */
export type BalanceLike =
  | { balance?: number | null; credit_balance?: number | null; net_balance?: number | null }
  | null
  | undefined;

/** مستندٌ بلا عميل: لا حسابَ يُعرض. */
export const NO_ACCOUNT: DocumentAccountArgs = {
  previousDebt: 0,
  previousCredit: 0,
  currentNet: null,
  oldBalance: 0,
  paidAmount: 0,
};

/**
 * يقسم صافياً إلى دَينٍ ورصيد.
 *
 * القالبُ لا يقرأ إلا فرقَهما (`previousDebt - previousCredit`)، فالقسمةُ
 * بالإشارة تكفي ولا تحتاج الرقمين الخامين — وهي أوضح: رقمٌ واحد في جهةٍ
 * واحدة لا رقمان يتقاصّان.
 */
export function splitNet(net: number): { previousDebt: number; previousCredit: number } {
  return { previousDebt: net > 0 ? net : 0, previousCredit: net < 0 ? -net : 0 };
}

/**
 * عرضُ السعر: رصيدُ العميل كما هو — العرض لا يحرّك حساباً.
 *
 * ولهذا `currentNet` يبقى `null`: القالب في عرض السعر يجعل الرصيد النهائي هو
 * السابقَ نفسه، فلا شيء يُشتقّ.
 */
export function accountArgsForQuote(customer: BalanceLike): DocumentAccountArgs {
  if (!customer) return NO_ACCOUNT;
  const net = netBalanceOf(customer as any);
  return { ...splitNet(net), currentNet: null, oldBalance: net, paidAmount: 0 };
}

/**
 * الفاتورة: «الحساب القديم» ما كان على العميل **قبلها**.
 *
 * ولا يُؤخذ بطرح الفاتورة من الرصيد الحالي: ذلك يُدخل في «القديم» فواتيرَ
 * أُنشئت بعدها، ويقصّ عند الصفر فيشوّه الصافي حين يجتمع دَينٌ ورصيد. فيُحسب
 * من دفتر العميل بترتيبه الزمني — `netBeforeInvoice`.
 *
 * وفاتورةٌ لم تُحفظ بعد ليست في الدفتر، فالقديمُ رصيدُ العميل الحالي كما هو،
 * والمدفوعُ صفر.
 */
export async function accountArgsForInvoice(
  invoiceId: string | null | undefined,
  customer: BalanceLike,
  paidAmount = 0,
  customerId?: string | null,
): Promise<DocumentAccountArgs> {
  if (!customer) return NO_ACCOUNT;
  const net = netBalanceOf(customer as any);

  // مستندٌ لم يُحفظ: لا سطرَ له في الدفتر، فالقديمُ هو الحالي
  if (!invoiceId || !customerId) {
    return { ...splitNet(net), currentNet: null, oldBalance: net, paidAmount: 0 };
  }

  let prevNet: number | null = null;
  try {
    const [{ data: invoices }, { data: transactions }] = await Promise.all([
      (supabase as any)
        .from("invoices")
        .select("id, total, paid_amount, status, date, created_at")
        .eq("customer_id", customerId),
      (supabase as any)
        .from("transactions")
        .select("id, category, amount, method, reference_id, allocation, date, created_at")
        .eq("customer_id", customerId)
        .in("category", ["customer_payment", "customer_credit"]),
    ]);
    prevNet = netBeforeInvoice(String(invoiceId), {
      invoices: invoices || [],
      transactions: transactions || [],
    } as any);
  } catch (e) {
    console.warn("[documentAccountArgs] تعذّر حساب الحساب القديم", e);
  }

  // تعذّر الحساب من الدفتر: الرصيدُ الحالي أقربُ ما يُعرف، ولا يُترك صفراً
  if (prevNet == null) prevNet = net;

  return {
    ...splitNet(prevNet),
    currentNet: net,
    oldBalance: net,
    paidAmount: Number(paidAmount) || 0,
  };
}
