/**
 * E2E: FIFO/LIFO credit consumption — the older or newer customer_credit lot
 * is consumed first depending on `company_settings.credit_consumption_order`.
 *
 * Verifies the pure logic path via `allocateCreditConsumption` end-to-end
 * (import from the running app), so the guarantee holds inside the browser.
 */
import { test, expect } from "@playwright/test";

test("FIFO consumes oldest lots first, LIFO consumes newest", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const mod = await import("/src/hooks/useCreditConsumptionOrder.ts");
    const lots = [
      { id: "old", amount: 300, date: "2026-01-01" },
      { id: "mid", amount: 500, date: "2026-02-15" },
      { id: "new", amount: 200, date: "2026-03-10" },
    ];
    return {
      fifo: mod.allocateCreditConsumption(lots, 400, "fifo"),
      lifo: mod.allocateCreditConsumption(lots, 400, "lifo"),
      partial: mod.allocateCreditConsumption(lots, 100, "fifo"),
    };
  });

  expect(result.fifo).toEqual([
    { id: "old", consume: 300 },
    { id: "mid", consume: 100 },
  ]);
  expect(result.lifo).toEqual([
    { id: "new", consume: 200 },
    { id: "mid", consume: 200 },
  ]);
  expect(result.partial).toEqual([{ id: "old", consume: 100 }]);
});
