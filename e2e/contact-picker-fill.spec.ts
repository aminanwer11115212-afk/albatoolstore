import { test, expect } from "@playwright/test";

/**
 * يختبر أن زر ContactPickerButton في نموذج إضافة العميل بصفحة العملاء:
 *  1. يستدعي navigator.contacts.select (مُستبدَل بـ stub).
 *  2. يعبّئ الاسم والهاتف تلقائياً.
 *  3. الهاتف المعروض في الحقل مطبَّع (بدون فراغات/شرطات، أرقام لاتينية).
 */

test("ContactPickerButton fills name + normalized phone in customer form", async ({ page }) => {
  // ثبّت stub قبل أي تنقّل
  await page.addInitScript(() => {
    // @ts-expect-error - contacts non-standard
    (navigator as any).contacts = {
      select: async (_props: string[], _opts: any) => [
        { name: ["أحمد الأمين"], tel: ["+249 ٩١ ٢٣٤ ٥٦٧٨"] },
      ],
    };
  });

  await page.goto("http://localhost:8080/customers");
  await page.waitForLoadState("domcontentloaded");

  // افتح نموذج الإضافة السريع
  const addBtn = page.getByRole("button", { name: /إضافة|جديد|عميل جديد/ }).first();
  if (await addBtn.isVisible().catch(() => false)) await addBtn.click();

  // اضغط زر جهات الاتصال بجانب حقل الهاتف
  const pickerBtn = page.getByRole("button", { name: /استيراد من جهات الاتصال/ }).first();
  await expect(pickerBtn).toBeVisible();
  await pickerBtn.click();

  // يجب أن يصبح الهاتف مطبَّعاً
  const phoneInput = page.locator('input[placeholder="الهاتف"]').first();
  await expect(phoneInput).toHaveValue("+249912345678");

  // يجب أن يمتلئ الاسم إن كان فارغاً
  const nameInput = page.locator('input[placeholder="الاسم *"]').first();
  await expect(nameInput).toHaveValue(/أحمد الأمين/);
});
