import { describe, it, expect } from "vitest";
import { isProtectedLocalStorageKey, PROTECTED_STORAGE_PREFIXES } from "@/lib/storageManager";

describe("storageManager — protected localStorage keys", () => {
  it("يحمي تخصيصات user + form-factor", () => {
    expect(isProtectedLocalStorageKey("lov:u:abc:ff:desktop:colwidths:customers")).toBe(true);
    expect(isProtectedLocalStorageKey("lov:u:abc:ff:mobile:qrw:invoice-create")).toBe(true);
  });

  it("يحمي مفاتيح التثبيت في حواري الدفعات", () => {
    expect(isProtectedLocalStorageKey("lov:pinned-bank-account")).toBe(true);
    expect(isProtectedLocalStorageKey("lov:pinned-payment-method")).toBe(true);
    expect(isProtectedLocalStorageKey("lov:last-bank-account")).toBe(true);
    expect(isProtectedLocalStorageKey("lov:last-account:bank")).toBe(true);
  });

  it("يحمي مظهر المستخدم وأعمدة جدول البنود والأدوات", () => {
    expect(isProtectedLocalStorageKey("albatoul_appearance")).toBe(true);
    expect(isProtectedLocalStorageKey("shared:itemsTable:colWidths:v1")).toBe(true);
    expect(isProtectedLocalStorageKey("shared:itemsTable:colsLocked:v1")).toBe(true);
    expect(isProtectedLocalStorageKey("itemsZoom")).toBe(true);
    expect(isProtectedLocalStorageKey("neobilling:toolbar-order:v2:x")).toBe(true);
    expect(isProtectedLocalStorageKey("dlg_size_v2__u1__ff_desktop__anyKey")).toBe(true);
    expect(isProtectedLocalStorageKey("__lov_print_visibility__:invoice")).toBe(true);
  });

  it("لا يحمي المفاتيح الشرودة/العابرة", () => {
    expect(isProtectedLocalStorageKey("lov:critical-error")).toBe(false);
    expect(isProtectedLocalStorageKey("cloudUsageStatsV1")).toBe(false);
    expect(isProtectedLocalStorageKey("albatool:rq-cache:v1")).toBe(false);
    expect(isProtectedLocalStorageKey("random-key")).toBe(false);
    expect(isProtectedLocalStorageKey("")).toBe(false);
  });

  it("جميع البادئات موثّقة صراحة", () => {
    expect(PROTECTED_STORAGE_PREFIXES.length).toBeGreaterThanOrEqual(11);
  });
});
