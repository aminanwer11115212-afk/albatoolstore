import { describe, it, expect } from "vitest";
import {
  ALLOWED_BANK_KEYWORDS,
  isAllowedBank,
  isBankPaymentMethod,
  validateBankTransferPayment,
  type BankAccountLike,
} from "@/lib/bankTransferValidation";

// عينة تحاكي البيانات الحقيقية في جدول accounts بعد إضافة بنك أم درمان
const ACCOUNTS: BankAccountLike[] = [
  { id: "1", name: "بنك فيصل", bank_name: "بنك فيصل", account_type: "bank" },
  { id: "2", name: "حساب بنك الخرطوم", bank_name: "بنك الخرطوم", account_type: "bank" },
  { id: "3", name: "بنك الخرطوم حساب شاهين", bank_name: "بنك الخرطوم", account_type: "bank" },
  { id: "4", name: "بنك أم درمان", bank_name: "بنك أم درمان", account_type: "bank" },
  // الخزنة: نوع bank لكنه ليس بنكاً معتمداً (لا اسم بنك يطابق)
  { id: "5", name: "الخزنة", bank_name: null, account_type: "bank" },
  // حساب نقدي يجب استبعاده دائماً
  { id: "6", name: "كاش", bank_name: null, account_type: "cash" },
  // بنك أجنبي غير معتمد
  { id: "7", name: "بنك مصر", bank_name: "بنك مصر", account_type: "bank" },
];

describe("isBankPaymentMethod", () => {
  it("يتعرف على bank و bank_transfer كطرق تحويل بنكي", () => {
    expect(isBankPaymentMethod("bank")).toBe(true);
    expect(isBankPaymentMethod("bank_transfer")).toBe(true);
  });

  it("يرفض الطرق الأخرى", () => {
    expect(isBankPaymentMethod("cash")).toBe(false);
    expect(isBankPaymentMethod("card")).toBe(false);
    expect(isBankPaymentMethod("mobile")).toBe(false);
    expect(isBankPaymentMethod("")).toBe(false);
    expect(isBankPaymentMethod(null)).toBe(false);
    expect(isBankPaymentMethod(undefined)).toBe(false);
  });
});

describe("isAllowedBank", () => {
  it("يقبل البنوك الثلاثة المعتمدة (فيصل، الخرطوم، أم درمان)", () => {
    expect(isAllowedBank(ACCOUNTS[0])).toBe(true); // فيصل
    expect(isAllowedBank(ACCOUNTS[1])).toBe(true); // الخرطوم
    expect(isAllowedBank(ACCOUNTS[2])).toBe(true); // الخرطوم - شاهين
    expect(isAllowedBank(ACCOUNTS[3])).toBe(true); // أم درمان
  });

  it("يرفض الخزنة (لا اسم بنك)", () => {
    expect(isAllowedBank(ACCOUNTS[4])).toBe(false);
  });

  it("يرفض الحسابات النقدية حتى لو حملت اسم بنك معتمد", () => {
    expect(isAllowedBank({ name: "بنك فيصل", bank_name: "بنك فيصل", account_type: "cash" })).toBe(false);
  });

  it("يرفض البنوك غير المعتمدة (مثل بنك مصر)", () => {
    expect(isAllowedBank(ACCOUNTS[6])).toBe(false);
  });

  it("يرفض القيم null/undefined", () => {
    expect(isAllowedBank(null)).toBe(false);
    expect(isAllowedBank(undefined)).toBe(false);
  });

  it("يكتشف الكلمات المفتاحية حتى لو في حقل name فقط", () => {
    expect(isAllowedBank({ name: "حساب فيصل العام", bank_name: null, account_type: "bank" })).toBe(true);
    expect(isAllowedBank({ name: "فرع أم درمان", bank_name: null, account_type: "bank" })).toBe(true);
  });

  it("يحوي بنك أم درمان ضمن الكلمات المفتاحية المعتمدة", () => {
    expect(ALLOWED_BANK_KEYWORDS).toContain("أم درمان");
    expect(ALLOWED_BANK_KEYWORDS).toContain("فيصل");
    expect(ALLOWED_BANK_KEYWORDS).toContain("الخرطوم");
  });
});

