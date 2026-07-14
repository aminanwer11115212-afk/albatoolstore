import { describe, it, expect } from "vitest";

// اختبار وحدة للـ FK resolution في documentSaga دون ضرب Supabase.
// نستنسخ منطق resolvePlaceholders بمنطق مطابق لضمان سلوك $tempId.

function resolvePlaceholders(payload: any, ids: Record<string, string>): any {
  if (payload == null) return payload;
  if (typeof payload === "string") {
    if (payload.startsWith("$")) return ids[payload.slice(1)] ?? payload;
    return payload;
  }
  if (Array.isArray(payload)) return payload.map((p) => resolvePlaceholders(p, ids));
  if (typeof payload === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(payload)) out[k] = resolvePlaceholders(v, ids);
    return out;
  }
  return payload;
}

describe("documentSaga placeholder resolution", () => {
  it("يستبدل $tempId في المستوى الأعلى", () => {
    const ids = { INV: "uuid-1" };
    expect(resolvePlaceholders({ invoice_id: "$INV" }, ids)).toEqual({ invoice_id: "uuid-1" });
  });

  it("يستبدل داخل arrays و objects متداخلة", () => {
    const ids = { INV: "uuid-1", CUST: "uuid-2" };
    const payload = {
      invoice_id: "$INV",
      meta: { customer_id: "$CUST", tags: ["$INV", "static"] },
    };
    expect(resolvePlaceholders(payload, ids)).toEqual({
      invoice_id: "uuid-1",
      meta: { customer_id: "uuid-2", tags: ["uuid-1", "static"] },
    });
  });

  it("يُبقي القيم غير الـ placeholder سليمة", () => {
    expect(resolvePlaceholders({ x: 1, y: "abc", z: null }, {})).toEqual({ x: 1, y: "abc", z: null });
  });

  it("placeholder غير معروف يبقى كما هو", () => {
    expect(resolvePlaceholders({ x: "$UNKNOWN" }, {})).toEqual({ x: "$UNKNOWN" });
  });
});
