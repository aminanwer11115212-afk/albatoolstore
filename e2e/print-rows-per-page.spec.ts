/**
 * حرّاسٌ بتصييرٍ حقيقي — ما لا يستطيعه jsdom.
 *
 * jsdom لا يخطّط: لا يعرف ارتفاع صفٍّ ولا موضع صندوق. فالأرقام التي في
 * `printDensity` (ROWS_PER_PAGE_TARGET، COMPACT_AT، ACCOUNT_ROW_H_PX) تبقى
 * دعاوى حتى تُقاس في متصفّح. وهنا تُقاس.
 *
 * ولا يحتاج خادماً ولا حساباً: الورقة تُبنى من `generatePrintHTML` وتُحقن
 * بـsetContent — كما تُبنى في كل مسارات المستند.
 *
 * ## المسارُ الأضيق هو المقياس
 * للورقة عرضان: الطباعة 190mm (‎@page A4 بهامش 10mm) والـPDF 194mm (هامش
 * 8mm). والأضيقُ يلفّ أسماءَ الأصناف أكثر فترتفع صفوفه — فمن مرّ منه مرّ من
 * الآخر. ولهذا يُقاس هنا بعرض الطباعة.
 */
import { test, expect } from "@playwright/test";
import { generatePrintHTML } from "../src/utils/printTemplate";
import { ROWS_PER_PAGE_TARGET, COMPACT_AT, ACCOUNT_ROW_H_PX } from "../src/utils/printDensity";

/*
 * `printExtras` لا يُستورد هنا: هو يستورد عميل Supabase، وعميلُه يقرأ
 * `import.meta.env` وقتَ التحميل — وهي غير معرَّفة في مصرِّف Playwright،
 * فيسقط الملفّ قبل أن يبدأ. ولا حاجة إليه أصلاً: موضوعُ هذا الملفّ ارتفاعُ
 * الجدول وموضعُ صندوق الحساب، لا صياغةُ أسطر التغليف — تلك يحرسها
 * `packagingShapeEverywhere.test.ts` بالمولّد الحقيقي.
 */
const pkgHtml = (n: number) =>
  `<div data-pkg-rows style="column-count:3;column-gap:26px;">` +
  Array.from({ length: n }, (_, i) =>
    `<div data-pkg-line style="padding:3px 6px;font-size:11px;">${i + 1} كرتونة صنف التغليف ${i + 1}</div>`,
  ).join("") +
  `</div>`;

const transportHtml =
  `<span class="tr-main">الاسم: شركة النقل السريع — الوجهة: بورتسودان</span><br>` +
  `<span class="tr-sub">الهاتف: 0911223344 . العنوان: السوق العربي</span>`;

const MM = 96 / 25.4;
/** عرضُ محتوى الطباعة وارتفاعُ صفحتها — من قاعدة ‎@page‎ في القالب. */
const PRINT_W = Math.round(190 * MM);
const PRINT_PAGE_H = Math.round(277 * MM);

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    product_name: `بلك 125 سي جي / عجل ${i + 1} — YAYE أصلي`,
    quantity: (i % 9) + 1,
    unit_price: 5000 + i * 125,
    tax_amount: 0,
    discount: 0,
    total: ((i % 9) + 1) * (5000 + i * 125),
  }));

function sheet(opts: { type?: "invoice" | "quote"; n: number; pkg?: number } ) {
  const list = items(opts.n);
  const total = list.reduce((s, r) => s + r.total, 0);
  return generatePrintHTML({
    type: opts.type || "invoice",
    number: "INV-89170",
    date: "2026-08-06",
    customer: { name: "ياسين بحري محمد", phone: "0912345678", address: "عطبرة - السوق" },
    items: list,
    subtotal: total,
    taxTotal: 0,
    discountTotal: 0,
    grandTotal: total,
    company: {
      company_name: "شركة البتول لإسبيرات المواتر والتكاتك",
      address: "عطبرة - السوق الكبير",
      phone: "0909605576",
    },
    packagingInfo: opts.pkg ? pkgHtml(opts.pkg) : undefined,
    transportInfo: transportHtml,
    previousDebt: 25600,
    previousCredit: 0,
    paidAmount: 120000,
  } as any);
}