describe("فلترة قائمة الحسابات المعتمدة للتحويل البنكي", () => {
  // محاكاة الـ filter المُستخدم في الواجهات الأربع
  const allowedBanks = ACCOUNTS.filter((a) => a.account_type === "bank" && isAllowedBank(a));

  it("يُرجع فقط البنوك الثلاثة المعتمدة (4 حسابات في عينتنا)", () => {
    expect(allowedBanks).toHaveLength(4);
    expect(allowedBanks.map((a) => a.id).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("يستبعد الخزنة من قائمة بنوك التحويل", () => {
    expect(allowedBanks.find((a) => a.name === "الخزنة")).toBeUndefined();
  });

  it("يستبعد الحسابات النقدية", () => {
    expect(allowedBanks.find((a) => a.account_type === "cash")).toBeUndefined();
  });

  it("يستبعد البنوك غير المعتمدة", () => {
    expect(allowedBanks.find((a) => a.bank_name === "بنك مصر")).toBeUndefined();
  });

  it("يحتوي على بنك أم درمان (الذي أُضيف حديثاً)", () => {
    const omdurman = allowedBanks.find((a) => a.bank_name === "بنك أم درمان");
    expect(omdurman).toBeDefined();
    expect(omdurman?.id).toBe("4");
  });

  it("قائمة أسماء البنوك الفريدة المعروضة في TransactionsPage تساوي الثلاثة", () => {
    const uniqueBankNames = Array.from(
      new Set(allowedBanks.map((a) => a.bank_name).filter(Boolean)),
    );
    expect(uniqueBankNames.sort()).toEqual(["بنك أم درمان", "بنك الخرطوم", "بنك فيصل"].sort());
  });
});

describe("validateBankTransferPayment", () => {
  const faisal = ACCOUNTS[0];
  const omdurman = ACCOUNTS[3];
  const treasury = ACCOUNTS[4];

  it("يتجاهل التحقق إذا لم تكن الطريقة تحويل بنكي", () => {
    expect(validateBankTransferPayment({ method: "cash", account: null, referenceNo: "" })).toBeNull();
    expect(validateBankTransferPayment({ method: "card", account: null, referenceNo: "" })).toBeNull();
  });

  it("يرفض إذا لم يُختر حساب", () => {
    const err = validateBankTransferPayment({ method: "bank_transfer", account: null, referenceNo: "123" });
    expect(err).toMatch(/اختر الحساب البنكي/);
  });

  it("يرفض إذا اخْتير حساب غير معتمد (الخزنة)", () => {
    const err = validateBankTransferPayment({ method: "bank_transfer", account: treasury, referenceNo: "123" });
    expect(err).toMatch(/غير مسموح/);
    expect(err).toMatch(/فيصل/);
    expect(err).toMatch(/أم درمان/);
    expect(err).toMatch(/الخرطوم/);
  });

  it("يرفض إذا اخْتير بنك أجنبي غير معتمد", () => {
    const foreignBank = ACCOUNTS[6];
    const err = validateBankTransferPayment({ method: "bank", account: foreignBank, referenceNo: "123" });
    expect(err).toMatch(/غير مسموح/);
  });

  it("يرفض إذا لم يُدخل رقم العملية", () => {
    expect(validateBankTransferPayment({ method: "bank_transfer", account: faisal, referenceNo: "" }))
      .toMatch(/أدخل رقم العملية/);
    expect(validateBankTransferPayment({ method: "bank_transfer", account: faisal, referenceNo: "   " }))
      .toMatch(/أدخل رقم العملية/);
    expect(validateBankTransferPayment({ method: "bank_transfer", account: faisal, referenceNo: null }))
      .toMatch(/أدخل رقم العملية/);
  });

  it("يقبل بنك فيصل + رقم عملية صحيح", () => {
    expect(validateBankTransferPayment({ method: "bank_transfer", account: faisal, referenceNo: "TX-12345" })).toBeNull();
  });

  it("يقبل بنك أم درمان + رقم عملية صحيح (السيناريو الجديد)", () => {
    expect(validateBankTransferPayment({ method: "bank_transfer", account: omdurman, referenceNo: "OM-99" })).toBeNull();
  });

  it("يقبل بنك الخرطوم + رقم عملية صحيح", () => {
    expect(validateBankTransferPayment({ method: "bank", account: ACCOUNTS[1], referenceNo: "KH-1" })).toBeNull();
    expect(validateBankTransferPayment({ method: "bank", account: ACCOUNTS[2], referenceNo: "KH-2" })).toBeNull();
  });
});
