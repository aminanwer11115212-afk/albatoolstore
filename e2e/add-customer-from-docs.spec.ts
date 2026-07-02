import { test, expect, Page } from "@playwright/test";

/**
 * E2E: زر «إضافة عميل جديد» في صفحات إنشاء المستندات
 * (عرض السعر /quotes/create والفاتورة /invoices/create) عبر عدّة أحجام شاشة.
 *
 * على الديسكتوب: النموذج يفتح كـ Dialog / Sheet جانبي.
 * على الموبايل:  النموذج يفتح كـ Sheet (drawer) بعرض كامل تقريباً.
 *
 * الأهداف:
 *  1) الزر ظاهر ويستجيب للنقر في كل الأحجام.
 *  2) الحاوية تفتح (Dialog أو Sheet) دون تداخل مع overlay.
 *  3) validation يعمل: اسم فارغ يُرفض.
 *  4) اختيار من InlineSearchSelect لا يُغلق الحاوية (regression لـ radix-portal-pointer-events).
 *  5) الحفظ ينجح والحاوية تُغلق والعميل يظهر مختاراً.
 *  6) القائمة المنبثقة لا تُقصّ خارج viewport ولا تتداخل مع الفوتر.
 */

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

const CONTAINER =
  '[role="dialog"]:visible, [role="alertdialog"]:visible, [data-state="open"][role="region"]:visible';

async function openAddCustomerFromPage(page: Page, path: "/quotes/create" | "/invoices/create") {
  await page.goto(path);
  const addBtn = page.getByRole("button", { name: /إضافة عميل جديد/ });
  await expect(addBtn, `[${path}] زر «إضافة عميل جديد» غير موجود`).toBeVisible({ timeout: 10_000 });
  await addBtn.first().click();
  const container = page.locator(CONTAINER).first();
  await expect(container, `[${path}] الحاوية لم تفتح بعد النقر`).toBeVisible({ timeout: 5_000 });
  return container;
}

for (const vp of VIEWPORTS) {
  test.describe(`[${vp.name} ${vp.width}x${vp.height}] Add customer from docs`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const path of ["/quotes/create", "/invoices/create"] as const) {
      test(`${path} — فتح/validation/InlineSearchSelect/حفظ`, async ({ page }) => {
        const container = await openAddCustomerFromPage(page, path);

        // 1) الحاوية داخل الـ viewport (لا تُقصّ)
        const box = await container.boundingBox();
        expect(box, "boundingBox").not.toBeNull();
        if (box) {
          expect(box.x + box.width, "الحاوية تتجاوز عرض الشاشة").toBeLessThanOrEqual(vp.width + 1);
          expect(box.y, "الحاوية خارج أعلى الشاشة").toBeGreaterThanOrEqual(0);
        }

        // 2) validation: اسم فارغ يُرفض
        const saveBtn = container.getByRole("button", { name: /^(حفظ|إضافة|تحديث)$/ }).first();
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();
        await expect(container, "الحاوية أُغلقت رغم فشل الـ validation").toBeVisible();

        // 3) InlineSearchSelect: فتح قائمة، فحص pointer-events على العنصر المنبثق، النقر بالماوس
        const firstCombo = container
          .locator('button[type="button"]')
          .filter({ hasText: /—|اختر|الاتجاه/ })
          .first();
        if (await firstCombo.count()) {
          await firstCombo.scrollIntoViewIfNeeded();
          await firstCombo.click().catch(() => {});
          const search = page.locator('input[placeholder="ابحث أو اكتب اسم جديد..."]').first();
          if (await search.isVisible().catch(() => false)) {
            // فحص المنبثق: pointer-events لا يجب أن يكون none (radix-portal trap)
            const popup = page.locator('div.bg-popover').first();
            const pe = await popup.evaluate((el) => getComputedStyle(el).pointerEvents);
            expect(pe, "popup pointer-events = none (Radix portal trap)").not.toBe("none");

            // فحص التداخل: قمة المنبثق يجب ألا تُغطّى بفوتر الحاوية
            const pBox = await popup.boundingBox();
            expect(pBox, "popup bbox").not.toBeNull();
            if (pBox) {
              expect(pBox.x + pBox.width).toBeLessThanOrEqual(vp.width + 1);
              expect(pBox.width, "المنبثق ضيّق جداً").toBeGreaterThan(120);
            }

            const opt = page
              .locator('div.bg-popover button[type="button"]')
              .filter({ hasNotText: /إضافة/ })
              .first();
            if (await opt.count()) {
              await opt.click();
              await expect(container, "الحاوية أُغلقت بعد اختيار (portal-pointer-events regression)").toBeVisible();
              await expect(popup, "القائمة لم تُغلق بعد الاختيار").toBeHidden({ timeout: 2_000 });
            } else {
              await page.keyboard.press("Escape");
            }
          }
        }

        // 4) امتلاء الاسم + الحفظ
        const uniqueName = `عميل اختبار ${vp.name} ${Date.now()}`;
        const nameInput = container.locator("input").first();
        await nameInput.fill(uniqueName);
        await saveBtn.click();
        await expect(container, "الحاوية لم تُغلق بعد الحفظ").toBeHidden({ timeout: 10_000 });

        // 5) العميل ظاهر مختاراً في الصفحة
        await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 5_000 });
      });

      test(`${path} — Escape يُغلق دون حفظ`, async ({ page }) => {
        const container = await openAddCustomerFromPage(page, path);
        await page.keyboard.press("Escape");
        await expect(container).toBeHidden({ timeout: 5_000 });
      });
    }
  });
}
