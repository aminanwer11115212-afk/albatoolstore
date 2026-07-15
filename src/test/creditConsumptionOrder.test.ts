import { describe, it, expect } from "vitest";
import { allocateCreditConsumption } from "@/hooks/useCreditConsumptionOrder";

const LOTS = [
  { id: "a", amount: 300, date: "2026-01-01" },
  { id: "b", amount: 500, date: "2026-02-15" },
  { id: "c", amount: 200, date: "2026-03-10" },
];

describe("allocateCreditConsumption", () => {
  it("FIFO consumes oldest lot first", () => {
    const out = allocateCreditConsumption(LOTS, 400, "fifo");
    expect(out).toEqual([
      { id: "a", consume: 300 },
      { id: "b", consume: 100 },
    ]);
  });

  it("LIFO consumes newest lot first", () => {
    const out = allocateCreditConsumption(LOTS, 400, "lifo");
    expect(out).toEqual([
      { id: "c", consume: 200 },
      { id: "b", consume: 200 },
    ]);
  });

  it("stops when target amount is fulfilled", () => {
    const out = allocateCreditConsumption(LOTS, 150, "fifo");
    expect(out).toEqual([{ id: "a", consume: 150 }]);
  });

  it("returns empty for zero amount", () => {
    expect(allocateCreditConsumption(LOTS, 0, "fifo")).toEqual([]);
  });

  it("skips exhausted lots", () => {
    const out = allocateCreditConsumption(
      [{ id: "x", amount: 0, date: "2026-01-01" }, { id: "y", amount: 100, date: "2026-01-02" }],
      50,
      "fifo",
    );
    expect(out).toEqual([{ id: "y", consume: 50 }]);
  });
});
