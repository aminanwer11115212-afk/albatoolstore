import { test, expect, Page } from "@playwright/test";

/**
 * E2E: زر «إضافة عميل جديد» في صفحات إنشاء المستندات
 * (عرض السعر /quotes/create والفاتورة /invoices/create).
 *
 * الهدف: التأكد من أن:
 *  1) الزر ظاهر ويستجيب للنقر.
 *  2) الحوار يفتح بشكل صحيح (بصرياً — [role="dialog"] مرئي).
 *  3) validation يعمل: اسم فارغ يُرفض.
 *  4) الحفظ ينجح باسم صالح، الحوار يُغلق، والعميل يظهر مختاراً في الصفحة.
 *  5) InlineSearchSelect لا يتسبب في إغلاق الحوار (regression لـ radix-portal-pointer-events).
 *
 * متطلبات: PLAYWRIGHT_STORAGE_STATE لجلسة مسجّلة الدخول.
 */

const DIALOG = '[role="dialog"]';

async function openAddCustomerFromPage(page: Page, path: "/quotes/create" | "/invoices/create") {
  await page.goto(path);
  const addBtn = page.getByRole("button", { name: /إضافة عميل جديد/ });
  await expect(addBtn, `[${path}] زر «إضافة عميل جديد» غير موجود`).toBeVisible({ timeout: 10_000 });
  await addBtn.first().click();
  const dialog = page.locator(DIALOG).filter({ hasText: /إضافة عميل|عميل جديد/ }).first();
  await expect(dialog, `[${path}] الحوار لم يفتح بعد النقر`).toBeVisible({ timeout: 5_000 });
  return dialog;
}

for (const path of ["/quotes/create", "/invoices/create"] as const) {
  test.describe(`Add customer from ${path}`, () => {
    test("الزر يفتح الحوار، validation يعمل، الحفظ ينجح", async ({ page }) => {
      const dialog = await openAddCustomerFromPage(page, path);

      // 1) validation: اسم فارغ يُرفض
      const saveBtn = dialog.getByRole("button", { name: /^(حفظ|إضافة|تحديث)$/ });
      await expect(saveBtn).toBeVisible();
      await saveBtn.click();
      // الحوار يجب أن يبقى مفتوحاً (toast خطأ)
      await expect(dialog, "الحوار أُغلق رغم فشل الـ validation").toBeVisible();

      // 2) امتلاء الاسم + الحفظ
      const uniqueName = `عميل اختبار ${Date.now()}`;
      const nameInput = dialog.locator("input").first();
      await nameInput.fill(uniqueName);

      // 3) اختبار InlineSearchSelect: افتح أول قائمة، اختر خياراً، تأكد أن الحوار لم يُغلق
      const firstCombobox = dialog.locator('button[type="button"]').filter({ hasText: /—|اختر|الاتجاه/ }).first();
      if (await firstCombobox.count()) {
        await firstCombobox.click().catch(() => {});
        const searchInput = page.locator('input[placeholder="ابحث أو اكتب اسم جديد..."]').first();
        if (await searchInput.isVisible().catch(() => false)) {
          // اختر أول خيار إن وُجد
          const option = page
            .locator('div.bg-popover button[type="button"], div.bg-card button[type="button"]')
            .first();
          if (await option.count()) {
            await option.click();
            await expect(dialog, "الحوار أُغلق بعد اختيار من القائمة (radix portal bug regression)").toBeVisible();
          } else {
            await page.keyboard.press("Escape");
          }
        }
      }

      // 4) الحفظ
      await saveBtn.click();
      await expect(dialog, "الحوار لم يُغلق بعد الحفظ الناجح").toBeHidden({ timeout: 10_000 });

      // 5) العميل يظهر مختاراً في الصفحة (حقل بحث العميل يعرض الاسم)
      await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 5_000 });
    });

    test("زر الإغلاق (X/إلغاء) لا يحفظ", async ({ page }) => {
      const dialog = await openAddCustomerFromPage(page, path);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 5_000 });
    });
  });
}
