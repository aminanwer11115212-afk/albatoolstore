import { test, expect, Page } from "@playwright/test";

/**
 * E2E: ثبات تمرير شريط "آخر عروض الأسعار / آخر الفواتير" في شاشات Edit
 *
 * يتحقق أن موضع scroll في الـ Sidebar يبقى ثابتاً عند:
 *   1. تبديل البحث (typing in search box)
 *   2. تبديل فلتر الحالة (status dropdown)
 *   3. تبديل العميل داخل صفحة التعديل (يطلق autosave يحدّث صف العرض/الفاتورة)
 *
 * يغطي الشاشتين: /quotes/edit/:id و /invoices/edit/:id.
 *
 * متطلبات:
 *   - PLAYWRIGHT_STORAGE_STATE = جلسة مسجلة دخول
 *   - بيانات تجريبية: على الأقل عرض سعر واحد + فاتورة واحدة + عميلان مختلفان
 *
 * تشغيل:
 *   PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test sidebar-scroll-stability
 */

const SIDEBAR_SEL = '[data-testid="recent-sidebar-scroll"]';

async function getScrollTop(page: Page): Promise<number> {
  return await page.locator(SIDEBAR_SEL).first().evaluate(
    (el) => (el as HTMLElement).scrollTop
  );
}

async function setScrollTop(page: Page, top: number): Promise<void> {
  await page.locator(SIDEBAR_SEL).first().evaluate(
    (el, value) => { (el as HTMLElement).scrollTop = value; },
    top
  );
  // Allow scroll handler + sessionStorage write to flush
  await page.waitForTimeout(100);
}

/**
 * Inflate the sidebar with enough rows to be scrollable, then open the first
 * existing document of `type` in edit mode. Returns the route URL.
 */
