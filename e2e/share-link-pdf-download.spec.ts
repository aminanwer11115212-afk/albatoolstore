// E2E: customer share-link PDF download
//
// Verifies (against the real rendered HTML of the share template) that:
//   1. <meta name="lov-doc-label|lov-doc-number|lov-customer-name"> are correct.
//   2. The two account-summary counters ("المبلغ المدفوع" / "المطلوب النهائي")
//      show numbers matching the same math as src/utils/printTemplate.ts:
//        paidAmount and Math.max(0, grandTotal - paidAmount).
//   3. The Download PDF button computes the unified filename
//      "<label> - <customer> - <number>.pdf" (exposed as data-filename)
//      and the actual browser download suggests that same name.
//
// The share template (supabase/functions/document-share/template.ts) is a pure
// module and safe to import from Playwright — no Deno / esm.sh deps.
import { test, expect } from "@playwright/test";
import { buildDocHTML } from "../supabase/functions/document-share/template";

const FIXTURE = {
  docTitle: "فاتورة مبيعات",
  docNumber: "INV-2026-001",
  date: "2026-07-07",
  customer: { name: "أحمد علي", phone: "0100", address: "شارع 1" },
  items: [
    { product_name: "منتج ألف", quantity: 2, unit_price: 100, total: 200 },
    { product_name: "منتج باء", quantity: 1, unit_price: 800, total: 800 },
  ],
  grandTotal: 1000,
  paidAmount: 300,
  company: { company_name: "شركة الاختبار" },
};

function expectedFilename(): string {
  return `${FIXTURE.docTitle} - ${FIXTURE.customer.name} - ${FIXTURE.docNumber}.pdf`;
}

test.describe("customer share-link PDF download", () => {
  test("meta tags + paid/final counters + filename all match printTemplate contract", async ({ page }) => {
    const html = buildDocHTML(FIXTURE);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    // --- meta tags -------------------------------------------------------
    await expect(page.locator('meta[name="lov-doc-label"]')).toHaveAttribute("content", FIXTURE.docTitle);
    await expect(page.locator('meta[name="lov-doc-number"]')).toHaveAttribute("content", FIXTURE.docNumber);
    await expect(page.locator('meta[name="lov-customer-name"]')).toHaveAttribute("content", FIXTURE.customer.name);

    // --- account-summary counters ---------------------------------------
    const paidTxt = (await page.locator('[data-section="paid-amount"] .summary-box-value').innerText()).replace(/,/g, "");
    const finalTxt = (await page.locator('[data-section="final-total"] .summary-box-value').innerText()).replace(/,/g, "");
    const paid = Number(paidTxt);
    const final = Number(finalTxt);
    // Same math as printTemplate.ts line 97: Math.max(0, grandTotal - paidAmount)
    expect(paid).toBe(FIXTURE.paidAmount);
    expect(final).toBe(Math.max(0, FIXTURE.grandTotal - FIXTURE.paidAmount));
    expect(paid + final).toBe(FIXTURE.grandTotal);

    // --- filename exposed on button (data-filename set by inline script) -
    // Wait for the IIFE to run.
    await expect
      .poll(() => page.locator("#__btn_pdf").getAttribute("data-filename"), { timeout: 3000 })
      .toBe(expectedFilename());
  });

  test("filename sanitises unsafe chars and stays under 120 chars", async ({ page }) => {
    const dirty = {
      ...FIXTURE,
      customer: { ...FIXTURE.customer, name: 'Ali/Bad\\Name:*?"<>|\n\r\tX' },
      docNumber: "INV/2026\\002",
    };
    const html = buildDocHTML(dirty);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const fname = await expect
      .poll(() => page.locator("#__btn_pdf").getAttribute("data-filename"), { timeout: 3000 })
      .not.toBeNull();

    const raw = await page.locator("#__btn_pdf").getAttribute("data-filename");
    expect(raw).toBeTruthy();
    expect(raw!.length).toBeLessThanOrEqual(124); // 120 + ".pdf"
    // must not contain forbidden filesystem chars
    expect(raw!).not.toMatch(/[\\/:*?"<>|\r\n\t]/);
    expect(raw!.endsWith(".pdf")).toBe(true);
    // must still contain the doc label + a customer segment + a number segment
    expect(raw!).toContain(FIXTURE.docTitle);
    expect(raw!.split(" - ").length).toBeGreaterThanOrEqual(3);
  });

  test("clicking download triggers a browser download with the unified filename", async ({ page }) => {
    const html = buildDocHTML(FIXTURE);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    // html2pdf.js is loaded from a CDN inside the page. If offline (e.g. CI
    // without egress), skip the actual download assertion — the button
    // exposes data-filename regardless, which we already asserted above.
    const cdnOk = await page.evaluate(async () => {
      try {
        const r = await fetch("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js", { method: "HEAD" });
        return r.ok;
      } catch { return false; }
    });
    test.skip(!cdnOk, "html2pdf CDN not reachable from sandbox");

    // Wait for html2pdf to finish loading in the page before clicking.
    await page.waitForFunction(() => typeof (window as any).html2pdf === "function", null, { timeout: 15_000 }).catch(() => {});

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.locator("#__btn_pdf").click(),
    ]);

    expect(download.suggestedFilename()).toBe(expectedFilename());
  });
});