/** يقيس أين ينتهي صفّ «جملة الفاتورة» بمقاييس الطباعة. */
async function measure(page: import("@playwright/test").Page, html: string) {
  await page.emulateMedia({ media: "print" });
  await page.setContent(html, { waitUntil: "networkidle" });
  return page.evaluate((w) => {
    const el = document.querySelector<HTMLElement>(".page")!;
    el.style.width = `${w}px`;
    el.style.maxWidth = `${w}px`;
    el.style.margin = "0";
    const top = el.getBoundingClientRect().top;
    const rows = Array.from(
      document.querySelectorAll("table[data-section='items'] tbody tr"),
    );
    // «الجملة» صارت شريطاً مضغوطاً تحت الجدول لا صفّاً فيه بخلايا فارغة
    const band = document.querySelector(".grand-band");
    return {
      rowCount: rows.length,
      totalBottom: band ? Math.round(band.getBoundingClientRect().bottom - top) : -1,
      rowHeight: rows.length > 1
        ? Math.round(((rows[rows.length - 1].getBoundingClientRect().bottom
            - rows[0].getBoundingClientRect().top) / rows.length) * 10) / 10
        : -1,
      density: el.className.trim(),
    };
  }, PRINT_W);
}

test.describe("الصفحة الأولى تحمل هدفها من البنود ومعها الجملة", () => {
  test(`${ROWS_PER_PAGE_TARGET} بنداً + «جملة الفاتورة» في الصفحة الأولى`, async ({ page }) => {
    const m = await measure(page, sheet({ n: ROWS_PER_PAGE_TARGET }));
    expect(m.rowCount).toBe(ROWS_PER_PAGE_TARGET);
    expect(m.density).toContain("d-compact");
    expect(m.totalBottom).toBeGreaterThan(0);
    expect(m.totalBottom).toBeLessThanOrEqual(PRINT_PAGE_H);
  });

  test("وعرضُ السعر مثلها — نفس القالب ونفس الحدود", async ({ page }) => {
    const m = await measure(page, sheet({ type: "quote", n: ROWS_PER_PAGE_TARGET }));
    expect(m.totalBottom).toBeLessThanOrEqual(PRINT_PAGE_H);
  });

  test("وبنودُ تغليفٍ كثيرة لا تُنزل الجملة — التغليفُ تحت الجدول لا فيه", async ({ page }) => {
    const m = await measure(page, sheet({ n: ROWS_PER_PAGE_TARGET, pkg: 30 }));
    expect(m.totalBottom).toBeLessThanOrEqual(PRINT_PAGE_H);
  });

  /**
   * الحدُّ بين العادية والمضغوطة يُقاس لا يُقدَّر: آخرُ فاتورةٍ عادية يجب أن
   * تسع جملتَها. وكان الحدُّ 25 ثم 20 فسقطت هذه — الأصغرُ أسوأ من الأكبر.
   */
  test(`آخرُ فاتورةٍ عادية (${COMPACT_AT} بنداً) تسع جملتَها`, async ({ page }) => {
    const m = await measure(page, sheet({ n: COMPACT_AT }));
    expect(m.density).not.toContain("d-compact");
    expect(m.totalBottom).toBeLessThanOrEqual(PRINT_PAGE_H);
  });

  test("وأوّلُ فاتورةٍ مضغوطة كذلك — لا فجوةَ عند الحدّ", async ({ page }) => {
    const m = await measure(page, sheet({ n: COMPACT_AT + 1 }));
    expect(m.density).toContain("d-compact");
    expect(m.totalBottom).toBeLessThanOrEqual(PRINT_PAGE_H);
  });

  /**
   * ## والحدُّ مشدودٌ إلى القياس لا مكتوبٌ فوقه
   *
   * ما دون الحدّ يجب أن **يفيض** لو زِيد بندٌ واحد وبقي عادياً — وإلا فالحدُّ
   * أقلُّ مما تحتمله الورقة، وتُضغط فواتيرُ لا تحتاج ضغطاً. وهذا ما وقع حين
   * قصُرت الصفوف وبقي الحدُّ على 19: صارت الورقةُ تحمل 27 ويُضغط ما فوق 19.
   */
  test("وبندٌ واحدٌ فوق الحدّ يفيض عن الصفحة لو بقي عادياً", async ({ page }) => {
    await page.setContent(sheet({ n: COMPACT_AT + 1 }), { waitUntil: "networkidle" });
    const bottom = await page.evaluate((w) => {
      const el = document.querySelector<HTMLElement>(".page")!;
      el.style.width = `${w}px`; el.style.maxWidth = `${w}px`; el.style.margin = "0";
      el.classList.remove("d-compact", "d-dense");   // نُلغي الضغط عمداً
      const top = el.getBoundingClientRect().top;
      const band = document.querySelector(".grand-band")!;
      return Math.round(band.getBoundingClientRect().bottom - top);
    }, PRINT_W);
    expect(bottom).toBeGreaterThan(PRINT_PAGE_H);
  });

  /**
   * ## والصفُّ أقصرُ مما كان — «صغّر الأسطر عشان تشيل أصناف أكتر»
   *
   * كان نحو 37.5px بحشوٍ 7px، فصار نحو 30.5 بحشوٍ 3.5. والرقمُ هنا سقفٌ لا
   * مطابقة: من أعاد الحشوَ إلى ما كان سقط الفحص، ومن قصّره أكثر مرّ — ما دام
   * الخطُّ فوق أرضية القراءة، وذلك محروسٌ في وحدة الكثافة.
   */
  test("وصفُّ الجدول العاديّ لا يعود إلى ارتفاعه القديم", async ({ page }) => {
    const m = await measure(page, sheet({ n: 10 }));
    expect(m.density).not.toContain("d-compact");
    expect(m.rowHeight).toBeGreaterThan(0);
    expect(m.rowHeight).toBeLessThanOrEqual(32);
  });
});

