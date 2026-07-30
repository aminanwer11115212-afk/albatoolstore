import { chromium } from 'playwright';
const SP = process.env.SP;
const payload = {
  customer: { id: "11111111-2222-3333-4444-555555555555", name: "شركة النور للتجارة", phone: "0912345678", address: "دمشق - شارع الثورة", balance: 300, credit_balance: 100, net_balance: 200 },
  company: { company_name: "اولاد جابر لاسبيرات المواتر والتكاتك", address: "الخرطوم - السوق العربي", phone: "0900000000", currency: "SDG" },
  invoices: [
    { id: "inv-1", invoice_number: "INV-2026-1001", date: "2026-01-05", total: 500, paid_amount: 500, due_amount: 0, status: "paid" },
    { id: "inv-2", invoice_number: "INV-2026-1002", date: "2026-02-10", total: 800, paid_amount: 600, due_amount: 200, status: "partial" },
    { id: "inv-3", invoice_number: "INV-2026-1003", date: "2026-03-01", total: 300, paid_amount: 200, due_amount: 100, status: "partial" },
  ],
  quotes: [{ id: "q1", quote_number: "QT-501", date: "2026-01-02", total: 900, status: "accepted" }],
  returns: [],
  transactions: [
    { id: "p1", date: "2026-01-06", amount: 400, type: "income", category: "customer_payment", reference_id: "inv-1", method: "cash" },
    { id: "c1", date: "2026-01-20", amount: 200, type: "income", category: "customer_credit", reference_no: "OP-77", allocation: { group_id: "g1", kind: "surplus" } },
    { id: "u1", date: "2026-01-21", amount: -100, type: "income", category: "customer_credit", reference_id: "inv-1", allocation: { group_id: "g1", kind: "invoice_alloc" } },
    { id: "p2", date: "2026-01-21", amount: 100, type: "income", category: "customer_payment", reference_id: "inv-1", method: "credit_balance" },
    { id: "p3", date: "2026-02-11", amount: 600, type: "income", category: "customer_payment", reference_id: "inv-2", method: "bank" },
    { id: "c2", date: "2026-03-05", amount: 100, type: "income", category: "customer_credit", reference_no: "OP-88" },
    { id: "p4", date: "2026-03-02", amount: 200, type: "income", category: "customer_payment", reference_id: "inv-3", method: "cash" },
  ],
  accounts: [],
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [name, w, h] of [["desktop", 1280, 1800], ["mobile", 375, 812]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.route('**/functions/v1/customer-statement*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4173/share/customer/t/demo-token', { waitUntil: 'networkidle' });
  await page.waitForSelector('.ps-by-invoice', { timeout: 15000 });
  await page.screenshot({ path: `${SP}/statement-${name}.png`, fullPage: true });
  // فحص التمرير الأفقي
  const overflow = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    dir: document.querySelector('.public-statement')?.getAttribute('dir'),
    closing: document.querySelector('.ps-closing-row')?.textContent?.trim(),
    rows: document.querySelectorAll('.ps-by-invoice .ps-inv-row').length,
    settles: document.querySelectorAll('.ps-by-invoice .ps-settle-row').length,
  }));
  console.log(name, JSON.stringify(overflow), 'errors=', errors.length ? errors.slice(0,3) : 'none');
  await ctx.close();
}
await browser.close();