async function openFirstEditPage(page: Page, type: "quotes" | "invoices"): Promise<void> {
  const listPath = type === "quotes" ? "/quotes" : "/invoices";
  await page.goto(listPath);
  // Click the first row's edit link (rows usually link to /:type/edit/:id or /view/:id)
  const firstRowLink = page.locator(`a[href*="/${type}/edit/"], a[href*="/${type}/view/"]`).first();
  await expect(firstRowLink).toBeVisible({ timeout: 15_000 });
  const href = await firstRowLink.getAttribute("href");
  if (!href) throw new Error(`No ${type} edit link found`);
  // Force the edit route specifically (some lists link to /view/:id)
  const editHref = href.replace(`/${type}/view/`, `/${type}/edit/`);
  await page.goto(editHref);
  await expect(page.locator(SIDEBAR_SEL).first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Make the sidebar scrollable by bumping its limit dropdown to 100 if present.
 * Falls back silently when the control isn't found.
 */
async function maximizeSidebarRows(page: Page): Promise<void> {
  // The limit selector is a small select/popover with values 10/100. Try both.
  const limitTrigger = page.locator(SIDEBAR_SEL).locator("xpath=..").locator(
    'button:has-text("10"), button:has-text("100"), select'
  ).first();
  if (await limitTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
    try {
      await limitTrigger.click();
      const opt100 = page.getByRole("option", { name: /^100$/ }).first();
      if (await opt100.isVisible({ timeout: 1000 }).catch(() => false)) {
        await opt100.click();
        await page.waitForTimeout(300);
      }
    } catch { /* ignore */ }
  }
}

async function ensureScrollable(page: Page): Promise<boolean> {
  return await page.locator(SIDEBAR_SEL).first().evaluate((el) => {
    const e = el as HTMLElement;
    return e.scrollHeight - e.clientHeight > 50;
  });
}

async function runScrollStabilityChecks(page: Page, kind: "quote" | "invoice"): Promise<void> {
  await maximizeSidebarRows(page);

  if (!(await ensureScrollable(page))) {
    test.info().annotations.push({
      type: "skip-reason",
      description: `Sidebar not scrollable in ${kind} edit page (insufficient test data).`,
    });
    test.skip(true, `Need more ${kind}s to make sidebar scrollable.`);
    return;
  }

  // 1) Set a known scroll position
  const TARGET = 220;
  await setScrollTop(page, TARGET);
  expect(await getScrollTop(page)).toBeGreaterThanOrEqual(TARGET - 5);

  // 2) Type in the search box → filter changes
  const searchBox = page.locator(SIDEBAR_SEL).locator("xpath=ancestor::*[1]").locator(
    'input[placeholder*="بحث"]'
  ).first();
  if (await searchBox.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchBox.fill("a");
    await page.waitForTimeout(200);
    const afterSearch = await getScrollTop(page);
    // Either preserved exactly, or clamped to max (when filter shrinks list).
    // Critical assertion: NOT zero unless that's the new max.
    const max = await page.locator(SIDEBAR_SEL).first().evaluate((el) => {
      const e = el as HTMLElement;
      return Math.max(0, e.scrollHeight - e.clientHeight);
    });
    if (max >= TARGET) {
      expect(afterSearch, "scroll lost on search").toBeGreaterThanOrEqual(TARGET - 5);
    } else {
      expect(afterSearch, "scroll exceeds new max").toBeLessThanOrEqual(max + 5);
    }

    // Clear the search → list expands back, scroll must still be anchored
    await searchBox.fill("");
    await page.waitForTimeout(200);
    expect(await getScrollTop(page), "scroll lost after clearing search").toBeGreaterThanOrEqual(
      TARGET - 5
    );
  }

  // 3) Change the status filter (top select inside the sidebar header)
  const statusSelect = page.locator(SIDEBAR_SEL).locator("xpath=ancestor::*[1]").locator(
    "select"
  ).first();
  if (await statusSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    const options = await statusSelect.locator("option").allTextContents();
    if (options.length > 1) {
      await statusSelect.selectOption({ index: 1 });
      await page.waitForTimeout(200);
      const max = await page.locator(SIDEBAR_SEL).first().evaluate((el) => {
        const e = el as HTMLElement;
        return Math.max(0, e.scrollHeight - e.clientHeight);
      });
      const after = await getScrollTop(page);
      if (max >= TARGET) {
        expect(after, "scroll lost on status filter").toBeGreaterThanOrEqual(TARGET - 5);
      } else {
        expect(after, "scroll exceeds new max after status filter").toBeLessThanOrEqual(max + 5);
      }
      // Restore "all"
      await statusSelect.selectOption({ index: 0 });
      await page.waitForTimeout(200);
      expect(await getScrollTop(page)).toBeGreaterThanOrEqual(TARGET - 5);
    }
  }

  // 4) Change the customer in the edit form → autosave patches the cache
  const customerInput = page.locator(
    '.customer-name-input, input[placeholder*="عميل" i]'
  ).first();
  if (await customerInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Re-anchor to TARGET in case the previous step left a different value.
    await setScrollTop(page, TARGET);
    const before = await getScrollTop(page);

    await customerInput.click();
    await customerInput.fill(""); // clear current
    await customerInput.type("ع", { delay: 50 });
    const suggestion = page.locator('[role="option"], .suggestion-item').first();
    if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suggestion.click();
      // Give the autosave debounce + cache patch time to fire
      await page.waitForTimeout(1500);
      const after = await getScrollTop(page);
      // Allow ±5 px tolerance for sub-pixel rounding
      expect(
        Math.abs(after - before),
        `Sidebar scroll jumped after customer change in ${kind}: ${before} → ${after}`
      ).toBeLessThanOrEqual(5);
    }
  }
}

test.describe("Sidebar scroll stability in edit pages", () => {
  test("Quote edit: scroll survives search / filter / customer change", async ({ page }) => {
    await openFirstEditPage(page, "quotes");
    await runScrollStabilityChecks(page, "quote");
  });

  test("Invoice edit: scroll survives search / filter / customer change", async ({ page }) => {
    await openFirstEditPage(page, "invoices");
    await runScrollStabilityChecks(page, "invoice");
  });
});
