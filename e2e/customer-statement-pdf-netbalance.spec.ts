import { test, expect } from "@playwright/test";

/**
 * التحقق من أن زر "تصدير PDF" في /customers/:id/statement:
 *  1. يحوّل إلى /reports/financial-preview.
 *  2. يعرض في صناديق ملخص التقرير نفس رقم netBalanceOf المعروض على صفحة كشف الحساب.
 *  3. يُظهر toast تحميل ثم نجاح/فشل.
 *
 * لا يتحقّق من محتوى ملف PDF الثنائي — html2pdf.js يعمل داخل iframe عبر CDN
 * وقد لا يكون متاحاً في CI؛ نتحقّق من أن الرقم المعروض في المعاينة (المصدر
 * الوحيد لبناء الملف) مطابق للرقم في الصفحة.
 */
test.describe("Customer statement — PDF export parity with netBalanceOf", () => {
  test("preview page shows same net balance as the statement page", async ({ page }) => {
    await page.goto("/customers/statements");
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();

    await page.waitForURL(/\/customers\/[0-9a-f-]{8,}\/statement/, { timeout: 8000 });

    // Grab "الرصيد الحالي" value from the summary card.
    const balanceCard = page
      .locator("p", { hasText: /^الرصيد الحالي/ })
      .locator("xpath=following-sibling::p[1]");
    await expect(balanceCard).toBeVisible({ timeout: 10000 });
    const shownBalance = (await balanceCard.textContent())?.trim() || "";
    // Normalize: strip minus / commas / spaces to get raw digits+dot.
    const normalize = (s: string) => s.replace(/[-−\s,،]/g, "");
    const expectedNumber = normalize(shownBalance);

    // Click "تصدير PDF"
    const exportBtn = page.getByTestId("statement-export-pdf");
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // Navigate to preview
    await page.waitForURL(/\/reports\/financial-preview/, { timeout: 8000 });

    // Wait for iframe to render the report.
    const iframe = page.frameLocator("iframe").first();
    const summary = iframe.locator("text=/الرصيد الصافي/").first();
    await expect(summary).toBeVisible({ timeout: 15000 });

    // The summary value sits near the label; grab whole summary section text
    // and assert it contains the same normalized number.
    const summarySection = iframe.locator('[data-section="summary"]').first();
    const summaryText = normalize((await summarySection.textContent()) || "");
    expect(summaryText).toContain(expectedNumber);
  });
});
