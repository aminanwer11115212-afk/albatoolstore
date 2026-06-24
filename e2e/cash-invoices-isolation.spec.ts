import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: عزل مبيعات الكاش (POS) عن الفواتير العامة
 *
 * هدف الاختبار: التأكد أنّ كلّ ما يخص /invoices/cash مستقلّ تماماً عن
 * /invoices ومن صفحات التقارير العامة، مع بقاء التأثير على المخزون
 * صحيحاً ومُعلّماً ببادج "كاش".
 *
 * المتحقق منه:
 *  1. /invoices (الإدارة العامة) لا يعرض أيّ فاتورة برقم بادئته POS-.
 *  2. /invoices/cash/list لا يعرض أيّ فاتورة برقم بادئته INV- (بعد الترحيل
 *     باستخدام أداة /invoices/cash/migrate-numbers، أو إذا لم توجد بيانات
 *     قديمة).
 *  3. تقرير "فواتير اليوم" /invoices/today لا يحتوي بادئة POS-.
 *  4. /stock-tracking: أي صفّ مرتبط بفاتورة كاش يحمل بادج "كاش" ويفتح
 *     مسار /invoices/cash/edit/:id وليس /invoices/view/:id.
 *  5. زر "الفواتير العامة" داخل /invoices/cash/list يقود إلى /invoices
 *     والعكس عبر زر إنشاء فاتورة كاش من المسار العام لا يتوفّر تلقائياً
 *     (التنقّل بينهما صريح فقط).
 *
 * تشغيل:
 *   PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test cash-invoices-isolation
 */

const POS_PREFIX_RE = /\bPOS-\d+/;
const INV_PREFIX_RE = /\bINV-\d+/;

async function waitForList(page: Page) {
  // ننتظر استقرار الصفحة (انتهاء التحميل الأوّلي)
  await page
    .locator("text=/جاري التحميل/")
    .first()
    .waitFor({ state: "detached", timeout: 20_000 })
    .catch(() => {});
}

async function collectAllText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText || "");
}

test.describe("Cash (POS) ↔ Regular invoices isolation", () => {
  test("regular /invoices list never shows POS- numbered records", async ({ page }) => {
    await page.goto("/invoices");
    await waitForList(page);
    // الفلتر الافتراضي = regular ⇒ يجب ألاّ يظهر أي POS- في الصفحة
    const txt = await collectAllText(page);
    expect(txt).not.toMatch(POS_PREFIX_RE);
  });

  test("/invoices/cash/list shows only POS-prefixed records", async ({ page }) => {
    await page.goto("/invoices/cash/list");
    await waitForList(page);
    const txt = await collectAllText(page);
    // إن وجدت أرقام فواتير، يجب ألاّ يكون أيّ منها بصيغة INV-####
    // (POS-#### مسموح؛ غير مرقّم/أرقام أخرى مسموح أيضاً)
    expect(txt).not.toMatch(INV_PREFIX_RE);
  });

  test("/invoices/today excludes POS records", async ({ page }) => {
    await page.goto("/invoices/today");
    await waitForList(page);
    const txt = await collectAllText(page);
    expect(txt).not.toMatch(POS_PREFIX_RE);
  });

  test("stock tracking shows كاش badge and routes POS rows to /invoices/cash/edit", async ({ page }) => {
    await page.goto("/stock-tracking");
    await waitForList(page);

    // نبحث أوّلاً عن أي شارة "كاش" في الجدول. إن لم توجد بيانات POS بعد،
    // نُنهي الاختبار بنجاح حيادي (لا يوجد ما يُعزل عنه).
    const cashBadge = page.locator('text=/^\\s*كاش\\s*$/').first();
    const hasCash = await cashBadge.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasCash, "لا توجد حركات POS في تتبع المخزون — تخطّى الاختبار");

    // الصفّ الحاوي على الشارة يجب أن يحتوي على رابط/زر يقود لمسار الكاش.
    const row = cashBadge.locator("xpath=ancestor::tr[1]");
    await expect(row).toBeVisible();

    // التقط أي رابط داخل الصف وافحص href
    const link = row.locator('a[href*="/invoices/"]').first();
    if (await link.count()) {
      const href = await link.getAttribute("href");
      expect(href || "").toMatch(/\/invoices\/cash\/edit\//);
      expect(href || "").not.toMatch(/\/invoices\/view\//);
    } else {
      // أو زر يستدعي navigate — نتحقق عبر النقر ومراقبة الـ URL
      const clickable = row.locator("button, [role='button']").first();
      await clickable.click();
      await expect(page).toHaveURL(/\/invoices\/cash\/edit\//, { timeout: 10_000 });
    }
  });

  test("navigation between cash and regular is explicit and isolated", async ({ page }) => {
    await page.goto("/invoices/cash/list");
    await waitForList(page);

    // زر "الفواتير العامة" يجب أن يقود لـ /invoices
    const toRegular = page.getByRole("button", { name: /الفواتير العامة/ }).first();
    await expect(toRegular).toBeVisible();
    await toRegular.click();
    await expect(page).toHaveURL(/\/invoices(\?|$)/);
    await waitForList(page);

    // الصفحة العامة لا يجب أن تحوي POS-
    expect(await collectAllText(page)).not.toMatch(POS_PREFIX_RE);

    // والعكس: من الصفحة العامة لا يوجد دخول مباشر لفاتورة كاش، لكن
    // الانتقال اليدوي يجب أن يبقى يعرض POS فقط
    await page.goto("/invoices/cash/list");
    await waitForList(page);
    expect(await collectAllText(page)).not.toMatch(INV_PREFIX_RE);
  });
});
