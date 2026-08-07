/**
 * أداةُ التصغير والتكبير — مقيسةٌ في متصفّحٍ حقيقيّ لا محسوبةً بالورق.
 *
 * ## ولمَ متصفّحٌ خاصّة
 * `documentFrameFit` مفحوصٌ بالوحدة: `fitRatio` تحسب، والقالبُ يعلن نفسه،
 * والصفحتان تستدعيانه. لكنّ ذلك كلَّه يقول **إنّ الحساب صحيح** — ولا يقول إنّ
 * الورقةَ دخلت الإطار. وبين الاثنين خاصّيةُ CSS اسمها zoom، وسلوكُها في
 * القياس مخالفٌ لما يُظنّ:
 *
 *   • `getBoundingClientRect` تُعيد المقاسَ **بعد** التصغير.
 *   • و`offsetWidth` تُعيده **قبله**.
 *
 * فلو قِيست الورقةُ وهي مصغَّرةٌ أصلاً لخرجت النسبةُ مضروبةً في نفسها، ولضاقت
 * الورقةُ في كل قياسٍ حتى تختفي. ولهذا يُصفَّر التصغيرُ قبل القياس — وهذا
 * الملفُّ يُثبت أنّ التصفيرَ يعمل، بأن يقيس مرّتين ويقارن.
 *
 * ## والمقياسُ سلوكيّ
 * لا يُقرأ متغيّرُ CSS ويُقارن برقم: تُقاس **الورقةُ المرسومة** في الإطار،
 * ويُسأل: أدخلت؟ وهل بقي في المستند عرضٌ لا يُبلغ؟
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "../src/utils/printTemplate";
import { fitRatio, clampUserScale, SCALE_STEP, MAX_USER_SCALE, MIN_USER_SCALE } from "../src/utils/documentFrameFit";

const OUT = "/tmp/claude-0/-home-user-albatoolstore/9ef278ee-5271-51c8-b864-b238ced58b95/scratchpad/html";

const COMPANY = {
  company_name: "شركة البتول لاسبيرات المواتر والتكاتك",
  phone: "0909605576", address: "عطبرة", manager_name: "مينا جابر",
} as any;

function sheet(n = 12) {
  return generatePrintHTML({
    type: "invoice", number: "INV-9", date: "2026-08-07",
    customer: { name: "ابرام جرجس الحاج يوسف", phone: "0912345678" },
    items: Array.from({ length: n }, (_, i) => ({
      product_name: `لستك 16*350 خلفي البتول ${i + 1}`,
      quantity: 10, unit_price: 84000, tax_amount: 0, discount: 0, total: 840000,
    })),
    subtotal: 840000 * n, taxTotal: 0, discountTotal: 0, grandTotal: 840000 * n,
    company: COMPANY, paidAmount: 0,
  } as any);
}

/**
 * مضيفٌ فيه إطارٌ بعرضٍ يُملى — كصفحة المعاينة وصفحة رابط العميل.
 *
 * والورقةُ تُحمَّل بـsrcdoc: مستندٌ من أصل المضيف نفسِه، فيُقرأ
 * `contentDocument` كما يقرؤه التطبيق.
 */
