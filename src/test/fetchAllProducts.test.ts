import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const TOTAL = 2350;
  const all = Array.from({ length: TOTAL }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  (globalThis as any).__rangeCalls = [];
  const builder = () => ({
    select: () => ({
      order: () => ({
        range: (from: number, to: number) => {
          (globalThis as any).__rangeCalls.push({ from, to });
          return Promise.resolve({ data: all.slice(from, to + 1), error: null });
        },
      }),
    }),
  });
  return { supabase: { from: () => builder() } };
});

const calls = (): Array<{ from: number; to: number }> => (globalThis as any).__rangeCalls;

import { fetchAllProducts } from "@/lib/fetchAllProducts";

describe("fetchAllProducts — يتجاوز حد 1000 صف في Supabase", () => {
  beforeEach(() => { (globalThis as any).__rangeCalls = []; });

  it("يجلب جميع المنتجات (2350) بثلاث دفعات بترتيب صحيح", async () => {
    const rows = await fetchAllProducts<{ id: string; name: string }>("id,name");
    expect(rows).toHaveLength(2350);
    expect(calls()).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
      { from: 2000, to: 2999 },
    ]);
    expect(rows[0]).toEqual({ id: "p0", name: "P0" });
    expect(rows.at(-1)).toEqual({ id: "p2349", name: "P2349" });
  });

  it("يتوقّف عند آخر دفعة ناقصة بدون دفعة إضافية", async () => {
    await fetchAllProducts<{ id: string }>("id,name");
    expect(calls()).toHaveLength(3);
  });
});
