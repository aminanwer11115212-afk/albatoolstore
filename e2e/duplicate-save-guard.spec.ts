import { test, expect, type Page } from "@playwright/test";

/**
 * E2E موحّد: الضغط المتكرر على "حفظ" في:
 *  - فاتورة عادية
 *  - عرض سعر
 *  - أمر شراء
 * لا يُنشئ سجلات مكرَّرة، ورقم المستند يبقى ثابتاً.
 *
 * الحماية المتوقّعة (ثلاث طبقات):
 *  1) isSavingRef داخل الجلسة.
 *  2) lastSavedIdRef بعد أول حفظ ناجح.
 *  3) duplicateDocGuard على DB (نفس الطرف + التاريخ + توقيع البنود).
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

async function rapidClick(page: Page, name: RegExp, times = 5) {
  const btn = page.getByRole("button", { name }).first();
  await expect(btn).toBeVisible();
  const clicks: Promise<void>[] = [];
  for (let i = 0; i < times; i++) {
    clicks.push(btn.click({ force: true, noWaitAfter: true, timeout: 5000 }).catch(() => undefined));
  }
  await Promise.all(clicks);
}

async function fillOneProductRow(page: Page, qty = "1") {
  const productInput = page
    .locator('tbody input[placeholder*="منتج" i], input[placeholder*="ابحث عن منتج" i]')
    .first();
  await expect(productInput).toBeVisible({ timeout: 15_000 });
  await productInput.click();
  await productInput.fill("a");
  await pickFirstSuggestion(page);
  const qtyInput = page.locator('tbody input[type="number"]').first();
  if (await qtyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await qtyInput.fill(qty);
    await qtyInput.press("Tab");
  }
}

test.describe("Duplicate save guard — invoices, quotes, purchase orders", () => {
  test("Invoice: 5 rapid saves → single record, stable number", async ({ page }) => {
    await page.goto("/invoices/new", { waitUntil: "domcontentloaded" });
    const customerInput = page.locator('.customer-name-input, input[placeholder*="عميل" i]').first();
    await customerInput.click();
    await customerInput.fill("ا");
    await pickFirstSuggestion(page);
    await fillOneProductRow(page);

    const numberBefore = await readDocNumber(page);
    await rapidClick(page, /^حفظ$|^حفظ الفاتورة$/, 5);
    await page.waitForURL(/\/invoices\/(?:edit|cash\/edit)\/[0-9a-f-]+/i, { timeout: 30_000 });
    const url1 = page.url();
    expect(await readDocNumber(page)).toBe(numberBefore);

    await rapidClick(page, /^حفظ|^تحديث/, 3);
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url1);
    expect(await readDocNumber(page)).toBe(numberBefore);

    // في القائمة: صف واحد فقط بهذا الرقم
    await page.goto("/invoices", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${numberBefore}`)).toHaveCount(1, { timeout: 15_000 });
  });

  test("Quote: 5 rapid saves → single record, stable number", async ({ page }) => {
    await page.goto("/quotes/create", { waitUntil: "domcontentloaded" });
    const customerInput = page.locator('.customer-name-input, input[placeholder*="عميل" i]').first();
    await customerInput.click();
    await customerInput.fill("ا");
    await pickFirstSuggestion(page);
    await fillOneProductRow(page);

    const numberBefore = await readDocNumber(page);
    await rapidClick(page, /^حفظ$|^حفظ العرض$/, 5);
    await page.waitForURL(/\/quotes\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    const url1 = page.url();
    expect(await readDocNumber(page)).toBe(numberBefore);

    await rapidClick(page, /^حفظ|^تحديث/, 3);
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url1);
    expect(await readDocNumber(page)).toBe(numberBefore);

    await page.goto("/quotes", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${numberBefore}`)).toHaveCount(1, { timeout: 15_000 });
  });

  test("Purchase order: 5 rapid saves → single record, stable number", async ({ page }) => {
    await page.goto("/purchase/new", { waitUntil: "domcontentloaded" });
    const supplierInput = page.locator('input[placeholder*="مورد" i]').first();
    await supplierInput.click();
    await supplierInput.fill("م");
    await pickFirstSuggestion(page);
    await fillOneProductRow(page, "3");

    const numberBefore = await readDocNumber(page);
    await rapidClick(page, /^حفظ$|^حفظ الأمر$|^حفظ واستلام$/, 5);
    await page.waitForURL(/\/purchase\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    const url1 = page.url();
    expect(await readDocNumber(page)).toBe(numberBefore);

    await rapidClick(page, /^حفظ|^تحديث/, 3);
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url1);
    expect(await readDocNumber(page)).toBe(numberBefore);

    await page.goto("/purchase-orders", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`text=${numberBefore}`)).toHaveCount(1, { timeout: 15_000 });
  });

  test("Cross-session duplicate: same customer+date+items in a NEW tab → UPDATE not INSERT", async ({ browser }) => {
    // الطبقة الثالثة: جلسة جديدة (lastSavedIdRef صفر) لكن البصمة نفسها → guard على DB يعيد المستند الأول.
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    await a.goto("/quotes/create", { waitUntil: "domcontentloaded" });
    const custA = a.locator('.customer-name-input, input[placeholder*="عميل" i]').first();
    await custA.click(); await custA.fill("ا"); await pickFirstSuggestion(a);
    await fillOneProductRow(a);
    const num1 = await readDocNumber(a);
    await a.getByRole("button", { name: /^حفظ$|^حفظ العرض$/ }).first().click();
    await a.waitForURL(/\/quotes\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    await ctxA.close();

    // جلسة جديدة تماماً — نفس العميل + نفس البنود + نفس التاريخ → يجب أن نُحدَّث نفس العرض
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await b.goto("/quotes/create", { waitUntil: "domcontentloaded" });
    const custB = b.locator('.customer-name-input, input[placeholder*="عميل" i]').first();
    await custB.click(); await custB.fill("ا"); await pickFirstSuggestion(b);
    await fillOneProductRow(b);
    await b.getByRole("button", { name: /^حفظ$|^حفظ العرض$/ }).first().click();
    // toast يظهر بأن التحديث حصل على المستند الموجود
    await expect(b.getByText(new RegExp(`تم تحديث .*${num1}`))).toBeVisible({ timeout: 15_000 });
    await ctxB.close();
  });
});