test.describe("مربّعُ الحساب لا يتحرّك بإخفاء شيء", () => {
  test("لا يميناً بإخفاء الترحيل، ولا علوّاً بإخفاء صفٍّ منه", async ({ page }) => {
    await page.setContent(sheet({ n: 30, pkg: 6 }), { waitUntil: "networkidle" });

    const probe = (hide: string | null) =>
      page.evaluate((sel) => {
        document.querySelectorAll<HTMLElement>("[data-hide-probe]").forEach((n) => {
          n.style.display = "";
          n.removeAttribute("data-hide-probe");
        });
        if (sel) {
          document.querySelectorAll<HTMLElement>(sel).forEach((n) => {
            n.style.display = "none";
            n.setAttribute("data-hide-probe", "1");
          });
        }
        const p = document.querySelector(".page")!.getBoundingClientRect();
        const a = document.querySelector(".account-box")!.getBoundingClientRect();
        const pkg = document.querySelector(".extra-row--pkg");
        return {
          fromLeft: Math.round(a.left - p.left),
          width: Math.round(a.width),
          height: Math.round(a.height),
          pkgTop: pkg ? Math.round(pkg.getBoundingClientRect().top - p.top) : -1,
        };
      }, hide);

    const base = await probe(null);
    // خمسةُ صفوف محجوزة بارتفاعٍ معلوم — لا تقديرَ في الرقم
    expect(base.height).toBe(5 * ACCOUNT_ROW_H_PX);

    for (const sel of [
      '[data-section="transport"]',
      '[data-section="prev-account-row"]',
      '[data-section="paid-amount"]',
      '[data-section="transport"],[data-section="paid-amount"],[data-section="prev-account-row"]',
    ]) {
      expect(await probe(sel), `بإخفاء ${sel}`).toEqual(base);
    }
  });

  /**
   * الحجزُ عددُ صفوفٍ × ارتفاعِ صفّ — صحيحٌ ما دام الصفُّ سطراً واحداً.
   * وبعرضٍ ثابت التفّ الرقمُ عند تسعة أرقام (مئاتِ الملايين) فتجاوز الصندوقُ
   * حجزَه: 125 ← 134. فيتّسع بالرقم بدل أن يلتفّ به.
   */
  test("والحجزُ يصمد للمبالغ الكبيرة — لا يلتفّ رقمٌ فيرفع الصندوق", async ({ page }) => {
    for (const amount of [377_860, 96_812_500, 968_125_000, 9_681_250_000, 987_654_321_987]) {
      const list = [{ product_name: "صنف", quantity: 1, unit_price: amount, tax_amount: 0, discount: 0, total: amount }];
      const html = generatePrintHTML({
        type: "invoice", number: "INV-1", date: "2026-08-06",
        customer: { name: "عميل" }, items: list,
        subtotal: amount, taxTotal: 0, discountTotal: 0, grandTotal: amount,
        company: null, transportInfo: transportHtml,
        previousDebt: amount, previousCredit: 0, paidAmount: Math.floor(amount / 3),
      } as any);
      await page.setContent(html, { waitUntil: "networkidle" });

      const m = await page.evaluate(() => {
        const p = document.querySelector(".page")!.getBoundingClientRect();
        const box = document.querySelector(".account-box")!;
        const b = box.getBoundingClientRect();
        return {
          rows: box.querySelectorAll("tbody tr").length,
          reserved: parseFloat(getComputedStyle(box as HTMLElement).minHeight),
          actual: Math.round(b.height),
          // ولا يفيض عن الورقة مهما اتّسع
          overflows: Math.round(b.left) < Math.round(p.left),
        };
      });

      expect(m.actual, `بمبلغ ${amount}`).toBe(m.reserved);
      expect(m.actual, `بمبلغ ${amount}`).toBe(m.rows * ACCOUNT_ROW_H_PX);
      expect(m.overflows, `بمبلغ ${amount}`).toBe(false);
    }
  });
});

