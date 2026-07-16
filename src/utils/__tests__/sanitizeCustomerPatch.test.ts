/**
 * Unit test: sanitizeCustomerPatch يجب أن يُسقط بصمت أي محاولة
 * لتحديث balance / credit_balance / net_balance حتى لو مررت من الواجهة،
 * لأن هذه الأعمدة تُحسب حصراً في DB عبر recompute_customer_balance.
 *
 * هذه هي نفس الدالة المستخدمة داخل CustomersPage.updateRowField.
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeCustomerPatch,
  CUSTOMER_UPDATABLE_COLUMNS,
} from "@/utils/sanitizeCustomerPatch";

describe("sanitizeCustomerPatch (CustomersPage guard)", () => {
  it("يرفض balance / credit_balance / net_balance", () => {
    const patch = {
      name: "عميل",
      balance: 999,
      credit_balance: 500,
      net_balance: -100,
    };
    const clean = sanitizeCustomerPatch(patch);
    expect(clean).toEqual({ name: "عميل" });
    expect("balance" in clean).toBe(false);
    expect("credit_balance" in clean).toBe(false);
    expect("net_balance" in clean).toBe(false);
  });

  it("يسمح فقط بالأعمدة المدرجة في القائمة البيضاء", () => {
    const patch: Record<string, any> = {
      name: "n", phone: "p", email: "e", address: "a", notes: "x",
      opening_balance: 10, credit_limit: 500, is_active: true,
      // حقول مرفوضة:
      balance: 1, credit_balance: 2, net_balance: 3,
      id: "should-not-pass", created_at: "should-not-pass",
      hacker_field: true,
    };
    const clean = sanitizeCustomerPatch(patch);
    for (const k of Object.keys(clean)) {
      expect(CUSTOMER_UPDATABLE_COLUMNS.has(k)).toBe(true);
    }
    expect(clean.id).toBeUndefined();
    expect(clean.balance).toBeUndefined();
    expect(clean.credit_balance).toBeUndefined();
    expect(clean.net_balance).toBeUndefined();
    expect(clean.hacker_field).toBeUndefined();
  });

  it("يتعامل مع patch فارغ أو null بدون أخطاء", () => {
    expect(sanitizeCustomerPatch({} as any)).toEqual({});
    expect(sanitizeCustomerPatch(null as any)).toEqual({});
    expect(sanitizeCustomerPatch(undefined as any)).toEqual({});
  });

  it("لا يستطيع أي مفتاح خطر تجاوز الحارس حتى مع قيم صادقة", () => {
    const attempts = [
      { balance: 0 },
      { credit_balance: 0 },
      { net_balance: 0 },
      { balance: null },
      { credit_balance: undefined },
    ];
    for (const p of attempts) {
      const clean = sanitizeCustomerPatch(p as any);
      expect(Object.keys(clean).length).toBe(0);
    }
  });
});
