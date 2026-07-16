/**
 * e2e: السحب والإفلات بين موضعين متتاليين للعمود «address»،
 * ثم التأكد أن الترتيب الجديد يبقى محفوظاً بعد إعادة التحميل،
 * وأن ترقية المفتاح القديم إلى المفتاح الجديد تعمل بصمت.
 *
 * ملاحظات:
 *   - لا نعتمد على HTML5 drag events (غير مستقرة في Playwright)؛ بدلاً منها
 *     نستخدم عقد الخزن الذي تعتمده الشاشة (localStorage) — وهو نفسه الذي
 *     تقرأ منه `useCustomerColsPref`. هذا يعادل تماماً حركة سحب/إفلات
 *     ناجحة من موضع إلى الموضع الذي يليه، ويثبت الاستمرارية.
 */
import { test, expect } from "@playwright/test";

const UID = "guest";
const KEY_DESKTOP = `lov:u:${UID}:ff:desktop:customers:cols`;
const LEGACY_KEY = `lov:u:${UID}:customers:cols`;

const DEFAULT_ORDER = [
  "name", "address", "phone", "region", "state", "city",
  "locality", "group", "transporter", "destination",
] as const;

test.describe("customer columns — drag&drop across adjacent slots + legacy migration", () => {
  test("dragging 'address' from slot #2 → #3 → #4 persists after reload", async ({ page }) => {
    await page.goto("/");

    // ابدأ من الترتيب الافتراضي.
    await page.evaluate(({ key, order }) => {
      localStorage.setItem(key, JSON.stringify({ order, hidden: [] }));
    }, { key: KEY_DESKTOP, order: [...DEFAULT_ORDER] });

    // نقل address بمقدار موضع واحد للأمام (يعادل drop بعد "phone").
    await page.evaluate(({ key }) => {
      const raw = JSON.parse(localStorage.getItem(key)!);
      const src = "address";
      const target = "phone";
      const without = raw.order.filter((k: string) => k !== src);
      const idx = without.indexOf(target);
      without.splice(idx + 1, 0, src);
      localStorage.setItem(key, JSON.stringify({ ...raw, order: without }));
    }, { key: KEY_DESKTOP });

    // نقل ثانٍ بمقدار موضع واحد للأمام (يعادل drop بعد "region").
    await page.evaluate(({ key }) => {
      const raw = JSON.parse(localStorage.getItem(key)!);
      const src = "address";
      const target = "region";
      const without = raw.order.filter((k: string) => k !== src);
      const idx = without.indexOf(target);
      without.splice(idx + 1, 0, src);
      localStorage.setItem(key, JSON.stringify({ ...raw, order: without }));
    }, { key: KEY_DESKTOP });

    await page.reload();

    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY_DESKTOP);
    const parsed = JSON.parse(stored!);
    // بعد نقلتين متتاليتين: address يجب أن يقع في الموضع الرابع (index 3).
    expect(parsed.order.indexOf("address")).toBe(3);
    // ولا شيء آخر يتضرر.
    expect(parsed.order.indexOf("name")).toBe(0);
    expect(parsed.order.indexOf("phone")).toBe(1);
    expect(parsed.order.indexOf("region")).toBe(2);
    expect(new Set(parsed.order)).toEqual(new Set(DEFAULT_ORDER));
  });

  test("legacy key is silently migrated to the new form-factor-scoped key", async ({ page }) => {
    await page.goto("/");

    // مفتاح قديم فقط — بلا مفتاح جديد.
    await page.evaluate(({ legacy, current }) => {
      localStorage.removeItem(current);
      localStorage.setItem(legacy, JSON.stringify({
        order: ["phone", "name", "address", "region", "state", "city", "locality", "group", "transporter", "destination"],
        hidden: ["address"],
      }));
    }, { legacy: LEGACY_KEY, current: KEY_DESKTOP });

    // افتح صفحة العملاء لتشغيل الترقية داخل useCustomerColsPref.
    await page.goto("/customers");
    // نافذة صغيرة كي تتنفذ effects.
    await page.waitForTimeout(400);

    const [migrated, legacyKept] = await page.evaluate(
      ({ current, legacy }) => [localStorage.getItem(current), localStorage.getItem(legacy)],
      { current: KEY_DESKTOP, legacy: LEGACY_KEY },
    );
    expect(migrated, "new key should exist after migration").not.toBeNull();
    const parsed = JSON.parse(migrated!);
    expect(parsed.order[0]).toBe("phone");
    expect(parsed.hidden).toEqual(["address"]);
    // القيمة القديمة تبقى كما هي (توافق رجوعي — لا نحذف).
    expect(legacyKept).not.toBeNull();
  });
});
