import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractErrorMessage,
  formatErrorDetails,
  reportCriticalError,
  subscribeCriticalError,
  runCritical,
} from "@/utils/errorReporter";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("errorReporter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("extractErrorMessage handles supabase, Error, string, and fallback", () => {
    expect(extractErrorMessage(new Error("boom"))).toBe("boom");
    expect(extractErrorMessage({ hint: "check FK" })).toBe("check FK");
    expect(extractErrorMessage({ details: "row missing" })).toBe("row missing");
    expect(extractErrorMessage("plain")).toBe("plain");
    expect(extractErrorMessage(null, "بديل")).toBe("بديل");
  });

  it("formatErrorDetails includes context and code", () => {
    const out = formatErrorDetails({ code: "23514", hint: "H" }, "ctx");
    expect(out).toContain("السياق: ctx");
    expect(out).toContain("code: 23514");
    expect(out).toContain("hint: H");
  });

  it("reportCriticalError dispatches window event with payload", () => {
    const cb = vi.fn();
    const off = subscribeCriticalError(cb);
    reportCriticalError({ title: "فشل", error: new Error("x"), context: "T" });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toMatchObject({ title: "فشل", message: "x", context: "T" });
    off();
  });

  it("runCritical returns value on success, undefined + reports on failure", async () => {
    const cb = vi.fn();
    const off = subscribeCriticalError(cb);
    await expect(runCritical("ok", async () => 42)).resolves.toBe(42);
    expect(cb).not.toHaveBeenCalled();
    const r = await runCritical("bad", async () => { throw new Error("nope"); });
    expect(r).toBeUndefined();
    expect(cb).toHaveBeenCalledOnce();
    off();
  });
});
