import { test, expect } from "@playwright/test";

/**
 * التنقل بلوحة المفاتيح بين تبويبات صفحة كشف الحساب
 * (الفواتير / المحذوفة / الحركات المالية) عبر Tab + Enter — لا يجب أن يسبب
 * أخطاء JS ولا يجب أن يخرج المستخدم من الصفحة.
 */
test("statement tabs are switchable via keyboard (Tab/Enter)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/customers/statements");
  const openBtn = page.locator('button:has-text("كشف الحساب")').first();
  await openBtn.waitFor({ state: "visible", timeout: 10_000 });
  await openBtn.click();

  const tablist = page.getByTestId("statement-tabs");
  await tablist.waitFor({ state: "visible" });
  const tabs = tablist.getByRole("tab");
  const count = await tabs.count();
  expect(count).toBe(3);

  // ركّز أول تبويب ثم استخدم Tab + Enter للانتقال بين التبويبات
  await tabs.nth(0).focus();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

  for (let i = 1; i < count; i++) {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
  }

  expect(errors, `pageerror: ${errors.join(" | ")}`).toHaveLength(0);
});
