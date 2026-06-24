import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: الضغط المتكرر على زر الحفظ لا ينشئ تكراراً ولا يغيّر الرقم
 *
 *  - يفتح فاتورة كاش جديدة (لا تتطلب عميلاً) + عرض سعر جديد (يتطلب عميلاً)
 *  - يضيف صنفاً واحداً ثم يضغط زر "حفظ" عدّة مرّات بسرعة
 *  - يتحقق:
 *      1) رقم المستند data-testid="doc-number" لم يتغيّر بين كل الضغطات.
 *      2) المسار تحوّل إلى /edit/<id> ثابت (نفس المعرّف) — أي UPDATE وليس INSERT.
 *      3) لا أرقام إضافية متولِّدة بعد الحفظ الأول.
 *
 * تشغيل:
 *   PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test repeated-save-no-duplicate
 */

async function readDocNumber(page: Page): Promise<string> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="doc-number"]');
      return !!el && (el.textContent || "").trim().length > 0;
    },
    null,
    { timeout: 20_000 },
  );
  return ((await page.getByTestId("doc-number").first().textContent()) || "").trim();
}

async function pickFirstSuggestion(page: Page) {
  const sug = page.locator('[role="option"], .suggestion-item, .lov-suggestion').first();
  if (await sug.isVisible({ timeout: 2500 }).catch(() => false)) await sug.click();
}

async function addOneProduct(page: Page) {
  const productInput = page
    .locator('tbody input[placeholder*="منتج" i], tbody input[placeholder*="product" i], input[placeholder*="ابحث عن منتج" i]')
    .first();
  await expect(productInput).toBeVisible({ timeout: 15_000 });
  await productInput.click();
  await productInput.fill("a");
  await pickFirstSuggestion(page);
  // كمية = 1 (افتراضياً غالباً، نحاول التأكيد إن وُجد حقل رقم)
  const qty = page.locator('tbody input[type="number"]').first();
  if (await qty.isVisible({ timeout: 2000 }).catch(() => false)) {
    await qty.fill("1");
    await qty.press("Tab");
  }
}

async function clickSaveRapidly(page: Page, times: number) {
  const btn = page.getByRole("button", { name: /^حفظ الفاتورة$|^تحديث الفاتورة$|^حفظ$|^تحديث$/ }).first();
  await expect(btn).toBeVisible();
  // ضغطات سريعة متتابعة بدون انتظار اكتمال أيٍّ منها
  const clicks: Promise<void>[] = [];
  for (let i = 0; i < times; i++) {
    clicks.push(btn.click({ force: true, noWaitAfter: true, timeout: 5000 }).catch(() => undefined));
  }
  await Promise.all(clicks);
}

test.describe("Repeated save does not duplicate or change the document number", () => {
  test("Cash invoice: rapid save clicks → single edit URL, stable number", async ({ page }) => {
    await page.goto("/invoices/cash/new");
    await expect(page.locator(".neo-quote-scope, .header-bar").first()).toBeVisible({ timeout: 20_000 });

    const numberBefore = await readDocNumber(page);
    expect(numberBefore).toMatch(/-\d{4,}$/);

    await addOneProduct(page);

    await clickSaveRapidly(page, 4);

    // ننتظر تحوّل المسار إلى edit
    await page.waitForURL(/\/invoices\/cash\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    const editUrl1 = page.url();
    const numberAfter = await readDocNumber(page);
    expect(numberAfter).toBe(numberBefore);

    // ضغط إضافي بعد دخول وضع التعديل: لا يجب أن يتغيّر شيء
    await clickSaveRapidly(page, 3);
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(editUrl1);
    const numberAfter2 = await readDocNumber(page);
    expect(numberAfter2).toBe(numberBefore);
  });

  test("Quote: rapid save clicks → single edit URL, stable number", async ({ page }) => {
    await page.goto("/quotes/create");
    await expect(page.locator(".neo-quote-scope").first()).toBeVisible({ timeout: 20_000 });

    const numberBefore = await readDocNumber(page);
    expect(numberBefore).toMatch(/^QT-\d{4,}$/);

    // عميل
    const customerInput = page.locator('.customer-name-input, input[placeholder*="عميل" i]').first();
    await customerInput.click();
    await customerInput.fill("اختبار");
    await pickFirstSuggestion(page);

    await addOneProduct(page);

    const saveBtn = page.getByRole("button", { name: /^حفظ$|^حفظ العرض$/ }).first();
    await expect(saveBtn).toBeVisible();
    const clicks: Promise<void>[] = [];
    for (let i = 0; i < 4; i++) {
      clicks.push(saveBtn.click({ force: true, noWaitAfter: true, timeout: 5000 }).catch(() => undefined));
    }
    await Promise.all(clicks);

    await page.waitForURL(/\/quotes\/edit\/[0-9a-f-]+/i, { timeout: 30_000 });
    const editUrl1 = page.url();
    const numberAfter = await readDocNumber(page);
    expect(numberAfter).toBe(numberBefore);

    // إعادة الضغط بعد دخول وضع التعديل
    const updateBtn = page.getByRole("button", { name: /^حفظ$|^تحديث/ }).first();
    for (let i = 0; i < 3; i++) {
      await updateBtn.click({ force: true, noWaitAfter: true, timeout: 5000 }).catch(() => undefined);
    }
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(editUrl1);
    const numberAfter2 = await readDocNumber(page);
    expect(numberAfter2).toBe(numberBefore);
  });
});