/* ─────────── المعاينة تُقسَّم صفحاتٍ مرقّمة ─────────── */

/**
 * «إذا زاد عن الـA4 تُقسم، وأضِف ترقيم صفحات — 1 من 3 وهكذا».
 *
 * والقياسُ هنا على حارسين لا على الشكل: **لا عنصرَ يعبر حدَّ صفحة**، و**لا
 * عنصرَ يقع تحت شريط الترقيم**. أوّلُهما يمنع بنداً منشطراً، وثانيهما يمنع
 * رقماً مكتوباً فوق بند.
 */
test.describe("المعاينة تُقسَّم صفحاتٍ مرقّمة", () => {
  const CONTENT_MM = 277;
  const FOOT = 22;
  const TOL = 1.5;

  async function paginate(page: import("@playwright/test").Page, html: string) {
    await page.emulateMedia({ media: "screen" });
    await page.setContent(
      `<!doctype html><body style="margin:0"><iframe id="f" style="width:1000px;height:100vh;border:0"></iframe></body>`,
    );
    await page.evaluate((h) => {
      (document.getElementById("f") as HTMLIFrameElement).srcdoc = h;
    }, html);
    await page.waitForTimeout(700);
    return page.evaluate(
      ({ mm, foot, tol }) => {
        const d = (document.getElementById("f") as HTMLIFrameElement).contentDocument!;
        const el = d.querySelector<HTMLElement>(".page")!;
        const cs = getComputedStyle(el);
        const padTop = parseFloat(cs.paddingTop);
        const probe = d.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;height:${mm}mm`;
        el.appendChild(probe);
        const ph = probe.getBoundingClientRect().height;
        probe.remove();
        const top0 = el.getBoundingClientRect().top + padTop;
        const foots = Array.from(d.querySelectorAll(".lov-pgfoot")).map((n) => n.textContent || "");
        let cross = 0;
        let under = 0;
        for (const n of Array.from(
          d.querySelectorAll("tr, .extra-box, .account-box, .signatures, [data-pkg-line], .notes-section"),
        )) {
          if (n.classList.contains("lov-pgbreak")) continue;
          if (n.closest(".account-box") && !n.classList.contains("account-box")) continue;
          const r = n.getBoundingClientRect();
          const t = r.top - top0;
          const b = r.bottom - top0;
          if (b - t >= ph - foot) continue; // أطولُ من صفحة: يُشطر حتماً
          if (Math.floor((b - tol) / ph) > Math.floor((t + tol) / ph)) cross++;
          for (let k = 1; k * ph <= b + foot; k++) {
            if (b > k * ph - foot + tol && t < k * ph - tol) under++;
          }
        }
        return { foots, cross, under };
      },
      { mm: CONTENT_MM, foot: FOOT, tol: TOL },
    );
  }

  test("فاتورةٌ تفيض عن ورقةٍ تُرقَّم «1 من 2» ثمّ «2 من 2»", async ({ page }) => {
    const m = await paginate(page, sheet({ n: 30, pkg: 6 }));
    expect(m.foots.length).toBeGreaterThanOrEqual(2);
    expect(m.foots[0]).toBe(`1 من ${m.foots.length}`);
    expect(m.foots.at(-1)).toBe(`${m.foots.length} من ${m.foots.length}`);
  });

  test("وثلاثُ صفحاتٍ تُرقَّم إلى «3 من 3»", async ({ page }) => {
    const m = await paginate(page, sheet({ n: 60, pkg: 12 }));
    expect(m.foots.length).toBeGreaterThanOrEqual(3);
    expect(m.foots).toEqual(m.foots.map((_, i) => `${i + 1} من ${m.foots.length}`));
  });

  test("ولا بندَ يعبر حدَّ صفحة، ولا بندَ تحت الترقيم", async ({ page }) => {
    for (const opts of [{ n: 30 }, { n: 30, pkg: 30 }, { n: 60, pkg: 12 }, { n: 100, pkg: 40 }]) {
      const m = await paginate(page, sheet(opts));
      expect(m.cross, `عابرٌ في ${JSON.stringify(opts)}`).toBe(0);
      expect(m.under, `تحت الترقيم في ${JSON.stringify(opts)}`).toBe(0);
    }
  });

  test("وصفحةٌ واحدة بلا ترقيم — الرقمُ يفيد حين تتعدّد", async ({ page }) => {
    const m = await paginate(page, sheet({ n: 8 }));
    expect(m.foots).toEqual([]);
  });
});

/* ─────────── الشكل واحدٌ في كل مخرج — بالتصيير لا بالنصّ ─────────── */

/**
 * «تحقّق من هذا الشكل في جميع مكان إنشاء ومعاينة وطباعة وتعديل وPDF».
 *
 * والفحصُ هنا **هندسيّ**: يقيس موضعَ اسم العميل من حافّة اليمين، وانحرافَ
 * العنوان عن منتصف الورقة، وموضعَ التاريخ من حافّة اليسار، ومقاسَ الخطّ —
 * في أنواع المستندات كلِّها. فاختلافُ مخرجٍ واحدٍ يظهر رقماً لا انطباعاً.
 *
 * ويكمّله `src/test/docHeadEverywhere.test.ts` على البنية، وهذا على المقاس.
 */
test.describe("شريطُ الترويسة هندسةٌ واحدة في المستندات كلّها", () => {
  const DOCS: Array<[string, Record<string, unknown>]> = [
    ["فاتورة", { type: "invoice" }],
    ["فاتورة كاش", { type: "invoice", isCash: true }],
    ["عرض سعر", { type: "quote" }],
    ["أمر شراء", { type: "purchase" }],
    ["مرتجع", { type: "return" }],
    ["كشف جرد", { type: "invoice", variant: "stocktake" }],
    ["منتجات بلا أسعار", { type: "invoice", variant: "no-account" }],
  ];

  test("العميل يميناً، والعنوان في المنتصف، والتاريخ يساراً — بنفس المقاس", async ({ page }) => {
    const seen: Array<[string, string]> = [];

    for (const [name, extra] of DOCS) {
      const list = items(8);
      const total = list.reduce((s, r) => s + r.total, 0);
      const html = generatePrintHTML({
        number: "INV-89170", date: "2026-08-06",
        customer: { name: "امين انور" },
        items: list, subtotal: total, taxTotal: 0, discountTotal: 0, grandTotal: total,
        company: null, transportInfo: transportHtml,
        ...extra,
      } as any);

      await page.emulateMedia({ media: "screen" });
      await page.setContent(html, { waitUntil: "networkidle" });

      const geom = await page.evaluate(() => {
        const pg = document.querySelector(".page")!.getBoundingClientRect();
        const right = document.querySelector(".doc-head-right")!.getBoundingClientRect();
        const title = document.querySelector(".doc-title")!.getBoundingClientRect();
        const left = document.querySelector(".doc-head-left")!.getBoundingClientRect();
        const line = document.querySelector(".info-line") as HTMLElement;
        return [
          Math.round(pg.right - right.right),                                  // العميل من اليمين
          Math.round((title.left + title.right) / 2 - (pg.left + pg.right) / 2), // انحرافُ العنوان
          Math.round(left.left - pg.left),                                     // التاريخ من اليسار
          getComputedStyle(line).fontSize,
        ].join("|");
      });
      seen.push([name, geom]);
    }

    // العنوانُ في المنتصف الحقيقي: انحرافُه صفر
    for (const [name, g] of seen) {
      expect(g.split("|")[1], `${name}: انحرافُ العنوان عن المنتصف`).toBe("0");
      expect(g.split("|")[3], `${name}: مقاسُ خطّ التفاصيل`).toBe("15px");
    }
    // وهندسةُ الشريط واحدةٌ في الجميع
    const distinct = new Set(seen.map(([, g]) => g));
    expect(Array.from(distinct), seen.map(([n, g]) => `${n}=${g}`).join(" · ")).toHaveLength(1);
  });
});

/**
 * ## والترقيمُ يصمد للتصغير
 *
 * المعاينةُ على الهاتف مصغَّرةٌ بـzoom (ملاءمة 46%). صوّره صاحبُ المستودع:
 * عددُ الصفحات ثلاثٌ وهي اثنتان، وشرائطُ الترقيم فوق البنود.
 *
 * فالحكمُ هنا: **نفسُ عدد الصفحات ونفسُ الحرّاس** مصغَّرةً وغيرَ مصغَّرة.
 */
test.describe("الترقيمُ لا يتأثّر بتصغير الملاءمة", () => {
  async function paginateAt(page: import("@playwright/test").Page, html: string, fit: number) {
    await page.emulateMedia({ media: "screen" });
    await page.setContent(
      `<!doctype html><body style="margin:0"><iframe id="f" style="width:412px;height:100vh;border:0"></iframe></body>`,
    );
    await page.evaluate(
      ({ h, f }) => {
        const fr = document.getElementById("f") as HTMLIFrameElement;
        fr.srcdoc = h;
        fr.addEventListener("load", () => {
          fr.contentDocument!.documentElement.style.setProperty("--lov-fit", String(f));
        }, { once: true });
      },
      { h: html, f: fit },
    );
    await page.waitForTimeout(1000);
    return page.evaluate(() => {
      const TOL = 1.5, FOOT = 22;
      const d = (document.getElementById("f") as HTMLIFrameElement).contentDocument!;
      const pg = d.querySelector<HTMLElement>(".page")!;
      const padTop = parseFloat(d.defaultView!.getComputedStyle(pg).paddingTop);
      const probe = d.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;height:277mm";
      pg.appendChild(probe);
      const ph = probe.offsetHeight;
      const zoom = probe.getBoundingClientRect().height / ph;
      probe.remove();
      const top0 = pg.getBoundingClientRect().top + padTop * zoom;
      let cross = 0, under = 0;
      for (const el of Array.from(
        d.querySelectorAll("tr, .extra-box, .account-box, .signatures, [data-pkg-line], .notes-section"),
      )) {
        if (el.classList.contains("lov-pgbreak")) continue;
        if (el.closest(".account-box") && !el.classList.contains("account-box")) continue;
        const r = el.getBoundingClientRect();
        const t = (r.top - top0) / zoom;
        const b = (r.bottom - top0) / zoom;
        if (b - t >= ph - FOOT) continue;
        if (Math.floor((b - TOL) / ph) > Math.floor((t + TOL) / ph)) cross++;
        for (let k = 1; k * ph <= b + FOOT; k++) {
          if (b > k * ph - FOOT + TOL && t < k * ph - TOL) under++;
        }
      }
      return {
        foots: Array.from(d.querySelectorAll(".lov-pgfoot")).map((n) => n.textContent || ""),
        cross, under, zoom: Math.round(zoom * 100) / 100,
      };
    });
  }

  for (const [name, opts] of [["30 بنداً", { n: 30, pkg: 8 }], ["60 بنداً", { n: 60, pkg: 12 }]] as const) {
    test(`${name}: نفسُ الصفحات مصغَّرةً وغيرَ مصغَّرة`, async ({ page }) => {
      const html = sheet(opts as any);
      const full = await paginateAt(page, html, 1);
      const fit = await paginateAt(page, html, 0.46);

      expect(fit.zoom, "التصغيرُ لم يُطبَّق فالفحصُ لا يقيس شيئاً").toBeLessThan(0.6);
      expect(fit.foots, "عددُ الصفحات تغيّر بالتصغير").toEqual(full.foots);
      for (const m of [full, fit]) {
        expect(m.cross, `${name} عند ${m.zoom}: بندٌ يعبر الحدّ`).toBe(0);
        expect(m.under, `${name} عند ${m.zoom}: بندٌ تحت الترقيم`).toBe(0);
      }
    });
  }
});
