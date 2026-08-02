/**
 * قواعد حفظ أمر الشراء — ما يدخل حساب المورد وما لا يدخله.
 *
 * ## الزرّان يعنيان شيئين مختلفين
 *   «حفظ»          → شراء على الحساب: البضاعة لم تُستلم بعد، والمبلغ **دَينٌ
 *                    علينا للمورد** فيظهر في كشفه.
 *   «حفظ واستلام»  → شراء نقدي: البضاعة دخلت المخزن والمبلغ سُوّي على الفور،
 *                    فلا يُسجَّل شيءٌ على المورد.
 *
 * ## كيف يسقط المبلغ من كشف المورد بلا هجرة
 * رصيد المورد محسوبٌ في القاعدة بمعادلة قائمة:
 *
 *     balance = Σ GREATEST(total − paid_amount, 0)   لكل أمر غير ملغى
 *
 * فتسويةُ الأمر لحظةَ الاستلام (`paid_amount = total`) تُصفّر حصّته من المجموع
 * دون لمس المعادلة ولا التريغر. لا هجرة، ولا عمود جديد، ولا فرعٌ ثانٍ في
 * الحساب يمكن أن ينسى أحدٌ تحديثه.
 *
 * ## ما لا تفعله هذه الدالّة
 * لا تُنقص مدفوعاً مسجَّلاً. أمرٌ دُفع له 800 من 1000 ثم استُلم يصير مسدَّداً
 * بالكامل (1000)؛ أمّا العكس — أمرٌ سُدِّد ثم حُوِّل إلى «غير مستلَم» — فيحتفظ
 * بما دُفع فعلاً، لأن الدفع واقعةٌ لا يمحوها تغيير الحالة.
 */

export interface PurchaseSaveInput {
  /** ضغط المستخدم «حفظ واستلام» */
  alsoReceive: boolean;
  /** حالة الأمر في القاعدة قبل هذا الحفظ — `null` للأمر الجديد */
  prevStatusInDb: string | null;
  /** حالة الأمر المختارة في الشاشة (تُستعمل عند الحفظ العادي) */
  formStatus: string;
  /** إجمالي الأمر بعد الخصم */
  grandTotal: number;
  /** المدفوع المسجَّل على الأمر قبل هذا الحفظ */
  existingPaid?: number | null;
}

export interface PurchaseSaveDecision {
  /** الحالة التي تُكتب في هذه الخطوة */
  status: string;
  /** `paid_amount` المكتوب — منه يُشتقّ ما يظهر في كشف المورد */
  paidAmount: number;
  /** ما سيضيفه هذا الأمر إلى رصيد المورد */
  supplierDebt: number;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function decidePurchaseSave(input: PurchaseSaveInput): PurchaseSaveDecision {
  const { alsoReceive, prevStatusInDb, formStatus, grandTotal } = input;
  const total = Math.max(0, r2(grandTotal));
  const existingPaid = Math.max(0, r2(input.existingPaid ?? 0));

  /**
   * الحالة المكتوبة في هذه الخطوة.
   *
   * عند الاستلام لأول مرة تُكتب `pending` مؤقتاً ولا تُقلب إلى `received` إلا
   * بعد نجاح إضافة المخزون — حتى لا يترك فشلُ الشبكة أمراً «مستلَماً» بلا
   * بضاعةٍ دخلت، فيُحسب الفارق خطأً في الحفظ التالي ولا يُعوَّض أبداً.
   */
  const status = alsoReceive
    ? (prevStatusInDb === "received" ? "received" : "pending")
    : formStatus;

  // النية هي الفاصل لا الحالة المكتوبة: الاستلام يُسوّي الأمر ولو كُتبت
  // `pending` مؤقتاً في هذه الخطوة.
  const settled = alsoReceive || prevStatusInDb === "received";
  const paidAmount = settled ? Math.max(total, existingPaid) : existingPaid;

  return { status, paidAmount, supplierDebt: Math.max(0, r2(total - paidAmount)) };
}
