import { Page } from "@playwright/test";

/**
 * Print mock for Playwright E2E tests.
 *
 * The app prints by calling `openPrintWindow(html)` in src/utils/printTemplate.ts,
 * which does:
 *     const win = window.open("", "_blank");
 *     win.document.write(html);
 *     setTimeout(() => win.print(), 400);
 *
 * In tests we don't want a real printer dialog, but we DO want to verify:
 *   - that `window.open` was called (a print window was requested)
 *   - that `win.print()` was called on the opened window
 *   - the HTML payload that was written (so we can assert invoice number, totals…)
 *
 * Usage:
 *     await installPrintMock(page);
 *     // …trigger print in the UI…
 *     const calls = await getPrintCalls(page);
 *     expect(calls.length).toBeGreaterThan(0);
 *     expect(calls[0].html).toContain("INV-");
 */
export async function installPrintMock(page: Page) {
  await page.addInitScript(() => {
    interface PrintCall { html: string; printedAt: number; }
    const w = window as unknown as {
      __printCalls: PrintCall[];
      __originalOpen: typeof window.open;
      open: typeof window.open;
      print: typeof window.print;
    };

    w.__printCalls = [];
    w.__originalOpen = window.open.bind(window);

    // Stub window.open: return a fake window object that captures
    // document.write + print() instead of opening a real popup.
    window.open = ((..._args: unknown[]) => {
      let buffer = "";
      const fakeDoc = {
        write: (chunk: string) => { buffer += chunk; },
        close: () => {},
      };
      const fakeWin = {
        document: fakeDoc,
        print: () => {
          w.__printCalls.push({ html: buffer, printedAt: Date.now() });
        },
        close: () => {},
        focus: () => {},
        location: { href: "about:blank" },
      };
      return fakeWin as unknown as Window;
    }) as typeof window.open;

    // Also stub window.print() in case some flow calls it directly.
    window.print = () => {
      w.__printCalls.push({ html: document.documentElement.outerHTML, printedAt: Date.now() });
    };
  });
}

export async function getPrintCalls(page: Page): Promise<{ html: string; printedAt: number }[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __printCalls?: { html: string; printedAt: number }[] };
    return w.__printCalls || [];
  });
}

export async function clearPrintCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __printCalls?: unknown[] };
    if (w.__printCalls) w.__printCalls.length = 0;
  });
}
