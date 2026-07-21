/**
 * تحقق من صحة الدفع بالتحويل البنكي.
 *
 * القواعد:
 * 1) يجب اختيار حساب من نوع "bank".
 * 2) اسم البنك (bank_name أو name) يجب أن يحتوي على إحدى الكلمات المسموح بها:
 *    "فيصل" أو "أم درمان" أو "الخرطوم".
 * 3) يجب إدخال رقم العملية (مرجع التحويل).
 */

export const ALLOWED_BANK_KEYWORDS = ["فيصل", "أم درمان", "الخرطوم"] as const;

export interface BankAccountLike {
  id?: string;
  name?: string | null;
  bank_name?: string | null;
  account_type?: string | null;
  account_number?: string | null;
  is_default?: boolean | null;
}

/** هل الحساب من نوع بنك ومن إحدى البنوك الثلاثة المعتمدة. */
export function isAllowedBank(account: BankAccountLike | null | undefined): boolean {
  if (!account) return false;
  if (account.account_type !== "bank") return false;
  const haystack = `${account.bank_name ?? ""} ${account.name ?? ""}`;
  return ALLOWED_BANK_KEYWORDS.some((kw) => haystack.includes(kw));
}

/** هل طريقة الدفع تحويل بنكي. */
export function isBankPaymentMethod(method: string | null | undefined): boolean {
  return method === "bank" || method === "bank_transfer";
}

/** هل طريقة الدفع نقدية. */
export function isCashPaymentMethod(method: string | null | undefined): boolean {
  return method === "cash";
}

/**
 * فلترة قائمة الحسابات حسب طريقة الدفع المختارة.
 * - بنكي/بطاقة/شيك: حسابات نوع bank فقط.
 * - نقدي: حسابات نوع cash فقط.
 * - غير محدد: كل الحسابات.
 * يضع الحساب الافتراضي أولاً ويزيل التكرار.
 */
export function filterAccountsForPayment(
  accounts: BankAccountLike[] | null | undefined,
  method: string | null | undefined,
): BankAccountLike[] {
  if (!accounts || accounts.length === 0) return [];
  const seen = new Set<string>();
  // إظهار جميع الحسابات الموجودة في النظام بغض النظر عن طريقة الدفع
  // (نقدي / تحويل بنكي / بطاقة / شيك ...) — أي حساب جديد يُضاف يظهر تلقائيًا.
  const filtered = accounts.filter((a) => {
    if (!a?.id || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  filtered.sort((a, b) => {
    const da = a.is_default ? 1 : 0;
    const db = b.is_default ? 1 : 0;
    if (da !== db) return db - da;
    return (a.name || "").localeCompare(b.name || "", "ar");
  });
  return filtered;
}

/**
 * Alias مُصدَّر لتوافق واجهات قديمة قد تستدعي `filterAllowedBankAccounts`.
 * يفلتر لطريقة "bank" افتراضيًا (يمكن تمرير method لتخصيصه).
 */
export function filterAllowedBankAccounts(
  accounts: BankAccountLike[] | null | undefined,
  method: string | null | undefined = "bank",
): BankAccountLike[] {
  return filterAccountsForPayment(accounts, method);
}

/**
 * تحقق نهائي قبل حفظ دفعة بطريقة التحويل البنكي.
 * @returns null عند النجاح، وإلا رسالة خطأ بالعربية.
 */
export function validateBankTransferPayment(opts: {
  method: string | null | undefined;
  account: BankAccountLike | null | undefined;
  referenceNo: string | null | undefined;
  /** إذا كانت false، لا يفرض إدخال رقم العملية (يستخدمه CustomerPaymentDialog). */
  requireReferenceNo?: boolean;
}): string | null {
  if (!isBankPaymentMethod(opts.method)) return null;
  if (!opts.account) return "اختر الحساب البنكي المستلِم";
  if (!isAllowedBank(opts.account)) {
    return "البنك المختار غير مسموح به. يجب أن يكون: بنك فيصل أو بنك أم درمان أو بنك الخرطوم";
  }
  const requireRef = opts.requireReferenceNo !== false;
  if (requireRef) {
    const ref = typeof opts.referenceNo === "string" ? opts.referenceNo.trim() : "";
    if (!ref) return "أدخل رقم العملية";
  }
  return null;
}
