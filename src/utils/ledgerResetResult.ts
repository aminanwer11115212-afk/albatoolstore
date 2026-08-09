/**
 * قراءةُ ما تُعيده دالّةُ التصفير — ليَعرف صاحبُ النظام أن الهجرة وصلت.
 *
 * ## المشكلة التي يحلّها
 * هجراتُ Supabase لا تُطبَّق من بيئة التطوير (الوصول محجوب، والمفتاح عام).
 * فكلُّ إصلاحٍ في القاعدة ينتهي بجولةٍ يدوية: «طبّقها من SQL Editor» ثمّ
 * «هل طُبِّقت؟» — سؤالٌ لا يملك أحدٌ جوابَه إلا بفتح لوحة Supabase.
 *
 * ودالّةُ `admin_reset_stock_and_ledgers` **تُعيد أصلاً** حصيلةَ ما فعلت:
 * كم حركةً حُذفت، وكم فاتورةً عُلِّمت مدفوعة، وكم قيدَ تسويةٍ أُدرج. وكان
 * هذا الناتج يُرمى: الشاشةُ تقرأ `error` وحدَه.
 *
 * فمن الحصيلة نفسِها تُعرف النسخة: مفتاحُ `settlements_inserted` لا تُنتجه
 * إلا النسخةُ التي أدخلتها الهجرة. فإن غاب فالقاعدةُ على النسخة القديمة —
 * وتُقال بالاسم بدل أن يُترك المستخدم مع `inconsistent_invoice_payment`.
 *
 * ## ولماذا لا يكفي أن ينجح النداء
 * النسخةُ القديمة تسقط بالحارس المؤجَّل **متى وُجدت فاتورةٌ غير نقدية**.
 * فلو كانت القاعدةُ فارغةً من ذلك لنجح النداءُ وهو على النسخة القديمة، ولظنّ
 * صاحبُه أن الهجرة وصلت. فالنجاحُ ليس دليلاً — الحصيلةُ هي الدليل.
 */

/** اسمُ الهجرة التي أدخلت قيدَ التسوية — يُذكر في الرسالة كي يُبحث عنه. */
export const LEDGER_RESET_MIGRATION = "20260809120000_ledger_reset_consistency";

/** المفتاحُ الذي لا تُنتجه إلا النسخةُ الجديدة. */
const SETTLEMENT_KEY = "settlements_inserted";

/** مفتاحٌ تُنتجه النسختان — وجودُه يعني أننا ننظر إلى حصيلةٍ لا إلى فراغ. */
const SHARED_KEY = "invoices_marked_paid";

export type LedgerResetVersion = "current" | "legacy" | "unknown";

/**
 * أيُّ نسخةٍ من الدالّة في القاعدة، من حصيلتها.
 *
 * - `current` — فيها `settlements_inserted`: الهجرة مطبَّقة.
 * - `legacy`  — حصيلةٌ بلا هذا المفتاح: النسخة القديمة.
 * - `unknown` — لا حصيلة أصلاً (نطاقٌ لم يمسّ كشوف الحسابات، أو ناتجٌ غريب).
 */
export function ledgerResetVersion(raw: unknown): LedgerResetVersion {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "unknown";
  const o = raw as Record<string, unknown>;
  if (SETTLEMENT_KEY in o) return "current";
  if (SHARED_KEY in o) return "legacy";
  return "unknown";
}

/** الأعدادُ وحدَها من الحصيلة — للعرض في ملخّص العملية. */
export function ledgerResetCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * يرمي برسالةٍ تُسمّي العلّة إن كانت القاعدةُ على النسخة القديمة.
 *
 * @param raw حصيلةُ `admin_reset_stock_and_ledgers`
 * @param ledgerInScope هل شمل النطاقُ كشوفَ الحسابات — وإلا فلا حكم:
 *        تصفيرُ المخزون وحدَه لا يُنتج `settlements_inserted` في النسختين.
 */
export function assertLedgerResetApplied(raw: unknown, ledgerInScope: boolean): void {
  if (!ledgerInScope) return;
  if (ledgerResetVersion(raw) !== "legacy") return;
  throw new Error(
    "الدالّة في قاعدة البيانات نسخةٌ قديمة لا تُدرج قيدَ التسوية — هجرة " +
      LEDGER_RESET_MIGRATION +
      " غير مطبَّقة. طبّقها من SQL Editor في لوحة Supabase ثمّ أعد المحاولة.",
  );
}

/** سطرٌ عربيٌّ يُعرض كما هو في ملخّص العملية. */
export function ledgerResetLine(raw: unknown, ledgerInScope: boolean): string {
  const counts = ledgerResetCounts(raw);
  if (!ledgerInScope) return `تُصفِّر المخزون: ${counts.products_zeroed ?? 0} منتجاً`;
  const v = ledgerResetVersion(raw);
  if (v === "legacy") return "النسخة القديمة من الدالّة — الهجرة غير مطبَّقة";
  if (v === "unknown") return "لا حصيلة من الدالّة";
  return (
    `حُذفت ${counts.customer_txs_deleted ?? 0} حركة، ` +
    `وعُلِّمت ${counts.invoices_marked_paid ?? 0} فاتورة مدفوعة، ` +
    `وأُدرج ${counts[SETTLEMENT_KEY] ?? 0} قيد تسوية`
  );
}
