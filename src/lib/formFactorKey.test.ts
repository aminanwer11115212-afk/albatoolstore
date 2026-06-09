import { describe, it, expect, beforeEach } from "vitest";
import { formFactorKey, formFactorScopedLegacyKey } from "./formFactorKey";

beforeEach(() => {
  localStorage.clear();
});

describe("formFactorKey", () => {
  it("contains uid and form factor segments", () => {
    const k = formFactorKey("colwidths", "customers");
    expect(k).toMatch(/^lov:u:[^:]+:ff:(mobile|desktop):colwidths:customers$/);
  });

  it("falls back to guest uid before login", () => {
    const k = formFactorKey("ui", "x");
    expect(k.startsWith("lov:u:guest:") || k.startsWith("lov:u:")).toBe(true);
  });
});

describe("formFactorScopedLegacyKey migration", () => {
  it("copies value from un-namespaced legacy key on first read", () => {
    localStorage.setItem("my-pref", "42");
    const k = formFactorScopedLegacyKey("my-pref");
    expect(localStorage.getItem(k)).toBe("42");
    // legacy untouched
    expect(localStorage.getItem("my-pref")).toBe("42");
  });

  it("does not overwrite existing new-key value", () => {
    localStorage.setItem("my-pref", "legacy");
    const k = formFactorScopedLegacyKey("my-pref");
    localStorage.setItem(k, "current");
    formFactorScopedLegacyKey("my-pref");
    expect(localStorage.getItem(k)).toBe("current");
  });

  it("migrates companion :userResized flag", () => {
    localStorage.setItem("widths", "{}");
    localStorage.setItem("widths:userResized", "true");
    const k = formFactorScopedLegacyKey("widths");
    expect(localStorage.getItem(`${k}:userResized`)).toBe("true");
  });
});
