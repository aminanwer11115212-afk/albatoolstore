/**
 * e2e: عند طباعة/تصدير PDF لكشف حساب العميل يجب أن يكون الرقم
 * المستخدم في كل مواضع "الرصيد" هو netBalanceOf(party) — وليس
 * totals.remaining. القالب buildStatementHtml يجب ألا يُدرج
 * totals.remaining كرصيد للعميل حتى لو اختلف عن net_balance.
 */
import { test, expect } from "@playwright/test";

test("statement print/PDF uses netBalanceOf everywhere, not totals.remaining", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const result = await page.evaluate(async () => {
    const bd: any = await import("/src/utils/balanceDisplay.tsx");
    const tpl: any = await import("/src/utils/statementPrintTemplate.ts");

    // نجعل net_balance مختلفاً تماماً عن totals.remaining لكشف أي تسرّب
    const party = {
      id: "p1",
      name: "عميل الاختبار",
      balance: 750,
      credit_balance: 250,
      net_balance: 500, // → netBalanceOf سيعيد 500
    };
    const totalsRemaining = 8888.88; // قيمة مميزة سهلة التتبع
    const html: string = tpl.buildStatementHtml({
      kind: "customer",
      company: { company_name: "Albatool" },
      party,
      invoices: [],
      transactions: [],
      totals: { total: 0, paid: 0, remaining: totalsRemaining, balance: totalsRemaining },
      fromDate: "",
      toDate: "",
    });
    const round = (n: number) => Math.round(n * 100) / 100;
    const screen = round(Math.abs(bd.netBalanceOf(party)));
    const cleaned = html.replace(/,/g, "");
    return {
      screen,                                    // 500
      containsScreen: cleaned.includes(String(screen)),
      leaksRemaining:
        cleaned.includes(String(round(totalsRemaining))) ||
        cleaned.includes("8888.88") ||
        cleaned.includes("8888,88"),
    };
  });

  // القالب يعرض قيمة netBalanceOf
  expect(result.containsScreen).toBe(true);
  // ولا يتسرّب totals.remaining كرصيد
  expect(result.leaksRemaining).toBe(false);
});
