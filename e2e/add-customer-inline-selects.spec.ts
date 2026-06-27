import { test, expect, Page, Locator } from "@playwright/test";

/**
 * E2E: «إضافة عميل جديد» — تأكيد أن كل InlineSearchSelect
 * (الاتجاه / الولاية / المدينة / الترحيلات / المجموعة / الوجهة)
 * يمكن الاختيار منه بالماوس وبالكيبورد دون إغلاق مفاجئ للحوار.
 *
 * متطلبات التشغيل:
 *  - PLAYWRIGHT_BASE_URL (اختياري، الافتراضي http://localhost:8080)
 *  - PLAYWRIGHT_STORAGE_STATE = ملف جلسة مسجَّلة الدخول
 *  - وجود بيانات اختبارية للاتجاهات + الولايات + المدن + الترحيلات + المجموعات + الوجهات
 *    (السكربت يتخطّى تلقائياً أي قائمة لا تحتوي خيارات.)
 */

const DIALOG = '[role="dialog"]';

async function openAddCustomerDialog(page: Page) {
  await page.goto("/customers");
  // زر «عميل جديد» (CustomersPage.tsx:783) — مع طريق احتياطي عبر اختصار F9
  const addBtn = page.getByRole("button", { name: /عميل\s*جديد/ });
  if (await addBtn.count()) {
    await addBtn.first().click();
  } else {
    await page.keyboard.press("F9");
  }
  const dialog = page.locator(DIALOG).filter({ hasText: /إضافة عميل|عميل جديد/ }).first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // املأ الاسم لتجنّب أي تركيز افتراضي على الحقول التالية
  const nameInput = dialog.locator('input').first();
  await nameInput.fill(`عميل اختبار ${Date.now()}`);
  return dialog;
}

/** يحدّد زر InlineSearchSelect المرتبط بالعنوان النصي للحقل داخل الحوار. */
function selectByLabel(dialog: Locator, label: string | RegExp): Locator {
  // كل حقل: <div><label>النص</label><div class="!p-0"><InlineSearchSelect/></div></div>
  return dialog
    .locator("div")
    .filter({ has: dialog.page().getByText(label, { exact: false }) })
    .locator('button[type="button"]')
    .first();
}

/** يتأكّد أن القائمة المنسدلة الحالية مفتوحة (input بحث ظاهر). */
function openMenu(dialog: Locator): Locator {
  return dialog.page().locator('input[placeholder="ابحث أو اكتب اسم جديد..."]').first();
}

async function probeSelect(
  dialog: Locator,
  label: string,
): Promise<{ skipped: boolean; reason?: string }> {
  const trigger = selectByLabel(dialog, label);
  if (!(await trigger.count())) return { skipped: true, reason: "trigger-not-found" };

  // إذا كان الحقل معطّلاً (مثل الولاية قبل اختيار الاتجاه) ندعه للمرحلة التالية بعد التسلسل
  const disabled = await trigger.isDisabled().catch(() => false);
  if (disabled) return { skipped: true, reason: "disabled" };

  // ===== 1) اختيار بالماوس =====
  await trigger.click();
  const searchInput = openMenu(dialog);
  await expect(searchInput, `[${label}] القائمة لم تفتح`).toBeVisible({ timeout: 5_000 });

  const options = dialog.page().locator('div.bg-card.border-2.border-primary >> button[type="button"]');
  // قد يكون أوّل زر هو «إضافة …» إذا كتبنا نصاً غير موجود؛ هنا لم نكتب شيئاً.
  const count = await options.count();
  if (count === 0) {
    await dialog.page().keyboard.press("Escape");
    return { skipped: true, reason: "no-options" };
  }

  const firstOption = options.first();
  const labelText = (await firstOption.innerText()).trim();
  await firstOption.click();

  // الحوار يجب أن يظل مفتوحاً، والقائمة يجب أن تُغلق، والقيمة يجب أن تظهر على الزر
  await expect(dialog, `[${label}] الحوار أُغلق بعد اختيار بالماوس`).toBeVisible();
  await expect(searchInput, `[${label}] القائمة لم تُغلق بعد الاختيار`).toBeHidden();
  await expect(trigger, `[${label}] القيمة المختارة لم تظهر`).toContainText(labelText);

  // ===== 2) اختيار بالكيبورد =====
  await trigger.click();
  await expect(openMenu(dialog)).toBeVisible();
  await dialog.page().keyboard.press("ArrowDown");
  await dialog.page().keyboard.press("ArrowDown");
  await dialog.page().keyboard.press("Enter");
  await expect(dialog, `[${label}] الحوار أُغلق بعد Enter`).toBeVisible();
  await expect(openMenu(dialog), `[${label}] القائمة لم تُغلق بعد Enter`).toBeHidden();

  return { skipped: false };
}

test.describe("Add customer — InlineSearchSelect mouse/keyboard", () => {
  test("كل القوائم المنسدلة تعمل بالماوس والكيبورد دون إغلاق الحوار", async ({ page }) => {
    const dialog = await openAddCustomerDialog(page);

    // مهم: ترتيب cascading — الاتجاه قبل الولاية قبل المدينة
    const labels = [
      "الاتجاه",
      "الولاية",
      "المدينة",
      "المجموعة",
      "الترحيلات",
      "الوجهة",
    ];

    const report: Record<string, string> = {};
    for (const label of labels) {
      const res = await probeSelect(dialog, label);
      report[label] = res.skipped ? `skipped (${res.reason})` : "ok";
    }

    // اطبع التقرير لتسهيل التشخيص
    console.log("InlineSearchSelect probe report:", report);

    // على الأقل الاتجاه يجب أن يعمل (وإلا فالاختبار لا معنى له)
    expect(report["الاتجاه"]).toBe("ok");

    // الحوار ما زال مفتوحاً في النهاية
    await expect(dialog).toBeVisible();
  });
});
