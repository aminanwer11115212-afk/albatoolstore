import { test, expect, Page } from "@playwright/test";
import { installPrintMock, getPrintCalls } from "./helpers/printMock";

/**
 * E2E: تدفق عرض السعر الكامل
 *  1. إنشاء عرض سعر جديد + إضافة صنف
 *  2. إضافة سجل ترحيل (Transport)
 *  3. تحويل العرض إلى فاتورة
 *  4. تسجيل دفعة على الفاتورة
 *  5. اختيار خيار طباعة + التحقق من استدعاء window.print
 *     (الطباعة الحقيقية ممنوعة عبر printMock — لا حوار طباعة OS).
 *
 * متطلبات التشغيل:
 *  - PLAYWRIGHT_BASE_URL يشير إلى التطبيق (افتراضي http://localhost:8080)
 *  - PLAYWRIGHT_STORAGE_STATE = ملف جلسة محفوظ بعد تسجيل الدخول يدوياً
 *
 * لتوليد ملف الجلسة:
 *    bunx playwright codegen <PREVIEW_URL> --save-storage=auth.json
 *  ثم:
 *    PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test
 */

const QUOTE_NUMBER_RE = /QT-\d+/;
const INVOICE_NUMBER_RE = /INV-\d+/;

async function gotoNewQuote(page: Page) {
  await page.goto("/quotes/new");
  // الصفحة تحت neo-quote-scope class
  await expect(page.locator(".neo-quote-scope").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("Quote → Invoice → Payment → Print flow", () => {
  test("full happy path", async ({ page }) => {
    // ثبّت موك الطباعة قبل أي تنقّل حتى نلتقط window.open / win.print()
    await installPrintMock(page);
    await gotoNewQuote(page);

    // 1) اختيار أول عميل من القائمة (نفترض وجود بيانات اختبارية)
    const customerInput = page.locator(
      '.customer-name-input, input[placeholder*="عميل" i], input[placeholder*="customer" i]'
    ).first();
    await expect(customerInput).toBeVisible();
    await customerInput.click();
    await customerInput.fill("اختبار");
    // اختيار أول اقتراح إن وُجد، وإلا نكتفي بالنص الحر
    const suggestion = page.locator('[role="option"], .suggestion-item').first();
    if (await suggestion.isVisible({ timeout: 2000 }).catch(() => false)) {
      await suggestion.click();
    }

    // 2) إضافة صنف: ابحث عن أول حقل بحث منتج في صف العناصر
    const productInput = page.locator(
      'tbody input[placeholder*="منتج" i], tbody input[placeholder*="product" i]'
    ).first();
    await expect(productInput).toBeVisible();
    await productInput.click();
    await productInput.fill("a");
    const productSuggestion = page.locator('[role="option"], .suggestion-item').first();
    if (await productSuggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
      await productSuggestion.click();
    }

    // ادخل كمية = 1 وسعر إن لم يتوفر آلياً
    const qtyInput = page.locator('tbody input[type="number"]').first();
    if (await qtyInput.isVisible().catch(() => false)) {
      await qtyInput.fill("1");
      await qtyInput.press("Tab");
    }

    // 3) حفظ عرض السعر (ضروري قبل التحويل/الترحيل لوجود editId)
    await page.getByRole("button", { name: /^حفظ$/ }).first().click();
    await expect(page.locator("text=" + QUOTE_NUMBER_RE.source).first()).toBeVisible({
      timeout: 15_000,
    });

    // 4) إضافة سجل ترحيل
    const transportBtn = page.getByRole("button", { name: /ترحيل|transport/i }).first();
    await transportBtn.click();
    const driverField = page.locator('input[placeholder*="سائق" i], input[name*="driver" i]').first();
    if (await driverField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await driverField.fill("سائق E2E");
      const costField = page.locator('input[placeholder*="تكلفة" i], input[name*="cost" i]').first();
      if (await costField.isVisible().catch(() => false)) await costField.fill("5000");
      await page.getByRole("button", { name: /حفظ|save|إضافة/i }).first().click();
    }

    // 5) تحويل لفاتورة
    page.once("dialog", (d) => d.accept());
    const convertBtn = page.getByRole("button", { name: /تحويل لفاتورة/i }).first();
    await expect(convertBtn).toBeVisible();
    await convertBtn.click();

    // حوار التحويل الناجح
    const openInvoiceBtn = page.getByRole("button", { name: /فتح الفاتورة للتعديل/i });
    await expect(openInvoiceBtn).toBeVisible({ timeout: 20_000 });
    await openInvoiceBtn.click();

    // 6) في صفحة الفاتورة: تأكد من رقم الفاتورة
    await expect(page).toHaveURL(/\/invoices\/edit\//, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(INVOICE_NUMBER_RE);

    // 7) تسجيل دفعة
    const payBtn = page.getByRole("button", { name: /دفعة|سجل الدفع|payment/i }).first();
    await payBtn.click();
    const amountField = page.locator('input[placeholder*="مبلغ" i], input[name*="amount" i]').first();
    await expect(amountField).toBeVisible({ timeout: 5000 });
    await amountField.fill("100");
    await page.getByRole("button", { name: /حفظ|تسجيل|save/i }).first().click();

    // 8) الطباعة: افتح حوار الخيارات ثم اختر أول صيغة طباعة، وتحقق
    //    أن الموك التقط استدعاء window.print() مع HTML يحوي رقم الفاتورة.
    const printBtn = page.getByRole("button", { name: /^طباعة$/ }).first();
    await printBtn.click();
    const printDialog = page.getByRole("dialog").filter({ hasText: /طباعة/i });
    await expect(printDialog).toBeVisible({ timeout: 5000 });

    // اختر أول بطاقة/زر داخل حوار الطباعة (مثل: "كاملة" / "بدون حساب" …)
    await printDialog.getByRole("button").first().click();

    // انتظر استدعاء window.print() عبر setTimeout(400) في openPrintWindow
    await page.waitForFunction(() => {
      const w = window as unknown as { __printCalls?: unknown[] };
      return (w.__printCalls?.length ?? 0) > 0;
    }, { timeout: 5000 });

    const calls = await getPrintCalls(page);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].html).toMatch(/INV-\d+/);
    expect(calls[0].html.length).toBeGreaterThan(200); // payload معقول
  });
});
