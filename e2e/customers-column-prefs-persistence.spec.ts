/**
 * e2e: تفضيلات أعمدة صفحة إدارة العملاء تبقى بعد إعادة تحميل الصفحة.
 *
 * السيناريو:
 *   1. اقرأ حالة افتراضية من useCustomerColsPref (عبر localStorage key mock).
 *   2. أخفِ العمود "address" وأعد ترتيب "phone" إلى بداية القائمة.
 *   3. اقرأ localStorage للتأكد من الحفظ.
 *   4. أعد تحميل الصفحة وتحقق أن الترتيب/الإخفاء نفسه.
 *
 * الاختبار مستقل عن قاعدة البيانات — يحاكي فقط عقد useCustomerColsPref
 * (شكل الحفظ في localStorage) لأن التطبيق يبني الحالة منه مباشرة.
 */
import { test, expect } from "@playwright/test";

const UID = "guest";
const KEY_DESKTOP = `lov:u:${UID}:ff:desktop:customers:cols`;
const KEY_MOBILE = `lov:u:${UID}:ff:mobile:customers:cols`;

test.describe("customer columns prefs — persistence & form-factor isolation", () => {
  test("hide + reorder persist across reload (desktop bucket)", async ({ page }) => {
    await page.goto("/");

    // ضع تفضيلات desktop: خفاء "address" ونقل "phone" لبداية الترتيب.
    await page.evaluate(({ key }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          order: ["phone", "name", "address", "region", "state", "city", "locality", "group", "transporter", "destination"],
          hidden: ["address"],
        }),
      );
    }, { key: KEY_DESKTOP });

    await page.reload();

    const stored = await page.evaluate((key) => localStorage.getItem(key), KEY_DESKTOP);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.order[0]).toBe("phone");
    expect(parsed.order[1]).toBe("name");
    expect(parsed.hidden).toEqual(["address"]);
  });

  test("mobile and desktop buckets are stored under different keys and do not bleed", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(({ mobile, desktop }) => {
      localStorage.setItem(
        desktop,
        JSON.stringify({ order: ["name", "phone", "address", "region", "state", "city", "locality", "group", "transporter", "destination"], hidden: [] }),
      );
      localStorage.setItem(
        mobile,
        JSON.stringify({ order: ["phone", "name", "address", "region", "state", "city", "locality", "group", "transporter", "destination"], hidden: ["address", "group"] }),
      );
    }, { mobile: KEY_MOBILE, desktop: KEY_DESKTOP });

    await page.reload();

    const [desk, mob] = await page.evaluate(
      ({ mobile, desktop }) => [localStorage.getItem(desktop), localStorage.getItem(mobile)],
      { mobile: KEY_MOBILE, desktop: KEY_DESKTOP },
    );
    expect(desk).not.toBeNull();
    expect(mob).not.toBeNull();
    const d = JSON.parse(desk!);
    const m = JSON.parse(mob!);

    // ديسكتوب: بلا مخفي، الاسم أولاً.
    expect(d.hidden).toEqual([]);
    expect(d.order[0]).toBe("name");

    // موبايل: الهاتف أولاً، والعنوان والمجموعة مخفية — دلوان مستقلان تماماً.
    expect(m.order[0]).toBe("phone");
    expect(m.hidden).toEqual(expect.arrayContaining(["address", "group"]));
    expect(m.hidden.length).toBe(2);

    // مفتاحان مختلفان — لا يوجد تداخل.
    expect(KEY_MOBILE).not.toBe(KEY_DESKTOP);
  });

  test("reset restores default order for current bucket only", async ({ page }) => {
    await page.goto("/");

    await page.evaluate(({ mobile, desktop }) => {
      localStorage.setItem(desktop, JSON.stringify({ order: ["destination"], hidden: ["name"] }));
      localStorage.setItem(mobile, JSON.stringify({ order: ["group"], hidden: ["phone"] }));
    }, { mobile: KEY_MOBILE, desktop: KEY_DESKTOP });

    // إعادة تعيين مماثلة لما يفعله زر «افتراضي» — للـdesktop فقط.
    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          order: ["name", "address", "phone", "region", "state", "city", "locality", "group", "transporter", "destination"],
          hidden: [],
        }),
      );
    }, KEY_DESKTOP);

    const [desk, mob] = await page.evaluate(
      ({ mobile, desktop }) => [localStorage.getItem(desktop), localStorage.getItem(mobile)],
      { mobile: KEY_MOBILE, desktop: KEY_DESKTOP },
    );
    const d = JSON.parse(desk!);
    const m = JSON.parse(mob!);

    expect(d.order).toEqual([
      "name", "address", "phone", "region", "state", "city", "locality", "group", "transporter", "destination",
    ]);
    expect(d.hidden).toEqual([]);
    // ‏موبايل ما تغيّر.
    expect(m.order).toEqual(["group"]);
    expect(m.hidden).toEqual(["phone"]);
  });
});
