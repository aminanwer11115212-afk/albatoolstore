import { describe, it, expect } from "vitest";
import { formatStock } from "@/utils/formatStock";

describe("formatStock", () => {
  it("positive → text-foreground", () => {
    const r = formatStock(12);
    expect(r.text).toBe("12");
    expect(r.className).toBe("text-foreground");
    expect(r.isNegative).toBe(false);
  });
  it("zero → muted", () => {
    const r = formatStock(0);
    expect(r.isZero).toBe(true);
    expect(r.className).toBe("text-muted-foreground");
  });
  it("negative → destructive with minus sign", () => {
    const r = formatStock(-5);
    expect(r.text).toBe("-5");
    expect(r.isNegative).toBe(true);
    expect(r.className).toBe("text-destructive");
  });
  it("null → 0", () => {
    const r = formatStock(null);
    expect(r.text).toBe("0");
    expect(r.isZero).toBe(true);
  });
});
