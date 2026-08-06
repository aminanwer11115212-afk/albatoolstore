import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for E2E tests.
 *
 * Default base URL points to the local dev server (`bun run dev`).
 * Override at runtime with PLAYWRIGHT_BASE_URL=https://<preview-url>.
 *
 * Auth: tests rely on a logged-in session. Set TEST_USER_EMAIL and
 * TEST_USER_PASSWORD env vars before running, or pre-authenticate manually
 * and pass storageState via PLAYWRIGHT_STORAGE_STATE.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    locale: "ar-SA",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || undefined,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /*
         * متصفّحٌ مثبَّتٌ مسبقاً حين لا يطابق ما نزّله Playwright.
         *
         * بيئاتُ التشغيل المُدارة تأتي بكروم في مسارٍ ثابت، ونسختُه لا تطابق
         * ما تطلبه نسخةُ Playwright في package.json — فيسقط كلُّ ملفّ e2e
         * بـ«Executable doesn't exist» قبل أن يبدأ. فيُمرَّر المسار بمتغيّر
         * بيئة بدل تنزيلٍ لا يُسمح به.
         */
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
});
