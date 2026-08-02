/**
 * قواعد أمر الشراء — ما يدخل كشف حساب المورد وما لا يدخله.
 *
 * ## الزرّان يعنيان شيئين مختلفين
 *   «حفظ»          → شراء على الحساب: البضاعة لم تُستلم بعد، والمبلغ **دَينٌ
 *                    علينا للمورد** فيظهر في كشفه.
 *   «حفظ واستلام»  → البضاعة تدخل المخزن، ولا يُسجَّل الأمر في كشف المورد.
 *
 * ## «لا يُسجَّل» ليست «مدفوعة»
 * محاولةٌ أولى صفّرت الأثر بكتابة `paid_amount = total` — فيسقط الأمر من
 * معادلة الرصيد في القاعدة بلا هجرة. لكنها تكذب على الدفاتر: تُعلن أن المال
 * دُفع وهو لم يُدفع، فتضيع منك مطالبةٌ قائمة لو استلمت اليوم ودفعت بعد شهر.
 *
 * فالاستبعاد صار **في القراءة لا في الكتابة**: `paid_amount` يبقى صادقاً
 * يحمل ما دُفع فعلاً، والكشف يتخطّى الأوامر المستلَمة عند العرض.
 */

export interface PurchaseSaveInput {
  /** ضغط المستخدم «حفظ واستلام» */
  alsoReceive: boolean;
  /** حالة الأمر في القاعدة قبل هذا الحفظ — `null` للأمر الجديد */
  prevStatusInDb: string | null;
  /** حالة الأمر المختارة في الشاشة (تُستعمل عند الحفظ العادي) */
  formStatus: string;
}

export interface PurchaseSaveDecision {
  /** الحالة التي تُكتب في هذه الخطوة */
  status: string;
}

/**
 * الحالة المكتوبة في خطوة الحفظ.
 *
 * عند الاستلام لأول مرة تُكتب `pending` مؤقتاً ولا تُقلب إلى `received` إلا بعد
 * نجاح إضافة المخزون — حتى لا يترك فشلُ الشبكة أمراً «مستلَماً» بلا بضاعةٍ
 * دخلت، فيُحسب الفارق خطأً في الحفظ التالي ولا يُعوَّض أبداً.
 */
export function decidePurchaseSave(input: PurchaseSaveInput): PurchaseSaveDecision {
  const { alsoReceive, prevStatusInDb, formStatus } = input;
  return {
    status: alsoReceive
      ? (prevStatusInDb === "received" ? "received" : "pending")
      : formStatus,
  };
}

/** أمرٌ استُلمت بضاعته — لا يدخل كشف حساب المورد. */
export function countsInSupplierStatement(
  order: { status?: string | null } | null | undefined,
): boolean {
  const st = String(order?.status || "");
  return st !== "received" && st !== "cancelled";
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * رصيد المورد **محسوباً** من أوامره — لا مقروءاً من `suppliers.balance`.
 *
 * العمود المخزَّن يجمع كل أمر غير ملغى بما فيه المستلَم، فلا يعرف القاعدة
 * الجديدة. وتغييرُه يحتاج هجرةً لا تُطبَّق من بيئة التطوير — والحساب هنا
 * يُغني عنها ويبقى صحيحاً مهما كان العمود.
 */
export function supplierBalanceOf(
  orders: Array<{ status?: string | null; total?: number | null; paid_amount?: number | null }> | null | undefined,
): number {
  if (!orders?.length) return 0;
  return r2(
    orders
      .filter(countsInSupplierStatement)
      .reduce((s, o) => s + Math.max(0, r2(Number(o.total || 0) - Number(o.paid_amount || 0))), 0),
  );
}
