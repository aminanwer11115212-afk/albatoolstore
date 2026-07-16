import { test, expect } from "@playwright/test";

/**
 * البحث الذكي في /customers/statements — يدعم:
 *  - اسم جزئي (containsMatch).
 *  - التشكيل / أ-إ-آ-ا / ي-ى / ة-ه.
 *  - رسالة "لا يوجد عملاء مطابقون لـ ..." عند عدم وجود نتائج.
 */
test.describe("Customer statements — fuzzy/partial search", () => {
  test('shows "no results" message for a bogus query', async ({ page }) => {
    await page.goto("/customers/statements");
    const input = page.getByPlaceholder(/ابحث بالاسم/);
    await expect(input).toBeVisible();

    // Wait until initial data settled (rows or empty state).
    await page.waitForTimeout(500);

    const bogus = "zzzzz-لا-يوجد-عميل-بهذا-الاسم-٩٩٩";
    await input.fill(bogus);
    await expect(page.getByText(new RegExp(`لا يوجد عملاء مطابقون`))).toBeVisible({ timeout: 4000 });
    // The URL persists the query.
    await expect(page).toHaveURL(new RegExp(`\\?q=`));
  });

  test("partial name substring matches (containsMatch, not just startsWith)", async ({ page }) => {
    await page.goto("/customers/statements");
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    const fullName = (await firstRow.locator("td").nth(1).textContent())?.trim() || "";
    test.skip(!fullName || fullName.length < 4, "no customer with a long-enough name to test substring");

    // Pick a middle 2-char slice — guaranteed NOT to be a prefix of the name.
    const middle = fullName.slice(Math.max(1, Math.floor(fullName.length / 2)), Math.max(1, Math.floor(fullName.length / 2)) + 2);
    const input = page.getByPlaceholder(/ابحث بالاسم/);
    await input.fill(middle);

    // The row containing the full name must still be visible.
    await expect(page.locator("table tbody tr", { hasText: fullName })).toBeVisible({ timeout: 4000 });
  });

  test("Arabic normalization: أ/إ/ا treated as the same letter", async ({ page }) => {
    await page.goto("/customers/statements");
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    const name = (await firstRow.locator("td").nth(1).textContent())?.trim() || "";
    test.skip(!/[أإآا]/.test(name), "first customer name has no alif to test normalization");

    // Swap alif variants and confirm match still happens.
    const swapped = name.replace(/[أإآ]/g, "ا").slice(0, 3);
    const input = page.getByPlaceholder(/ابحث بالاسم/);
    await input.fill(swapped);
    await expect(page.locator("table tbody tr", { hasText: name })).toBeVisible({ timeout: 4000 });
  });
});
