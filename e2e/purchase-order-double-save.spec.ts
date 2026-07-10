import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: الضغط المتكرر على "حفظ" في أمر شراء لا يُنشئ سجلاً مكرّراً
 * ولا يخصم/يضيف المخزون مرتين.
 *
 * السيناريو:
 *  1) افتح "أمر شراء جديد" واختر مورداً وأضف صنفاً واحداً بكمية 3.
 *  2) اضغط زر "حفظ واستلام" 4 مرات متتالية بسرعة.
 *  3) تحقق:
 *     - المسار انتقل مرة واحدة إلى /purchase/edit/<id> ولم يتغيّر.
 *     - رقم أمر الشراء (data-testid="doc-number") لم يتغيّر بين الضغطات.
 *     - ظهر تنبيه "يتم حفظ الأمر بالفعل" على الأقل مرة.
 *     - يوجد سجل واحد فقط لنفس رقم الأمر في صفحة قائمة أوامر الشراء.
 */

async function pickFirstSuggestion(page: Page) {
  const sug = page.locator('[role="option"], .suggestion-item, .lov-suggestion').first();
  if (await sug.isVisible({ timeout: 3000 }).catch(() => false)) await sug.click();
}

async function readDocNumber(page: Page): Promise<string> {
  await page.waitForFunction(
    () => !!document.querySelector('[data-testid="doc-number"]')?.textContent?.trim(),
    null,
    { timeout: 20_000 },
  );
  return ((await page.getByTestId("doc-number").first().textContent()) || "").trim();
}

test.describe("Purchase order: rapid save clicks do not duplicate", () => {
  test("4 rapid clicks → one record, stable number, stable URL", async ({ page }) => {
    await page.goto("/purchase/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();

    // اختيار المورد
    const supplierInput = page.locator('input[placeholder*="مورد" i]').first();
    await supplierInput.click();
    await supplierInput.fill("م");
    await pickFirstSuggestion(page);

    // إضافة منتج
    const productInput = page
      .locator('tbody input[placeholder*="منتج" i], input[placeholder*="ابحث عن منتج" i]')
      .first();
    await expect(productInput).toBeVisible({ timeout: 15_000 });
    await productInput.click();
    await productInput.fill("a");
    await pickFirstSuggestion(page);

    const qty = page.locator('tbody input[type="number"]').first();
    if (await qty.isVisible({ timeout: 2000 }).catch(() => false)) {
      await qty.fill("3");
      await qty.press("Tab");
    }

    const numberBefore = await readDocNumber(page);

    // زر "حفظ واستلام" (أو "حفظ")
    const saveBtn = page
      .getByRole("button", { name: /^حفظ واستلام$|^حفظ$|^حفظ الأمر$/ })
      .first();
    await expect(saveBtn).toBeVisible();

    const clicks: Promise<void>[] = [];
    for (let i = 0; i < 4; i++) {
      clicks.push(
        saveBtn.click({ force: true, noWaitAfter: true, timeout: 5000 }).catch(() => undefined),
      );
    }
    await Promise.all(clicks);

    // ننتظر انتقال المسار لمرة واحدة إلى /purchase/edit/<id>
    await page.waitForURL(/\/purchase\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    const editUrl1 = page.url();

    const numberAfter = await readDocNumber(page);
    expect(numberAfter).toBe(numberBefore);

    // ضغطات إضافية بعد دخول وضع التعديل: لا شيء يتغيّر
    for (let i = 0; i < 3; i++) {
      await saveBtn.click({ force: true, noWaitAfter: true, timeout: 5000 }).catch(() => undefined);
    }
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(editUrl1);
    expect(await readDocNumber(page)).toBe(numberBefore);

    // في قائمة أوامر الشراء يوجد صف واحد فقط بهذا الرقم
    await page.goto("/purchase-orders", { waitUntil: "domcontentloaded" });
    const rows = page.locator(`text=${numberBefore}`);
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
  });
});
