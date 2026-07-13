import { describe, it, expect } from "vitest";
import { normalizePhoneInput } from "@/utils/phoneNormalize";

describe("normalizePhoneInput", () => {
  it("empty / null / undefined → empty string", () => {
    expect(normalizePhoneInput("")).toBe("");
    expect(normalizePhoneInput(null)).toBe("");
    expect(normalizePhoneInput(undefined)).toBe("");
  });

  it("strips spaces, dashes, parentheses, dots", () => {
    expect(normalizePhoneInput("091 234 5678")).toBe("0912345678");
    expect(normalizePhoneInput("091-234-5678")).toBe("0912345678");
    expect(normalizePhoneInput("(091) 234.5678")).toBe("0912345678");
    expect(normalizePhoneInput("  0 9 1  2 3 4 5 6 7 8  ")).toBe("0912345678");
  });

  it("converts Arabic-Indic digits to Latin", () => {
    expect(normalizePhoneInput("٠٩١٢٣٤٥٦٧٨")).toBe("0912345678");
    expect(normalizePhoneInput("۰۹۱۲۳۴۵۶۷۸")).toBe("0912345678");
    expect(normalizePhoneInput("٠٩١ ٢٣٤ ٥٦٧٨")).toBe("0912345678");
  });

  it("keeps leading + only", () => {
    expect(normalizePhoneInput("+249 91 234 5678")).toBe("+249912345678");
    expect(normalizePhoneInput("+٢٤٩ ٩١ ٢٣٤ ٥٦٧٨")).toBe("+249912345678");
    // + in the middle must be dropped
    expect(normalizePhoneInput("249+912345678")).toBe("249912345678");
    // multiple + only first survives
    expect(normalizePhoneInput("++249912345678")).toBe("+249912345678");
  });

  it("removes letters and unicode punctuation", () => {
    expect(normalizePhoneInput("Tel: 0912345678 ext.")).toBe("0912345678");
    expect(normalizePhoneInput("٠٩١-٢٣٤-٥٦٧٨ *")).toBe("0912345678");
    expect(normalizePhoneInput("‎+249\u200e912345678")).toBe("+249912345678");
  });

  it("idempotent — running twice yields same result", () => {
    const once = normalizePhoneInput("+249 (91) 234-5678");
    expect(normalizePhoneInput(once)).toBe(once);
  });
});
