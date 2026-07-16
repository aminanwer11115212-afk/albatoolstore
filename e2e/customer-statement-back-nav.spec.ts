import { test, expect } from "@playwright/test";

/**
 * روابط التنقل داخل صفحة كشف حساب العميل: الضغط على اسم العميل في الـ Hero
 * أو على رابط "كشوفات العملاء" يعيد المستخدم إلى /customers/statements
 * دون فتح المسارات القديمة (/reports/customer-statement).
 */
test("customer name / back link returns to /customers/statements", async ({ page }) => {
  await page.goto("/customers/statements");
  const openBtn = page.locator('button:has-text("كشف الحساب")').first();
  await openBtn.waitFor({ state: "visible", timeout: 10_000 });
  await openBtn.click();
  await expect(page).toHaveURL(/\/customers\/[^/]+\/statement/);

  // 1) رابط "كشوفات العملاء" في الـ breadcrumb
  await page.getByTestId("hero-back-to-statements").click();
  await expect(page).toHaveURL(/\/customers\/statements(\?|$)/);

  // 2) العودة مرة أخرى ثم اضغط على اسم العميل نفسه
  await openBtn.click();
  await expect(page).toHaveURL(/\/customers\/[^/]+\/statement/);
  await page.getByTestId("hero-customer-name").click();
  await expect(page).toHaveURL(/\/customers\/statements(\?|$)/);
});
