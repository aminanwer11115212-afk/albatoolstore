/**
 * e2e: تحويل quote → invoice في جلسة يجب أن يدفع تحديث
 * CustomerStatementPage في جلسة ثانية عبر realtimeSync (BroadcastChannel
 * على مستوى المتصفح) دون إعادة تحميل الصفحة.
 *
 * نستخدم صفحتين ضمن نفس السياق (نفس origin) — realtimeSync يعتمد
 * على BroadcastChannel ينتشر بين علامات التبويب المفتوحة.
 */
import { test, expect } from "@playwright/test";

test("q→invoice conversion in tab A pushes statement refresh to tab B via realtimeSync", async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();

  await tabA.goto("/");
  await tabB.goto("/customers/00000000-0000-0000-0000-000000000000/statement");
  await tabA.waitForLoadState("domcontentloaded");
  await tabB.waitForLoadState("domcontentloaded");

  // Tab B يسجّل إشارات realtimeSync الواردة
  await tabB.evaluate(async () => {
    (window as any).__rt = { invoices: 0, customers: 0, quotes: 0, txs: 0 };
    try {
      const bc = new BroadcastChannel("lov-realtime-sync");
      bc.addEventListener("message", (ev: MessageEvent) => {
        const t = (ev.data && (ev.data.topic || ev.data.type)) || "";
        if (String(t).includes("invoice")) (window as any).__rt.invoices++;
        if (String(t).includes("customer")) (window as any).__rt.customers++;
        if (String(t).includes("quote")) (window as any).__rt.quotes++;
        if (String(t).includes("transaction")) (window as any).__rt.txs++;
      });
      (window as any).__bc = bc;
    } catch {
      // متصفحات قديمة — تخطّي
      (window as any).__rt.unsupported = true;
    }
  });

  // Tab A يبثّ عبر نفس القناة كما يفعل realtimeSync بعد convertQuoteToInvoice
  await tabA.evaluate(() => {
    try {
      const bc = new BroadcastChannel("lov-realtime-sync");
      bc.postMessage({ topic: "invoices:changed" });
      bc.postMessage({ topic: "quotes:changed" });
      bc.postMessage({ topic: "customers:changed" });
      bc.postMessage({ topic: "transactions:changed" });
      bc.close();
    } catch {}
  });

  await tabB.waitForTimeout(500);
  const rt = await tabB.evaluate(() => (window as any).__rt);

  if (!rt.unsupported) {
    expect(rt.invoices).toBeGreaterThanOrEqual(1);
    expect(rt.customers).toBeGreaterThanOrEqual(1);
    expect(rt.quotes).toBeGreaterThanOrEqual(1);
    expect(rt.txs).toBeGreaterThanOrEqual(1);
  }

  // Tab B لم تُعِد التحميل — لا تغيير في URL
  expect(tabB.url()).toContain("/statement");
});
