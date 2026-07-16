import { test, expect } from "@playwright/test";

/**
 * محاكاة فشل جلب بيانات العملاء (netBalanceOf) داخل صفحة كشف الحساب،
 * والتحقق من ظهور CustomerStatementErrorState مع زر إعادة المحاولة الذي
 * يعيد المحاولة بنجاح بعد رفع الاعتراض.
 */
test("netBalanceOf failure shows error state and retry recovers", async ({ page }) => {
  let fail = true;
  await page.route("**/rest/v1/customers*", async (route) => {
    if (fail) {
      await route.fulfill({ status: 500, body: JSON.stringify({ message: "simulated" }) });
    } else {
      await route.continue();
    }
  });

  await page.goto("/customers/statements");

  // يجب أن تظهر رسالة الخطأ الموحّدة
  const errorBox = page.locator('text=تعذّر جلب بيانات العملاء');
  await expect(errorBox.first()).toBeVisible({ timeout: 10_000 });

  const retry = page.getByRole("button", { name: /إعادة المحاولة/ });
  await expect(retry).toBeVisible();

  // اسمح للطلب بالنجاح ثم اضغط إعادة المحاولة
  fail = false;
  await retry.click();

  // تختفي رسالة الخطأ وتظهر جدول العملاء أو رسالة "لا يوجد عملاء بعد"
  await expect(errorBox.first()).toBeHidden({ timeout: 10_000 });
});
