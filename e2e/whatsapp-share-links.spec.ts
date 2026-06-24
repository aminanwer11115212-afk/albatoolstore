import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * E2E: زر "واتساب" يرسل رابط معاينة عام صحيحاً لكل نوع مستند.
 *
 * يغطّي:
 *   1. فاتورة عادية      → /invoices  (handleWhatsApp في القائمة)
 *   2. فاتورة POS (كاش)  → /invoices/cash/list
 *   3. عرض سعر          → /quotes
 *   4. عرض سعر جانبي     → /quotes/side/:id
 *   5. CashInvoices (شاشة تحرير POS) → /invoices/cash/edit/:id
 *
 * المنهج:
 *   - نعترض fetch إلى /functions/v1/create-document-share-token ونعيد
 *     رابط معاينة معروف يحتوي توكناً ثابتاً (TOKEN_FIXTURE).
 *   - نلتقط استدعاء window.open لمعرفة الرابط النهائي (wa.me/api.whatsapp)
 *     ونتحقق أن الرسالة تحتوي نفس التوكن.
 *   - نتحقق أيضاً أنّ body الطلب يحمل doc_type المتوقَّع لكل صفحة.
 *
 * تشغيل:
 *   PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test whatsapp-share-links
 */

const TOKEN_FIXTURE = "e2e-token-" + Math.random().toString(36).slice(2, 10);
const SHARE_URL_FIXTURE = `https://share.example.test/d/${TOKEN_FIXTURE}`;

type Captured = { docType?: string; openedUrl?: string };

async function installInterceptors(page: Page, captured: Captured) {
  // اعتراض edge function لإصدار التوكن
  await page.route("**/functions/v1/create-document-share-token", async (route: Route) => {
    try {
      const body = route.request().postDataJSON?.() ?? JSON.parse(route.request().postData() || "{}");
      captured.docType = body?.doc_type;
    } catch { /* ignore */ }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: SHARE_URL_FIXTURE, token: TOKEN_FIXTURE }),
    });
  });

  // اعتراض window.open والـ <a target=_blank>
  await page.addInitScript(() => {
    (window as any).__openedUrls = [] as string[];
    const orig = window.open;
    window.open = function (url?: any, ...rest: any[]) {
      try { (window as any).__openedUrls.push(String(url || "")); } catch { /* */ }
      // لا نفتح نافذة فعلاً — نعيد null
      return null as any;
    } as typeof window.open;
  });
}

async function readOpenedUrl(page: Page): Promise<string | undefined> {
  // قد تستغرق دورة الـ promise بضع لحظات
  for (let i = 0; i < 30; i++) {
    const urls = (await page.evaluate(() => (window as any).__openedUrls || [])) as string[];
    const hit = urls.find((u) => /wa\.me|whatsapp\.com|api\.whatsapp/i.test(u));
    if (hit) return hit;
    await page.waitForTimeout(200);
  }
  return undefined;
}

async function waitListReady(page: Page) {
  await page.locator("text=/جاري التحميل/").first().waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});
}

/** ينقر أول زر "واتساب" مرئي ضمن أول صفّ في القائمة */
async function clickFirstWhatsAppButton(page: Page): Promise<boolean> {
  const btn = page.locator('button[title*="واتساب"], button:has-text("واتساب")').first();
  if (!(await btn.count())) return false;
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click({ timeout: 5000 }).catch(() => {});
  return true;
}

