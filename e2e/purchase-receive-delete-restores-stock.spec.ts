import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: إنشاء أمر شراء مع "استلام" → المخزون يزيد، ثم حذف الأمر →
 * المخزون يرجع لقيمته الأصلية والصفحات المرتبطة تعكس التغيير فوراً.
 *
 * السيناريو:
 *  1) اقرأ مخزون منتج قائم من /products.
 *  2) أنشئ أمر شراء لنفس المنتج بكمية N مع "حفظ واستلام".
 *  3) تحقق أن مخزون المنتج أصبح stock0 + N.
 *  4) احذف أمر الشراء من قائمة أوامر الشراء.
 *  5) تحقق أن المخزون رجع إلى stock0 (خصم مرة واحدة فقط).
 */

const QTY = 5;

async function pickFirstSuggestion(page: Page) {
  const sug = page.locator('[role="option"], .suggestion-item, .lov-suggestion').first();
  if (await sug.isVisible({ timeout: 3000 }).catch(() => false)) await sug.click();
}

async function readStockOfFirstProduct(page: Page): Promise<{ name: string; stock: number }> {
  await page.goto("/products", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("tbody tr", { timeout: 20_000 });
  const row = page.locator("tbody tr").first();
  const name = ((await row.locator("td").nth(1).textContent()) || "").trim();
  const stockText = await row.locator('[data-testid="product-stock"], td').nth(4).textContent();
  const stock = Number((stockText || "0").replace(/[^0-9.\-]/g, "")) || 0;
  return { name, stock };
}

test.describe("Purchase order: receive updates stock, delete restores it", () => {
  test("receive+delete PO leaves stock unchanged (single apply, single restore)", async ({ page }) => {
    const before = await readStockOfFirstProduct(page);

    // إنشاء أمر شراء
    await page.goto("/purchase/new", { waitUntil: "domcontentloaded" });
    const supplierInput = page.locator('input[placeholder*="مورد" i]').first();
    await supplierInput.click();
    await supplierInput.fill("م");
    await pickFirstSuggestion(page);

    const productInput = page
      .locator('tbody input[placeholder*="منتج" i], input[placeholder*="ابحث عن منتج" i]')
      .first();
    await productInput.click();
    await productInput.fill(before.name.slice(0, 3));
    await pickFirstSuggestion(page);

    const qty = page.locator('tbody input[type="number"]').first();
    await qty.fill(String(QTY));
    await qty.press("Tab");

    const receiveBtn = page.getByRole("button", { name: /حفظ واستلام|استلام/ }).first();
    await receiveBtn.click();
    await page.waitForURL(/\/purchase\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    const poNumber = ((await page.getByTestId("doc-number").first().textContent()) || "").trim();

    // المخزون بعد الاستلام
    const afterReceive = await readStockOfFirstProduct(page);
    expect(afterReceive.stock).toBeCloseTo(before.stock + QTY, 3);

    // حذف الأمر من القائمة
    await page.goto("/purchase-orders", { waitUntil: "domcontentloaded" });
    const row = page.locator(`tr:has-text("${poNumber}")`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /حذف|🗑/ }).first().click();
    await page.getByRole("button", { name: /^حذف|حذف الأمر$/ }).last().click();

    // ننتظر اختفاء الصف
    await expect(page.locator(`text=${poNumber}`)).toHaveCount(0, { timeout: 20_000 });

    // المخزون رجع للأصل
    const afterDelete = await readStockOfFirstProduct(page);
    expect(afterDelete.stock).toBeCloseTo(before.stock, 3);
  });
});
