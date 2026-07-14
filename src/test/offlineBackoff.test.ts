import { describe, it, expect } from "vitest";
import { backoffDelay, isPermanentError, MAX_ATTEMPTS } from "@/lib/offlineQueue";

describe("offlineQueue backoff", () => {
  it("منحنى backoff تصاعدي: 2s → 5s → 15s → 60s → 5m", () => {
    expect(backoffDelay(0)).toBe(2_000);
    expect(backoffDelay(1)).toBe(5_000);
    expect(backoffDelay(2)).toBe(15_000);
    expect(backoffDelay(3)).toBe(60_000);
    expect(backoffDelay(4)).toBe(300_000);
  });

  it("ما بعد MAX_ATTEMPTS يستقر عند آخر قيمة (5m)", () => {
    expect(backoffDelay(10)).toBe(300_000);
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("attempt سالب يُعامَل كصفر", () => {
    expect(backoffDelay(-1)).toBe(2_000);
  });
});

describe("isPermanentError", () => {
  it("PGRST/Postgres codes الشائعة → دائم", () => {
    expect(isPermanentError({ code: "23505" })).toBe(true); // unique violation
    expect(isPermanentError({ code: "23503" })).toBe(true); // fk violation
    expect(isPermanentError({ code: "42501" })).toBe(true); // RLS
  });

  it("network errors → غير دائم", () => {
    expect(isPermanentError({ message: "network timeout" })).toBe(false);
    expect(isPermanentError({ code: "ECONNREFUSED" })).toBe(false);
    expect(isPermanentError(new Error("fetch failed"))).toBe(false);
  });

  it("رسائل تحقّق معروفة → دائم", () => {
    expect(isPermanentError({ message: "duplicate key value" })).toBe(true);
    expect(isPermanentError({ message: "row-level security policy" })).toBe(true);
    expect(isPermanentError({ message: "violates check constraint" })).toBe(true);
  });

  it("null/undefined → غير دائم", () => {
    expect(isPermanentError(null)).toBe(false);
    expect(isPermanentError(undefined)).toBe(false);
  });
});
