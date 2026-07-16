import { test, expect } from "@playwright/test";

/**
 * التحقق من أن الضغط المتكرر السريع على زر "تصدير PDF" لا يُنشئ عدّة عمليات
 * تنزيل — الزر يصبح disabled فور الضغطة الأولى ولا يقبل ضغطات لاحقة حتى
 * تنتهي عملية التصدير الحالية.
 */
test("rapid PDF export clicks do not trigger multiple downloads", async ({ page }) => {
  await page.goto("/customers/statements");
  // انتظر تحميل قائمة العملاء ثم افتح أول عميل
  const firstOpen = page.locator('button:has-text("كشف الحساب")').first();
  await firstOpen.waitFor({ state: "visible", timeout: 10_000 });
  await firstOpen.click();

  const exportBtn = page.getByTestId("statement-export-pdf");
  await exportBtn.waitFor({ state: "visible" });

  let downloads = 0;
  page.on("download", () => { downloads += 1; });

  // اضغط 5 مرات بسرعة
  await Promise.all([
    exportBtn.click({ force: true }),
    exportBtn.click({ force: true }).catch(() => {}),
    exportBtn.click({ force: true }).catch(() => {}),
    exportBtn.click({ force: true }).catch(() => {}),
    exportBtn.click({ force: true }).catch(() => {}),
  ]);

  // الزر يجب أن يصبح disabled خلال حالة التصدير
  await expect(exportBtn).toBeDisabled();

  // أعطِ فرصة كافية لأي تنزيلات فعلية أن تحدث
  await page.waitForTimeout(4000);

  // لا يجوز أن يزيد عدد التنزيلات عن 1
  expect(downloads).toBeLessThanOrEqual(1);
});