function hostPage(inner: string, legacy = false) {
  const doc = legacy
    ? `<!doctype html><html><head><style>body{margin:0}.page{width:794px;background:#eee}</style></head><body><div class="page">ورقةٌ قديمة</div></body></html>`
    : inner;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}
    #wrap{width:390px;overflow:hidden}
    iframe{width:100%;height:700px;border:0;display:block}
  </style></head><body>
  <div id="wrap"><iframe id="f" srcdoc="${doc.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe></div>
  </body></html>`;
}

/** ما يفعله الخطّاف بالضبط — منقولٌ سلوكاً لا نصّاً، فالنسبةُ تُحسب هنا. */
async function measureAndApply(page: any, userScale: number) {
  return page.evaluate((us: number) => {
    const f = document.getElementById("f") as HTMLIFrameElement;
    const doc = f.contentDocument!;
    const root = doc.documentElement;
    const isOurs = root.hasAttribute("data-lov-sheet");

    // ١) تصفيرُ التصغير قبل القياس
    root.style.setProperty("--lov-fit", "1");
    root.style.zoom = "";

    // ٢) قياسُ عرض المحتوى الفعليّ
    const pg = doc.querySelector(".page") as HTMLElement | null;
    const content = pg ? (pg.getBoundingClientRect().width || pg.scrollWidth) : root.scrollWidth;
    const frameWidth = f.clientWidth;
    return { content, frameWidth, isOurs, us };
  }, userScale);
}

async function applyScale(page: any, scale: number) {
  await page.evaluate((s: number) => {
    const f = document.getElementById("f") as HTMLIFrameElement;
    const root = f.contentDocument!.documentElement;
    if (root.hasAttribute("data-lov-sheet")) {
      root.style.setProperty("--lov-fit", String(s));
      root.style.zoom = "";
    } else {
      root.style.zoom = s === 1 ? "" : String(s);
    }
  }, scale);
}

/** الورقةُ كما تُرى الآن: عرضُها المرسوم، وما تجاوزت به المستند. */
async function seen(page: any) {
  return page.evaluate(() => {
    const f = document.getElementById("f") as HTMLIFrameElement;
    const doc = f.contentDocument!;
    const pg = doc.querySelector(".page") as HTMLElement;
    const r = pg.getBoundingClientRect();
    return {
      drawnWidth: r.width,          // بعد التصغير
      layoutWidth: pg.offsetWidth,  // قبله — ولهذا لا يُقاس به
      frameWidth: f.clientWidth,
      docScrollWidth: doc.documentElement.scrollWidth,
      docClientWidth: doc.documentElement.clientWidth,
      fontPx: parseFloat(getComputedStyle(doc.body).fontSize),
    };
  });
}

async function open(page: any, name: string, html: string, frameWidth = 390) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, html, "utf8");
  await page.setViewportSize({ width: Math.max(frameWidth + 40, 400), height: 900 });
  await page.goto("file://" + file, { waitUntil: "load" });
  await page.evaluate((w: number) => {
    (document.getElementById("wrap") as HTMLElement).style.width = w + "px";
  }, frameWidth);
  await page.waitForTimeout(400);
}

/* ═══════════ ١) الملاءمة: الورقةُ تدخل الإطار ═══════════ */

test("على الهاتف: الورقةُ كاملةٌ داخل الإطار بلا قصّ", async ({ page }) => {
  await open(page, "zoom-phone.html", hostPage(sheet()), 390);

  const m = await measureAndApply(page, 1);
  expect(m.isOurs, "الورقةُ غيرُ موسومة فلا يعرفها المضيف").toBe(true);
  // ورقةُ A4 أعرضُ من هاتفٍ بـ390 — وإلا فالفحصُ لا يفحص شيئاً
  expect(m.content).toBeGreaterThan(m.frameWidth);

  const fit = fitRatio(m.content, m.frameWidth);
  expect(fit).toBeLessThan(1);
  await applyScale(page, fit);

  const s = await seen(page);
  // الورقةُ المرسومةُ تدخل الإطار
  expect(s.drawnWidth).toBeLessThanOrEqual(s.frameWidth + 1);
  // ولا يبقى في المستند عرضٌ لا يُرى
  expect(s.docScrollWidth).toBeLessThanOrEqual(s.docClientWidth + 1);
  // والتخطيطُ الداخليّ لم يتغيّر: الورقةُ ما زالت A4 — صُغّر المرسومُ لا المقاس
  expect(s.layoutWidth).toBeGreaterThan(s.frameWidth);
});

/**
 * القياسُ يُصفَّر قبله. فلو قِيس مرّتين متتاليتين خرج الرقمُ نفسُه — ولو لم
 * يُصفَّر لخرجت الثانيةُ أصغر، ولتراكمت حتى تختفي الورقة.
 */
test("والقياسُ لا يتراكم: عشرُ إعاداتٍ تُبقيه كما هو", async ({ page }) => {
  await open(page, "zoom-repeat.html", hostPage(sheet()), 390);

  const widths: number[] = [];
  for (let i = 0; i < 10; i++) {
    const m = await measureAndApply(page, 1);
    const fit = fitRatio(m.content, m.frameWidth);
    await applyScale(page, fit);
    widths.push((await seen(page)).drawnWidth);
  }
  const first = widths[0];
  for (const w of widths) expect(Math.abs(w - first)).toBeLessThan(1);
  expect(first).toBeGreaterThan(300);   // ولم تنكمش إلى لا شيء
});

/* ═══════════ ٢) التكبير: يكبر فعلاً، ويبقى بالغاً ═══════════ */

test("«+» يكبّر الورقة، وما خرج عن الإطار يبقى قابلاً للتمرير", async ({ page }) => {
  await open(page, "zoom-in.html", hostPage(sheet()), 390);

  const m = await measureAndApply(page, 1);
  const fit = fitRatio(m.content, m.frameWidth);

  await applyScale(page, fit);
  const atFit = await seen(page);

  // ضغطتان على «+»
  const us = clampUserScale(clampUserScale(1 + SCALE_STEP) + SCALE_STEP);
  expect(us).toBeCloseTo(1.5, 5);
  await applyScale(page, us * fit);
  const zoomed = await seen(page);

  // كبُرت بنسبةِ ما ضُغط
  expect(zoomed.drawnWidth / atFit.drawnWidth).toBeCloseTo(1.5, 1);
  // والخطُّ كبُر معها — وهذا مقصودُ «أكبر لأرى أوضح»
  expect(zoomed.drawnWidth).toBeGreaterThan(zoomed.frameWidth);
  // وما تجاوز الإطارَ يُبلَغ بالتمرير لا يُقصّ
  expect(zoomed.docScrollWidth).toBeGreaterThan(zoomed.docClientWidth);
});

test("«−» يصغّر، و«ملاءمة» يعيدها إلى الورقة كاملة", async ({ page }) => {
  await open(page, "zoom-out.html", hostPage(sheet()), 390);

  const m = await measureAndApply(page, 1);
  const fit = fitRatio(m.content, m.frameWidth);
  await applyScale(page, fit);
  const base = (await seen(page)).drawnWidth;

  await applyScale(page, clampUserScale(1 - SCALE_STEP) * fit);
  const smaller = (await seen(page)).drawnWidth;
  expect(smaller).toBeLessThan(base);

  // «ملاءمة» — العودةُ إلى 1
  await applyScale(page, fit);
  expect(Math.abs((await seen(page)).drawnWidth - base)).toBeLessThan(1);
});

test("والحدّان محترمان في المرسوم لا في الحساب وحده", async ({ page }) => {
  await open(page, "zoom-clamp.html", hostPage(sheet()), 390);

  const m = await measureAndApply(page, 1);
  const fit = fitRatio(m.content, m.frameWidth);
  await applyScale(page, fit);
  const base = (await seen(page)).drawnWidth;

  // عشرُ ضغطاتٍ على «+» لا تتجاوز الحدّ الأعلى
  let s = 1;
  for (let i = 0; i < 10; i++) s = clampUserScale(s + SCALE_STEP);
  expect(s).toBe(MAX_USER_SCALE);
  await applyScale(page, s * fit);
  expect((await seen(page)).drawnWidth / base).toBeCloseTo(MAX_USER_SCALE, 1);

  // وعشرٌ على «−» لا تنزل تحت الأدنى — فلا تختفي الورقة
  s = 1;
  for (let i = 0; i < 10; i++) s = clampUserScale(s - SCALE_STEP);
  expect(s).toBe(MIN_USER_SCALE);
  await applyScale(page, s * fit);
  const low = await seen(page);
  expect(low.drawnWidth / base).toBeCloseTo(MIN_USER_SCALE, 1);
  expect(low.drawnWidth).toBeGreaterThan(100);   // ما زالت ورقةً تُرى
});

/* ═══════════ ٣) على الحاسوب لا ملاءمةَ أصلاً ═══════════ */

test("إطارٌ واسع: لا تُكبَّر الورقةُ فوق مقاسها وتُخفى الأزرار", async ({ page }) => {
  await open(page, "zoom-desktop.html", hostPage(sheet()), 1100);

  const m = await measureAndApply(page, 1);
  const fit = fitRatio(m.content, m.frameWidth);
  expect(fit).toBe(1);            // needsFit = false ⇒ الأزرارُ مخفيّة

  await applyScale(page, 1);
  const s = await seen(page);
  expect(Math.abs(s.drawnWidth - s.layoutWidth)).toBeLessThan(1);   // بلا تصغير
});

/* ═══════════ ٤) ورقةُ دالّة الحافة القديمة ═══════════ */

/**
 * الرابطُ القديم يعرض ورقةً ليست من قالبنا — لا وسمَ فيها. فالمضيفُ يصغّرها
 * على `<html>` مباشرةً. وهذا هو العطلُ الأصلُ الذي بلّغ عنه صاحبُ المستودع:
 * «رابط العميل يُظهر ثلثها مقصوصاً».
 */
test("ورقةٌ بلا وسم: تُصغَّر على html وتدخل الإطار كذلك", async ({ page }) => {
  await open(page, "zoom-legacy.html", hostPage("", true), 390);

  const m = await measureAndApply(page, 1);
  expect(m.isOurs).toBe(false);
  expect(m.content).toBeGreaterThan(m.frameWidth);

  const fit = fitRatio(m.content, m.frameWidth);
  await applyScale(page, fit);

  const s = await seen(page);
  expect(s.drawnWidth).toBeLessThanOrEqual(s.frameWidth + 1);
  expect(s.docScrollWidth).toBeLessThanOrEqual(s.docClientWidth + 1);
});
