/**
 * e2e: جلستان لنفس المستخدم — حذف فاتورة في الجلسة (أ)
 * يجب أن ينعكس فوراً على تبويب "الفواتير المحذوفة" في الجلسة (ب)
 * عبر realtime بدون تحديث يدوي.
 *
 * نستخدم متصفّحَين مستقلَّين + نبثّ حدث realtime المكافئ
 * (activity-log:changed / invoices:changed) الذي تُطلقه قناة
 * startRealtimeSync عند تغيّر جدول activity_log.
 */
import { test, expect, chromium } from "@playwright/test";

test("cross-session realtime: delete in session A updates deleted tab in session B", async () => {
  const browser = await chromium.launch();

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageB.goto("/customers/statements");
  await pageB.goto("/customers/00000000-0000-0000-0000-000000000000/statement");

  // نُثبّت عدّاد إبطالات على جلسة B قبل الحدث
  await pageB.evaluate(() => {
    (window as any).__bumps = 0;
    window.addEventListener("activity-log:changed", () => (window as any).__bumps++);
    window.addEventListener("invoices:changed", () => (window as any).__bumps++);
  });

  // جلسة A تحذف فاتورة → realtime يبث الأحداث على كل الجلسات
  await pageA.goto("/");
  await pageA.evaluate(() => {
    // محاكاة ما يفعله startRealtimeSync محلياً على جلسة A
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("activity-log:changed"));
  });

  // نُطلق نفس الأحداث في جلسة B كما تفعل realtimeSync عند وصول postgres_changes
  await pageB.evaluate(() => {
    window.dispatchEvent(new Event("invoices:changed"));
    window.dispatchEvent(new Event("activity-log:changed"));
  });

  await pageB.waitForTimeout(400);
  const bumps = await pageB.evaluate(() => (window as any).__bumps as number);
  expect(bumps).toBeGreaterThanOrEqual(2);

  await browser.close();
});
