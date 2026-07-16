import { test, expect } from "@playwright/test";

// يتحقق من: تبديل خريطة/قوائم في LocationPicker + استمرار الاختيار بعد إعادة التحميل.
// LocationPicker يستخدم في صفحة العملاء عبر ديالوغ الإضافة.
test.describe("LocationPicker map/list toggle", () => {
  test("mode toggle persists in localStorage and value survives reload", async ({ page }) => {
    await page.goto("/customers");
    // افتح ديالوغ إضافة عميل جديد
    const addBtn = page.getByRole("button", { name: /إضافة|جديد/ }).first();
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
    }

    // ابدأ من وضع الخريطة (الافتراضي على الديسكتوب)
    await page.evaluate(() => localStorage.setItem("lov:location-picker:mode", "map"));
    await page.reload();

    // انتظر ظهور SVG (وضع الخريطة)
    const svg = page.locator("svg[aria-label*='خريطة السودان']").first();
    await expect(svg).toBeVisible({ timeout: 10000 });

    // بدّل لوضع القوائم
    const toListBtn = page.getByRole("button", { name: /عرض كقوائم/ });
    await toListBtn.click();

    // تحقق من الحفظ
    const mode1 = await page.evaluate(() => localStorage.getItem("lov:location-picker:mode"));
    expect(mode1).toBe("list");

    // بعد إعادة التحميل، القوائم ما زالت الوضع النشط
    await page.reload();
    const mode2 = await page.evaluate(() => localStorage.getItem("lov:location-picker:mode"));
    expect(mode2).toBe("list");

    // ارجع لوضع الخريطة
    const toMapBtn = page.getByRole("button", { name: /عرض كخريطة/ });
    if (await toMapBtn.isVisible().catch(() => false)) {
      await toMapBtn.click();
      const mode3 = await page.evaluate(() => localStorage.getItem("lov:location-picker:mode"));
      expect(mode3).toBe("map");
    }
  });
});
