/**
 * e2e: قالب طباعة كشف الحساب يستخدم netBalanceOf ويطابق
 * الرقم الظاهر في شاشة CustomerStatementPage تماماً بعد التقريب.
 *
 * نتحقّق من العقد فقط (بدون DB حية): buildStatementHtml يعتمد على
 * netBalanceOf(party) وليس على totals.remaining، فيكون الناتج مطابقاً
 * لما تعرضه computeDisplayBalance في الشاشة.
 */
import { test, expect } from "@playwright/test";

test("statement print template balance matches netBalanceOf on screen", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const bd: any = await import("/src/utils/balanceDisplay.tsx");
    const tpl: any = await import("/src/utils/statementPrintTemplate.ts");

    const party = { id: "p1", name: "عميل تجريبي", balance: 1500.005, credit_balance: 500.003, net_balance: 1000.002 };
    const screenNet = bd.netBalanceOf(party);
    const html = tpl.buildStatementHtml({
      kind: "customer",
      company: { company_name: "Albatool" },
      party,
      invoices: [],
      transactions: [],
      totals: { total: 0, paid: 0, remaining: 9999, balance: 9999 },
      fromDate: "",
      toDate: "",
    });
    // الرقم المكتوب في القالب لأقرب منزلتين — كذلك netBalanceOf
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      screen: round(Math.abs(screenNet)),
      // نبحث عن الرقم المكتوب داخل القالب (بدون فواصل)
      hasScreenValue: html.replace(/,/g, "").includes(String(round(Math.abs(screenNet)))),
      hasStaleRemaining: html.includes("9,999") || html.includes("9999"),
    };
  });

  expect(result.hasScreenValue).toBe(true);
  // القالب يجب ألا يعرض قيمة remaining القديمة كرصيد
  expect(result.hasStaleRemaining).toBe(false);
});
