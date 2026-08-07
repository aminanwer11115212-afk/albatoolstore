/**
 * أزرارُ الشريط في المعاينة: «⬇️ تحميل PDF» و«📱 واتساب PDF».
 *
 * ## ولمَ لها ملفٌّ خاصّ
 * للـPDF مساران في هذا التطبيق، ولا يشبه أحدُهما الآخر:
 *
 *   ١. **زرُّ «إرسال PDF»** في شاشتَي الفاتورة والعرض — يمرّ بـ
 *      `shareDocumentPdf`، فيركّب الورقة في إطارٍ من **نصّها** بعد نزع
 *      السكربتات. فترقيمُ المعاينة لا يُنشأ أصلاً.
 *   ٢. **أزرارُ الشريط داخل المعاينة** — تصوّر **DOM الحيّ** بـhtml2pdf.
 *      وهذا الـDOM قد رُقّم فعلاً: فيه أشرطةُ «1 من 2» وفواصلُها.
 *
 * ## العطل الذي كُشف هنا
 * الترقيمُ مخفيٌّ في `@media print` — وهذا يكفي زرَّ الطباعة، ولا يكفي هذين:
 * المصوِّرُ يرسم بوسيط **screen**. فقِيس: ورقةُ أربعين بنداً تُصوَّر ومعها
 * شريطان وفاصلٌ بثلاثين بكسلاً. وأثرُه مضاعف: html2pdf يقسّم على A4 بحدوده
 * هو، فيقع «1 من 2» في وسط صفحةٍ لا في آخرها.
 *
 * ## والقياسُ بالزرّ نفسِه
 * لا بقراءة المصدر: يُضغط الزرُّ الحقيقي، ويُعترض ما يُسلَّم إلى html2pdf،
 * فيُعدّ ما فيه. فلو عاد الترقيمُ يوماً ظهر في المعترَض.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML, buildPrintWindowHtml } from "../src/utils/printTemplate";

const COMPANY = {
  company_name: "شركة البتول لاسبيرات المواتر والتكاتك",
  phone: "0909605576", address: "عطبرة", manager_name: "مينا جابر",
  invoice_notes: "شكراً لتعاملكم مع شركة البتول",
} as any;

const OUT = "/tmp/claude-0/-home-user-albatoolstore/9ef278ee-5271-51c8-b864-b238ced58b95/scratchpad/html";

/** ورقةٌ تتجاوز صفحةً واحدة — وإلا لم يُنشأ ترقيمٌ أصلاً فلا يفحص الفحصُ شيئاً. */
function host(type: "invoice" | "quote", n = 40) {
  const items = Array.from({ length: n }, (_, i) => ({
    product_name: `لستك 16*350 خلفي البتول ${i + 1}`,
    quantity: 10, unit_price: 84000, tax_amount: 0, discount: 0, total: 840000,
  }));
  const total = 840000 * n;
  const sheet = generatePrintHTML({
    type, number: type === "invoice" ? "INV-1" : "QT-1", date: "2026-08-01",
    customer: { name: "ابرام جرجس الحاج يوسف", phone: "0912345678" },
    items, subtotal: total, taxTotal: 0, discountTotal: 0, grandTotal: total,
    company: COMPANY, paidAmount: 0,
  } as any);
  return buildPrintWindowHtml(sheet, true);
}

/**
 * تُحمَّل الصفحةُ من ملفّ لا بـsetContent (كي تعمل سكربتاتُها)، وتُحقن مكتبةُ
 * html2pdf بعد التحميل: حزمتُها المصغَّرة تحوي تتابعَ إغلاقِ وسمٍ فينتهي
 * السكربتُ السطريّ عنده، والوكيلُ يحجب الـCDN على أي حال.
 */
async function openPreview(page: any, type: "invoice" | "quote") {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `toolbar-${type}.html`);
  fs.writeFileSync(file, host(type), "utf8");
  await page.setViewportSize({ width: 794, height: 1200 });
  await page.goto("file://" + file, { waitUntil: "load" });
  await page.addScriptTag({ path: "node_modules/html2pdf.js/dist/html2pdf.bundle.min.js" });
  await page.waitForFunction(() => !!(window as any).html2pdf, null, { timeout: 20000 });
  await page.waitForTimeout(900);   // سكربتُ الترقيم يعمل بعد load
}

