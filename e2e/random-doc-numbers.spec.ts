import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: توليد رقم افتراضي عشوائي لكل مستند جديد
 *
 * يفتح كل صفحة إنشاء عدة مرات ويقرأ الرقم المُولَّد من العنصر المخفي
 * data-testid="doc-number"، ثم يتحقّق أنّ كل المحاولات أنتجت أرقاماً مختلفة
 * (لا تسلسلية ولا متكرّرة).
 *
 * تشغيل:
 *   PLAYWRIGHT_STORAGE_STATE=auth.json bunx playwright test random-doc-numbers
 */

const TRIES = 5;

async function readGeneratedNumber(page: Page, expectedPrefix?: RegExp): Promise<string> {
  const marker = page.getByTestId("doc-number").first();
  await marker.waitFor({ state: "attached", timeout: 20_000 });
  // ننتظر حتى يمتلئ بقيمة غير فارغة (التوليد غير متزامن)
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="doc-number"]');
      return !!el && (el.textContent || "").trim().length > 0;
    },
    null,
    { timeout: 20_000 },
  );
  const value = (await marker.textContent())?.trim() || "";
  if (expectedPrefix) expect(value).toMatch(expectedPrefix);
  return value;
}

async function collectNumbers(page: Page, route: string, tries: number, prefixRe: RegExp): Promise<string[]> {
  const numbers: string[] = [];
  for (let i = 0; i < tries; i++) {
    // إضافة cache-buster لمنع reuse للصفحة المخزّنة
    await page.goto(`${route}${route.includes("?") ? "&" : "?"}_r=${Date.now()}_${i}`);
    const n = await readGeneratedNumber(page, prefixRe);
    numbers.push(n);
  }
  return numbers;
}

function assertAllUnique(numbers: string[], label: string) {
  const unique = new Set(numbers);
  expect(
    unique.size,
    `[${label}] expected ${numbers.length} different numbers but got duplicates: ${JSON.stringify(numbers)}`,
  ).toBe(numbers.length);
}

function assertNotSequential(numbers: string[], label: string) {
  // التسلسلية = كل رقم = السابق + 1
  const nums = numbers.map((s) => {
    const m = s.match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : NaN;
  });
  let sequential = true;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] !== 1) { sequential = false; break; }
  }
  expect(
    sequential,
    `[${label}] numbers look strictly sequential (N+1) — randomisation broken: ${JSON.stringify(numbers)}`,
  ).toBe(false);
}

test.describe("Random default document numbers", () => {
  test("Regular invoice — /invoices/new generates unique INV-* per load", async ({ page }) => {
    const nums = await collectNumbers(page, "/invoices/new", TRIES, /^INV-\d{4,}$/);
    assertAllUnique(nums, "invoice");
    assertNotSequential(nums, "invoice");
  });

  test("Cash invoice — /invoices/cash generates unique POS-* (or configured prefix) per load", async ({ page }) => {
    const nums = await collectNumbers(page, "/invoices/cash", TRIES, /-\d{4,}$/);
    assertAllUnique(nums, "cash-invoice");
    assertNotSequential(nums, "cash-invoice");
  });

  test("Regular quote — /quotes/new generates unique QT-* per load", async ({ page }) => {
    const nums = await collectNumbers(page, "/quotes/new", TRIES, /^QT-\d{4,}$/);
    assertAllUnique(nums, "quote");
    assertNotSequential(nums, "quote");
  });

  test("Side quote — /quotes/side/new generates unique QTS-* per load", async ({ page }) => {
    const nums = await collectNumbers(page, "/quotes/side/new", TRIES, /^QTS-\d{4,}$/);
    assertAllUnique(nums, "side-quote");
    assertNotSequential(nums, "side-quote");
  });

  test("Cross-mode isolation: regular and cash invoice numbers don't collide", async ({ page }) => {
    const regular = await collectNumbers(page, "/invoices/new", 3, /^INV-\d{4,}$/);
    const cash = await collectNumbers(page, "/invoices/cash", 3, /-\d{4,}$/);
    // البادئات مختلفة → لن يحدث تصادم نصّي حتى لو تطابقت الأرقام
    for (const r of regular) for (const c of cash) expect(r).not.toBe(c);
  });
});
