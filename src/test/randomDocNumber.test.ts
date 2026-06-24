import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock الـ supabase client — كل استعلام يعيد قائمة فارغة (لا تكرارات في القاعدة)
const limitMock = vi.fn(() => Promise.resolve({ data: [] }));
const eqMock: any = vi.fn(() => ({ limit: limitMock, eq: eqMock, neq: eqMock, or: eqMock }));
const selectMock: any = vi.fn(() => ({ eq: eqMock, limit: limitMock }));
const fromMock: any = vi.fn(() => ({ select: selectMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

import { generateRandomDocNumber } from "@/utils/randomDocNumber";

describe("generateRandomDocNumber", () => {
  beforeEach(() => {
    limitMock.mockClear();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
    limitMock.mockImplementation(() => Promise.resolve({ data: [] }));
  });

  it("returns a value with the given prefix and ≥5 digits by default", async () => {
    const n = await generateRandomDocNumber("invoices", "invoice_number", "INV-");
    expect(n).toMatch(/^INV-\d{5}$/);
  });

  it("respects custom digit length", async () => {
    const n = await generateRandomDocNumber("quotes", "quote_number", "QT-", { digits: 6 });
    expect(n).toMatch(/^QT-\d{6}$/);
  });

  it("produces different numbers across many independent calls (randomness)", async () => {
    const out = new Set<string>();
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      out.add(await generateRandomDocNumber("invoices", "invoice_number", "INV-"));
    }
    // 30 محاولة عشوائية على نطاق 90000 يجب أن تنتج ≥ 28 فريداً
    expect(out.size).toBeGreaterThanOrEqual(28);
  });

  it("produces numbers that are NOT strictly sequential (N+1)", async () => {
    const nums: number[] = [];
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      const s = await generateRandomDocNumber("invoices", "invoice_number", "INV-");
      nums.push(parseInt(s.replace("INV-", ""), 10));
    }
    let sequential = true;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] !== 1) { sequential = false; break; }
    }
    expect(sequential).toBe(false);
  });

  it("expands digit width when all candidates collide", async () => {
    // اجعل القاعدة تدّعي أن كل رقم 5 خانات مأخوذ، 6 خانات متاحة
    limitMock.mockImplementation((..._args: any[]) => {
      // كيف نعرف الطول؟ نقرأ آخر قيمة مرّت لـ eqMock
      const lastEqCall = eqMock.mock.calls[eqMock.mock.calls.length - 1] as any[] | undefined;
      const value = lastEqCall?.[1] || "";
      const m = String(value).match(/-(\d+)$/);
      const len = m ? m[1].length : 0;
      return Promise.resolve({ data: len <= 5 ? [{ x: 1 }] : [] });
    });
    const n = await generateRandomDocNumber("invoices", "invoice_number", "INV-", { digits: 5, maxAttempts: 3 });
    expect(n).toMatch(/^INV-\d{6,}$/);
  });

  it("queries the correct table and column", async () => {
    await generateRandomDocNumber("purchase_orders", "order_number", "PO-");
    expect(fromMock).toHaveBeenCalledWith("purchase_orders");
    expect(selectMock).toHaveBeenCalledWith("order_number");
  });

  it("applies the scope callback (e.g. POS isolation)", async () => {
    const scope = vi.fn((q: any) => q.eq("source", "pos"));
    await generateRandomDocNumber("invoices", "invoice_number", "POS-", { scope });
    expect(scope).toHaveBeenCalled();
  });
});