test.describe("WhatsApp share link per document type", () => {
  test("فاتورة عادية → doc_type=invoice ورابط المعاينة يحتوي التوكن", async ({ page }) => {
    const cap: Captured = {};
    await installInterceptors(page, cap);
    await page.goto("/invoices");
    await waitListReady(page);
    const has = await clickFirstWhatsAppButton(page);
    test.skip(!has, "لا توجد فواتير عادية لاختبارها");
    const opened = await readOpenedUrl(page);
    expect(opened, "لم يُفتح رابط واتساب").toBeTruthy();
    expect(cap.docType).toBe("invoice");
    expect(decodeURIComponent(opened!)).toContain(SHARE_URL_FIXTURE);
    expect(decodeURIComponent(opened!)).toContain(TOKEN_FIXTURE);
  });

  test("فاتورة POS من /invoices/cash/list → doc_type=invoice مع رابط يحتوي التوكن", async ({ page }) => {
    const cap: Captured = {};
    await installInterceptors(page, cap);
    await page.goto("/invoices/cash/list");
    await waitListReady(page);
    const has = await clickFirstWhatsAppButton(page);
    test.skip(!has, "لا توجد فواتير كاش لاختبارها");
    const opened = await readOpenedUrl(page);
    expect(opened).toBeTruthy();
    // فواتير POS تستعمل نفس جدول invoices ⇒ doc_type يبقى "invoice"
    expect(cap.docType).toBe("invoice");
    expect(decodeURIComponent(opened!)).toContain(TOKEN_FIXTURE);
  });

  test("شاشة تحرير فاتورة كاش /invoices/cash/edit/:id → doc_type=invoice", async ({ page }) => {
    const cap: Captured = {};
    await installInterceptors(page, cap);
    await page.goto("/invoices/cash/list");
    await waitListReady(page);
    const firstRowLink = page.locator('a[href*="/invoices/cash/edit/"]').first();
    test.skip(!(await firstRowLink.count()), "لا توجد فاتورة كاش يمكن فتحها");
    await firstRowLink.click();
    await page.waitForURL(/\/invoices\/cash\/edit\//, { timeout: 15_000 });
    await waitListReady(page);
    const has = await clickFirstWhatsAppButton(page);
    test.skip(!has, "زر واتساب غير ظاهر داخل المحرر");
    const opened = await readOpenedUrl(page);
    expect(opened).toBeTruthy();
    expect(cap.docType).toBe("invoice");
    expect(decodeURIComponent(opened!)).toContain(TOKEN_FIXTURE);
  });

  test("عرض سعر عادي /quotes → doc_type=quote ورابط بالتوكن", async ({ page }) => {
    const cap: Captured = {};
    await installInterceptors(page, cap);
    await page.goto("/quotes");
    await waitListReady(page);
    const has = await clickFirstWhatsAppButton(page);
    test.skip(!has, "لا توجد عروض أسعار");
    const opened = await readOpenedUrl(page);
    expect(opened).toBeTruthy();
    expect(cap.docType).toBe("quote");
    expect(decodeURIComponent(opened!)).toContain(TOKEN_FIXTURE);
  });

  test("عرض سعر جانبي /quotes/side/:id → doc_type=quote ورابط بالتوكن", async ({ page }) => {
    const cap: Captured = {};
    await installInterceptors(page, cap);
    // نحاول الوصول لقائمة الجانبية أولاً
    await page.goto("/quotes?tab=side").catch(() => {});
    await waitListReady(page);
    let sideLink = page.locator('a[href*="/quotes/side/"]').first();
    if (!(await sideLink.count())) {
      await page.goto("/quotes/side");
      await waitListReady(page);
      sideLink = page.locator('a[href*="/quotes/side/"]').first();
    }
    test.skip(!(await sideLink.count()), "لا توجد عروض جانبية لاختبارها");
    await sideLink.click();
    await page.waitForURL(/\/quotes\/side\//, { timeout: 15_000 });
    await waitListReady(page);
    const has = await clickFirstWhatsAppButton(page);
    test.skip(!has, "زر واتساب غير ظاهر في تفصيل العرض الجانبي");
    const opened = await readOpenedUrl(page);
    expect(opened).toBeTruthy();
    expect(cap.docType).toBe("quote"); // جانبي يخزَّن في جدول quotes
    expect(decodeURIComponent(opened!)).toContain(TOKEN_FIXTURE);
  });
});
