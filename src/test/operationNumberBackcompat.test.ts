import { describe, it, expect } from "vitest";
import { extractOperationNo } from "@/components/invoice/InvoiceAuditTab";
import { validateBankTransferPayment } from "@/lib/bankTransferValidation";

/**
 * توافق سجل التدقيق مع البيانات السابقة:
 *  - القيود الجديدة تحمل "رقم العملية: X".
 *  - القيود القديمة قد تحمل "مرجع: X" أو "إشعار: X".
 *  - يجب أن يستخرجها المستخرج نفسها.
 */
describe("extractOperationNo — توافق مع البيانات القديمة", () => {
  it("يستخرج من الصيغة الجديدة", () => {
    expect(extractOperationNo("دفعة فاتورة INV-1 — رقم العملية: TX-9999")).toBe("TX-9999");
  });

  it("يستخرج من الصيغة القديمة (مرجع:)", () => {
    expect(extractOperationNo("تحويل بنك فيصل — مرجع: OLD-123")).toBe("OLD-123");
  });

  it("يستخرج من صيغة إشعار (بيانات قديمة جدًا)", () => {
    expect(extractOperationNo("إيداع — إشعار: 55521")).toBe("55521");
  });

  it("يرجع null عند غياب رقم العملية أو وصف فارغ", () => {
    expect(extractOperationNo(null)).toBeNull();
    expect(extractOperationNo("")).toBeNull();
    expect(extractOperationNo("دفعة نقدية دون مرجع")).toBeNull();
  });
});

describe("validateBankTransferPayment — رسالة الخطأ الموحّدة", () => {
  const faisal = { id: "1", name: "بنك فيصل", bank_name: "بنك فيصل", account_type: "bank" };

  it("رسالة الخطأ لا تحتوي كلمة \"مرجع\" وتذكر \"رقم العملية\" فقط", () => {
    const err = validateBankTransferPayment({ method: "bank_transfer", account: faisal, referenceNo: "" });
    expect(err).toMatch(/رقم العملية/);
    expect(err).not.toMatch(/مرجع/);
  });
});
