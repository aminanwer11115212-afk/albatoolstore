import { test, expect, Page, Locator } from "@playwright/test";

/**
 * E2E: «إضافة منتج جديد» — التأكّد أن InlineSearchSelect الخاص بالفئة
 * (وبقيّة القوائم: الماركة/المستودع) يقبل الاختيار بالماوس وبالكيبورد
 * دون أن يُغلق الحوار قبل تثبيت القيمة.
 *
 * متطلبات التشغيل:
 *  - PLAYWRIGHT_BASE_URL (افتراضي http://localhost:8080)
 *  - PLAYWRIGHT_STORAGE_STATE = ملف جلسة مسجَّلة الدخول
 *  - وجود بيانات اختبارية (فئة واحدة على الأقل). القوائم الفارغة تُتخطّى.
 */

const DIALOG = '[role="dialog"]';

async function openAddProductDialog(page: Page) {
  await page.goto("/products");
  const addBtn = page.getByRole("button", { name: /منتج\s*جديد/ });
  await expect(addBtn.first()).toBeVisible({ timeout: 10_000 });
  await addBtn.first().click();
  const dialog = page.locator(DIALOG).filter({ hasText: /إضافة منتج جديد/ }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // اسم المنتج (مطلوب للحفظ، ومفيد كي لا يتركّز focus خطأً على القائمة)
  const nameInput = dialog.locator('input').first();
  await nameInput.fill(`منتج اختبار ${Date.now()}`);
  return dialog;
}

/** يحدّد زر InlineSearchSelect المرتبط بعنوان حقل داخل الحوار. */
function selectByLabel(dialog: Locator, label: string | RegExp): Locator {
  return dialog
    .locator("div")
    .filter({ has: dialog.page().getByText(label, { exact: false }) })
    .locator('button[type="button"]')
    .first();
}

function menuSearchInput(page: Page): Locator {
  return page.locator('input[placeholder="ابحث أو اكتب اسم جديد..."]').first();
}

async function probeMouse(dialog: Locator, label: string) {
  const trigger = selectByLabel(dialog, label);
  if (!(await trigger.count())) return { skipped: true, reason: "trigger-not-found" };
  if (await trigger.isDisabled().catch(() => false)) return { skipped: true, reason: "disabled" };

  await trigger.click();
  const search = menuSearchInput(dialog.page());
  await expect(search, `[${label}] القائمة لم تفتح`).toBeVisible({ timeout: 5_000 });

  const options = dialog.page().locator('div.bg-card.border-2.border-primary >> button[type="button"]');
  const count = await options.count();
  if (count === 0) {
    await dialog.page().keyboard.press("Escape");
    return { skipped: true, reason: "no-options" };
  }
  const first = options.first();
  const text = (await first.innerText()).trim();
  await first.click();

  await expect(dialog, `[${label}] الحوار أُغلق بعد النقر بالماوس`).toBeVisible();
  await expect(search, `[${label}] القائمة لم تُغلق بعد الاختيار`).toBeHidden();
  await expect(trigger, `[${label}] القيمة لم تثبت على الزر`).toContainText(text);
  return { skipped: false as const };
}

async function probeKeyboard(dialog: Locator, label: string) {
  const trigger = selectByLabel(dialog, label);
  if (!(await trigger.count())) return { skipped: true, reason: "trigger-not-found" };
  await trigger.click();
  const search = menuSearchInput(dialog.page());
  await expect(search, `[${label}] القائمة لم تفتح بالكيبورد`).toBeVisible({ timeout: 5_000 });
  await dialog.page().keyboard.press("ArrowDown");
  await dialog.page().keyboard.press("Enter");
  await expect(dialog, `[${label}] الحوار أُغلق بعد Enter`).toBeVisible();
  await expect(search, `[${label}] القائمة لم تُغلق بعد Enter`).toBeHidden();
  return { skipped: false as const };
}

test.describe("Add product — InlineSearchSelect (category mouse + keyboard)", () => {
  test("اختيار الفئة بالماوس داخل حوار «إضافة منتج جديد» لا يُغلق الحوار", async ({ page }) => {
    const dialog = await openAddProductDialog(page);

    // 1) الفئة بالماوس — الهدف الأساسي للاختبار
    const cat = await probeMouse(dialog, "الفئات");
    expect.soft(cat.skipped, `فئات: ${cat.skipped ? cat.reason : "ok"}`).toBeFalsy();

    // 2) الفئة بالكيبورد
    await probeKeyboard(dialog, "الفئات");

    // 3) الماركة + المستودع كقوائم ثانوية (تُتخطّى لو لم تتوفّر بيانات)
    const report: Record<string, string> = { "الفئات (ماوس)": cat.skipped ? `skipped (${cat.reason})` : "ok" };
    for (const label of ["الماركة", "مستودع"]) {
      const r = await probeMouse(dialog, label);
      report[label] = r.skipped ? `skipped (${r.reason})` : "ok";
    }
    console.log("Product dialog InlineSearchSelect report:", report);

    // الحوار ما زال مفتوحاً
    await expect(dialog).toBeVisible();
  });
});