/** يضغط زرّاً ويُعيد العنصرَ الذي سُلّم إلى html2pdf. */
async function captureVia(page: any, buttonId: string) {
  return page.evaluate(async (id: string) => {
    const live = {
      feet: document.querySelectorAll(".lov-pgfoot").length,
      breaks: document.querySelectorAll(".lov-pgbreak").length,
    };
    const h2p = (window as any).html2pdf;
    /* سلسلةُ html2pdf تُعيد كائناً جديداً من كل حلقة، فيُلفّ `from` أينما وقع. */
    const wrap = (obj: any): any => {
      if (!obj || typeof obj !== "object") return obj;
      if (typeof obj.from === "function" && !obj.__w) {
        const of = obj.from.bind(obj);
        obj.from = (el: any) => { (window as any).__cap = el; return wrap(of(el)); };
        obj.__w = true;
      }
      if (typeof obj.set === "function" && !obj.__sw) {
        const os = obj.set.bind(obj);
        obj.set = (o: any) => wrap(os(o));
        obj.__sw = true;
      }
      return obj;
    };
    (window as any).html2pdf = function () { return wrap(h2p.apply(this, arguments as any)); };
    // لا تنزيلَ فعليّاً ولا مشاركة — المقصودُ ما يُسلَّم للمصوِّر
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    (navigator as any).share = undefined;
    (document.getElementById(id) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 6000));
    HTMLAnchorElement.prototype.click = origClick;

    const el = (window as any).__cap as HTMLElement | undefined;
    return {
      live,
      captured: el ? {
        feet: el.querySelectorAll(".lov-pgfoot").length,
        breaks: el.querySelectorAll(".lov-pgbreak").length,
        toolbars: el.querySelectorAll("#__lov_print_toolbar").length,
        hasBand: el.querySelectorAll(".grand-band").length,
        hasThanks: el.querySelectorAll(".doc-thanks").length,
        hasMeta: el.querySelectorAll(".header-meta").length,
      } : null,
    };
  }, buttonId);
}

for (const type of ["invoice", "quote"] as const) {
  const label = type === "invoice" ? "الفاتورة" : "عرض السعر";

  test(`${label} — زرُّ «تحميل PDF» لا يصوّر ترقيمَ المعاينة`, async ({ page }) => {
    await openPreview(page, type);
    const r = await captureVia(page, "__btn_pdf");
    // المعاينةُ مرقَّمةٌ فعلاً — وإلا فالفحصُ لا يفحص شيئاً
    expect(r.live.feet).toBeGreaterThan(0);
    expect(r.live.breaks).toBeGreaterThan(0);
    // وما يذهب إلى المصوِّر خالٍ منها
    expect(r.captured).not.toBeNull();
    expect(r.captured!.feet).toBe(0);
    expect(r.captured!.breaks).toBe(0);
    expect(r.captured!.toolbars).toBe(0);      // ولا شريطَ أدوات
  });

  test(`${label} — زرُّ «واتساب PDF» كذلك`, async ({ page }) => {
    await openPreview(page, type);
    const r = await captureVia(page, "__btn_wa_pdf");
    expect(r.live.feet).toBeGreaterThan(0);
    expect(r.captured).not.toBeNull();
    expect(r.captured!.feet).toBe(0);
    expect(r.captured!.breaks).toBe(0);
  });

  /**
   * وما يذهب إلى المصوِّر يحمل شكلَ الورقة كاملاً — لا ورقةً مجرَّدة: الشريطُ
   * وعبارةُ الشكر وبياناتُ الشركة. فنزعُ الترقيم لا ينزع معه غيرَه.
   */
  test(`${label} — والشكلُ كامِلٌ فيما يُصوَّر`, async ({ page }) => {
    await openPreview(page, type);
    const r = await captureVia(page, "__btn_pdf");
    expect(r.captured!.hasBand).toBe(1);
    expect(r.captured!.hasThanks).toBe(1);
    expect(r.captured!.hasMeta).toBe(1);
  });
}
