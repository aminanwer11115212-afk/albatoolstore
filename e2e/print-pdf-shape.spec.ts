/**
 * شكلُ الورقة **في ملفّ العميل** — لا على الشاشة.
 *
 * ## لمَ ملفٌّ خاصّ بهذا
 * الورقة تُصوَّر بـhtml2canvas قبل أن تصير PDF، والمصوِّر **ليس متصفّحاً**:
 * يعيد بناء التخطيط بحسابه هو، فيسقط منه ما لا يعرفه. وقد سقط في هذا
 * المشروع ثلاث مرّات:
 *
 *   1. `column-count` — أعمدةُ التغليف خرجت عموداً واحداً.
 *   2. خلفيةُ السطر — طمست ما فاض من حروف السطر الذي قبله، فوصل العميلَ
 *      ملفٌّ نصفُ كلّ بندٍ فيه مقطوع.
 *   3. الفراغُ بين الرقم ووحدته — «78قطعة» ملتصقةً.
 *
 * وكلُّها **سليمةٌ على الشاشة**. فلا يكشفها فحصٌ يقرأ HTML ولا لقطةُ متصفّح
 * — يكشفها قياسُ البكسلات في ناتج المصوِّر نفسه، وهو ما هنا.
 *
 * ## والقياسُ بالألوان
 * لتمييز كتلتين متجاورتين من الحبر يُصبغ إحداهما بلونٍ فارق **قبل التصوير**
 * — واللونُ لا يغيّر تخطيطاً. فيُقاس ما بينهما بلا تخمينٍ في أيّ عمودٍ ينتهي
 * حرفٌ ويبدأ آخر.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { generatePrintHTML } from "../src/utils/printTemplate";

const H2C = fs.readFileSync(
  path.resolve("node_modules/html2canvas/dist/html2canvas.min.js"), "utf8",
);

const MM = 96 / 25.4;
/** عرضُ ورقة A4 كاملةً — كما تُصوَّر في مسار الـPDF. */
const SHEET_W = Math.round(210 * MM);

const COMPANY = {
  company_name: "شركة البتول لاسبيرات المواتر والتكاتك",
  phone: "0909605576", address: "عطبرة", manager_name: "مينا جابر",
  invoice_notes: "شكراً لتعاملكم مع شركة البتول",
} as any;

/*
 * أسطرُ التغليف تُبنى هنا نصّاً لا بـformatPackaging: ذلك المولّد يستورد عميل
 * Supabase، وعميلُه يقرأ import.meta.env وقتَ التحميل — وهي غير معرَّفة في
 * مصرِّف Playwright فيسقط الملفّ قبل أن يبدأ. وصياغةُ الأسطر يحرسها
 * `printSheetShape2026.test.ts` بالمولّد الحقيقي؛ وموضوعُ هذا الملفّ ما يفعله
 * المصوِّر بالتخطيط، فيكفيه نفسُ التخطيط.
 *
 * ولذلك يجب أن يبقى هذا النصُّ مطابقاً لما يبنيه `formatPackaging` — يحرس
 * التطابقَ الفحصُ الأخير في هذا الملفّ.
 */
const PKG_FOOT_STYLE =
  "margin-top:8px;padding:5px 10px;background:#f1eefb;border:1px solid #5b2c8e;"
  + "border-radius:5px;display:flex;justify-content:flex-start;align-items:baseline;"
  + "gap:6px;width:fit-content;max-width:100%;page-break-inside:avoid;break-inside:avoid;";

const PKG = '<div data-pkg-rows="3">'
  + ['1 كرتونة صغيرة باكم فرامل امامي 3 عجل هجام اصلي *50',
     '1 بطارية جي ان YAYE *8',
     '2 كرتونة صغيرة بطارية 125 سي جي / دايون صغير YAYE *10']
    .map((t) => `<div data-pkg-line style="font-size:12.5px;font-weight:700;line-height:1.6;padding:1px 0;">${t}</div>`)
    .join("")
  + `<div data-pkg-line style="${PKG_FOOT_STYLE}">`
  + '<span style="font-size:12px;font-weight:800;color:#5b2c8e;white-space:nowrap;">إجمالي عدد القطع :</span>'
  + '<span style="display:flex;gap:6px;align-items:baseline;font-size:15px;font-weight:900;'
  + 'color:#5b2c8e;letter-spacing:0.3px;"><span id="__num">78</span>'
  + '<span id="__unit">قطعة</span></span>'
  + "</div></div>";

function sheet(n = 9) {
  const items = Array.from({ length: n }, (_, i) => ({
    product_name: `لستك 16*350 خلفي البتول ${i + 1}`,
    quantity: 10, unit_price: 84000, tax_amount: 0, discount: 0, total: 840000,
  }));
  return generatePrintHTML({
    type: "invoice", number: "INV-88302", date: "2026-08-01",
    customer: { name: "ابرام جرجس الحاج يوسف", phone: "0912345678", address: "بحري" },
    items, subtotal: 840000 * n, taxTotal: 0, discountTotal: 0, grandTotal: 840000 * n,
    company: COMPANY, paidAmount: 2500000, previousDebt: 980000, previousCredit: 0,
    packagingInfo: PKG,
    transportInfo: '<span class="tr-main">الاسم: شرق النيل — الوجهة: بحري</span>',
  } as any);
}

async function mount(page: any) {
  await page.setViewportSize({ width: SHEET_W, height: 1400 });
  await page.setContent(sheet(), { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: ".page{zoom:1!important;box-shadow:none!important;margin:0!important}"
      + "body{background:#fff!important;padding:0!important}",
  });
  await page.addScriptTag({ content: H2C });
  await page.waitForTimeout(300);
}

test.describe("ما يصل العميل بعد التصوير", () => {
  /**
   * ## الرقمُ ووحدتُه لا يلتصقان في الملفّ
   *
   * المصوِّر يُسقط الفراغَ النصّيَّ بين الرقم ووحدته — ولا يُنجيه nbsp —
   * فيخرج «78قطعة» في ملفّ العميل وهو سليمٌ على الشاشة. فالفصلُ فجوةُ تخطيطٍ
   * في وعاءٍ مرن، وهذا الفحصُ يثبت أنّ المصوِّر يحترمها.
   *
   * ### والقياسُ فرقيٌّ لا مطلق
   * الفجوةُ المرسومة ليست 6px: أطرافُ الحروف (side bearings) تأكل منها،
   * فتُقرأ نحو 3px بحسب حيث يمرّ المسحُ الرأسيّ من الحروف. فعتبةٌ مطلقةٌ إمّا
   * فضفاضةٌ لا تكشف شيئاً أو ضيّقةٌ تسقط بتغيُّر خطٍّ لا بعطل.
   *
   * فيُقاس مرّتين — بالفجوة وبإلغائها — والفرقُ بينهما هو **الفجوةُ التي
   * وصلت الملفّ فعلاً**. وأطرافُ الحروف واحدةٌ في القياسين فتُلغي نفسَها.
   * فلو تجاهل المصوِّرُ الفجوةَ يوماً تساوى القياسان وسقط الفحص.
   */
  test("فجوةُ الرقم ووحدته تصل الملفّ — لا تسقط في التصوير", async ({ page }) => {
    await mount(page);
    const m = await page.evaluate(async () => {
      const RED = [225, 29, 72];
      // صبغُ الوحدة لتمييزها عن الرقم — واللونُ لا يمسّ التخطيط
      (document.getElementById("__unit") as HTMLElement).style.color = "rgb(225,29,72)";
      const wrap = document.getElementById("__num")!.parentElement as HTMLElement;
      /* يُصوَّر الشريطُ كلُّه لا الوعاءُ وحده: نطاقُ المسح الرأسيّ يُشتقّ من
         ارتفاع المصوَّر، وشريطُ العميل هو ما يهمّ. */
      const el = document.getElementById("__num")!.closest("[data-pkg-line]") as HTMLElement;

      async function inkGap(): Promise<number> {
        const canvas: HTMLCanvasElement = await (window as any).html2canvas(el, {
          scale: 8, backgroundColor: "#fff", logging: false,
        });
        const { width, height } = canvas;
        const px = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
        const isRed = (x: number, y: number) => {
          const i = (y * width + x) * 4;
          return Math.abs(px[i] - RED[0]) < 60 && Math.abs(px[i + 1] - RED[1]) < 60
            && Math.abs(px[i + 2] - RED[2]) < 60;
        };
        const isInk = (x: number, y: number) => {
          const i = (y * width + x) * 4;
          return px[i] < 200 || px[i + 1] < 200 || px[i + 2] < 200;
        };
        /*
         * الحدُّ العلويُّ والسفليُّ للشريط حبرٌ في **كل** عمود، فمسحُ العمود
         * كاملاً يقول إنّ الحبرَ متّصلٌ دائماً والفجوةَ صفر — وقع ذلك في أوّل
         * قياسٍ فبدا عطلٌ لا وجود له. فيُمسح شريطُ النصّ وحده.
         */
        const y0 = Math.floor(height * 0.3), y1 = Math.ceil(height * 0.72);
        const colHas = (x: number, f: (x: number, y: number) => boolean) => {
          for (let y = y0; y < y1; y++) if (f(x, y)) return true;
          return false;
        };
        // في RTL: الوحدةُ أقصى اليسار، ثمّ الرقم، ثمّ الوصف
        let redEnd = -1;
        for (let x = width - 1; x >= 0; x--) if (colHas(x, isRed)) { redEnd = x; break; }
        if (redEnd < 0) return -1;
        for (let x = redEnd + 1; x < width; x++) if (colHas(x, isInk)) return (x - redEnd) / 8;
        return -1;
      }

      const withGap = await inkGap();
      wrap.style.gap = "0px";                 // إلغاءُ الفجوة وحدها
      const withoutGap = await inkGap();
      wrap.style.gap = "6px";
      return { withGap, withoutGap };
    });
    /*
     * القياسُ الملحوظ: بالفجوة ≈ 3.1px وبإلغائها ≈ 0.1px — أي **ملتصقان**.
     * والفارقُ 3 لا 6 لأنّ حدودَ التنعيم (antialiasing) تُقرأ حبراً من
     * الطرفين فتأكل من المقيس؛ وهو ثابتٌ لا يضرّ ما دام الفحصُ فرقيّاً.
     */
    expect(m.withGap).toBeGreaterThan(0);
    // أوّلاً: القياسُ قادرٌ على كشف الالتصاق أصلاً — وإلا فهو فحصٌ لا يفحص
    expect(m.withoutGap).toBeLessThan(1);
    // ثمّ: الفجوةُ وصلت الملفّ. ولو تجاهلها المصوِّرُ يوماً تساوى القياسان
    expect(m.withGap - m.withoutGap).toBeGreaterThanOrEqual(2);
  });

  /**
   * ## والصناديقُ بقدر محتواها لا بعرض الورقة
   *
   * `width: fit-content` خاصّيةٌ حديثة، ولو لم يعرفها المصوِّرُ لرسم الشريطين
   * بعرض الصفحة — فيعود «المستطيل الطويل الفاضي» الذي طُلب إذهابُه، في ملفّ
   * العميل وحده بينما الشاشةُ سليمة.
   */
  test("شريطُ الجملة وشريطُ القطع يُرسمان بعرضهما لا بعرض الصفحة", async ({ page }) => {
    await mount(page);
    const m = await page.evaluate(async () => {
      const h2c = (window as any).html2canvas;
      const page_ = document.querySelector(".page") as HTMLElement;
      const canvas: HTMLCanvasElement = await h2c(page_, { scale: 2, backgroundColor: "#fff", logging: false });
      const { width, height } = canvas;
      const px = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      /* التفاوتُ ضيّقٌ عمداً: أرضيةُ شريط القطع على بُعد 14 وحدةً من الأبيض،
         فتفاوتٌ واسعٌ يلتقط بياضَ الورقة ويقول إنّ الشريط بعرض الصفحة. */
      const near = (i: number, t: number[]) =>
        Math.abs(px[i] - t[0]) < 6 && Math.abs(px[i + 1] - t[1]) < 6 && Math.abs(px[i + 2] - t[2]) < 6;
      /**
       * قياسان لا واحد — لكلٍّ ما يناسب شكلَه:
       *
       * • `widestRun` أطولُ تتابعٍ من اللون. يصلح لشريطٍ بأرضيةٍ واحدة
       *   (شريطُ القطع)، ولا يُخدع بحبرٍ متناثرٍ من التنعيم في مكانٍ آخر من
       *   السطر.
       * • `colorExtent` المسافةُ من أوّل لونٍ إلى آخره في السطر. يصلح لشريط
       *   الجملة: صار مربّعين بأرضيتين بينهما فاصلٌ فاتحٌ بعرض بكسل، فقياسُ
       *   التتابع يقف عند الفاصل ويقرأ نصفَه.
       *
       * وتبادلُهما يُفسد القياس: جُرّب الامتدادُ على شريط القطع فقرأ 666px
       * بدل 183 — التقط بكسلاتِ تنعيمٍ باهتةً عند طرفَي الصندوق.
       */
      const widestRun = (...ts: number[][]) => {
        let best = 0;
        for (let y = 0; y < height; y += 2) {
          let run = 0;
          for (let x = 0; x < width; x++) {
            if (ts.some((t) => near((y * width + x) * 4, t))) { run++; if (run > best) best = run; }
            else run = 0;
          }
        }
        return best / 2;
      };
      const colorExtent = (...ts: number[][]) => {
        let best = 0;
        for (let y = 0; y < height; y += 2) {
          let first = -1, last = -1;
          for (let x = 0; x < width; x++) {
            if (ts.some((t) => near((y * width + x) * 4, t))) { if (first < 0) first = x; last = x; }
          }
          if (first >= 0 && last - first + 1 > best) best = last - first + 1;
        }
        return best / 2;
      };
      const dom = (s: string) => Math.round(document.querySelector(s)!.getBoundingClientRect().width);
      return {
        bandDrawn: colorExtent([31, 45, 90], [22, 34, 74]), bandDom: dom(".grand-band"),
        footDrawn: widestRun([241, 238, 251]), footDom: dom('[data-pkg-line][style*="fit-content"]'),
        pageW: Math.round(page_.getBoundingClientRect().width),
      };
    });
    expect(Math.abs(m.bandDrawn - m.bandDom)).toBeLessThan(12);
    expect(Math.abs(m.footDrawn - m.footDom)).toBeLessThan(14);
    // ولا واحدٌ منهما بعرض الورقة — وهو ما كان يُشكى منه
    expect(m.bandDrawn).toBeLessThan(m.pageW * 0.6);
    expect(m.footDrawn).toBeLessThan(m.pageW * 0.6);
  });

  /**
   * ## وبياناتُ الشركة سطرٌ واحد في الملفّ
   *
   * الشريطُ مرنٌ بالتفافٍ مسموح (`flex-wrap`)، فلو حسب المصوِّرُ عروضَ الحروف
   * بغير ما يحسبها المتصفّح لالتفّ إلى سطرين أو ثلاثة — وهو ما طُلب إذهابُه.
   */
  test("بياناتُ الشركة سطرٌ واحد بعد التصوير، وعلاماتُها مرسومة", async ({ page }) => {
    await mount(page);
    const m = await page.evaluate(async () => {
      const h2c = (window as any).html2canvas;
      const el = document.querySelector(".header-meta") as HTMLElement;
      const canvas: HTMLCanvasElement = await h2c(el, { scale: 4, backgroundColor: "#fff", logging: false });
      const { width, height } = canvas;
      const px = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const dark = (x: number, y: number) => {
        const i = (y * width + x) * 4;
        return px[i] < 150 && px[i + 1] < 150 && px[i + 2] < 150;
      };
      let rows = 0, inRow = false;
      for (let y = 0; y < height; y++) {
        let has = false;
        for (let x = 0; x < width; x++) if (dark(x, y)) { has = true; break; }
        if (has && !inRow) { rows++; inRow = true; } else if (!has) inRow = false;
      }
      let ink = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (dark(x, y)) ink++;
      return { rows, ink };
    });
    expect(m.rows).toBe(1);
    // والعلاماتُ حبرٌ مرسوم لا مربّعاتٌ فارغة ولا لا شيء
    expect(m.ink).toBeGreaterThan(500);
  });

  /**
   * ## وشريطُ القطع هنا هو نفسُه الذي يبنيه المولّد
   *
   * هذا الملفّ يبني أسطرَ التغليف نصّاً (لتعذُّر استيراد المولّد في مصرِّف
   * Playwright)، فلو تغيّر المولّدُ ولم يتغيّر النصّ لصار الفحصُ يحرس شكلاً
   * لا يخرج للعميل. فيُقارَن الاثنان هنا حرفاً بحرف.
   */
  test("وتخطيطُ الشريط المفحوص هو تخطيطُ المولّد نفسِه", async () => {
    const src = fs.readFileSync(path.resolve("src/utils/printExtras.ts"), "utf8");
    /* لونُ المولّد متغيّرٌ مُقحَم (PKG_ACCENT) لا نصٌّ، فتُقارَن التصريحاتُ
       التي لا لونَ فيها — وهي التي يعتمد عليها التخطيط. */
    for (const decl of PKG_FOOT_STYLE.split(";").filter((d) => d && !d.includes("#"))) {
      expect(src, `المولّد لا يحمل: ${decl}`).toContain(decl);
    }
    // والوعاءُ المرن حول الرقم ووحدته هو ما يحفظ الفجوة — فلا يُحذف
    /* أوّلُ ورودٍ للاسم في تعليقٍ شارح لا في الوسم — فيُقصد الوسمُ نفسُه. */
    const foot = src.slice(src.indexOf(">إجمالي عدد القطع :<"));
    expect(foot.slice(0, 1600)).toContain("display:flex;gap:6px");
  });
});

/**
 * ## والأرضياتُ تُطبع — «الجملة في الطباعة لا تظهر»
 *
 * المتصفّحات تُسقط أرضياتِ الألوان عند الطباعة توفيراً للحبر. وشريطُ الجملة
 * خطُّه أبيضُ على أرضيةٍ داكنة، فتسقط الأرضيةُ ويبقى أبيضُ على أبيض — أي
 * لا شيء. صوّره صاحبُ المستودع من ورقةٍ مطبوعة.
 *
 * ويُقاس هنا في **وسط الطباعة نفسِه** (emulateMedia print) لا بقراءة CSS:
 * القاعدةُ قد تُكتب ولا تسري لخطأٍ في مداها.
 */
test.describe("الطباعة", () => {
  test("أرضياتُ الألوان تسري في وسط الطباعة", async ({ page }) => {
    await mount(page);
    await page.emulateMedia({ media: "print" });
    const m = await page.evaluate(() => {
      const band = document.querySelector(".grand-band") as HTMLElement;
      const th = document.querySelector("table.items-table thead th") as HTMLElement;
      const cs = getComputedStyle(band);
      const adjust = (el: Element) => {
        const s = getComputedStyle(el) as any;
        return s.printColorAdjust || s.webkitPrintColorAdjust || "";
      };
      return {
        bandBg: cs.backgroundColor, bandColor: cs.color,
        bandAdjust: adjust(band), thAdjust: adjust(th),
        thBg: getComputedStyle(th).backgroundColor,
        thColor: getComputedStyle(th).color,
        thBorderBottom: getComputedStyle(th).borderBottomWidth,
      };
    });
    // الأرضيةُ الداكنة والخطُّ الأبيض باقيان في وسط الطباعة
    expect(m.bandBg).toBe("rgb(31, 45, 90)");
    expect(m.bandColor).toBe("rgb(255, 255, 255)");
    // والمتصفّحُ مُلزَمٌ برسمهما
    expect(m.bandAdjust).toBe("exact");
    expect(m.thAdjust).toBe("exact");

    /*
     * وترويسةُ جدول البنود بيضاءُ الأرضية أسودُ الخطّ بطلب صاحب المستودع.
     *
     * وكانت هذه الترويسةُ **مِجَسَّ** هذا الفحص: يقرأ أرضيتَها البنفسجية
     * ليُثبت أنّ الأرضيات لا تسقط. ولمّا صارت بيضاء لم تعد تصلح مِجَسّاً —
     * الأبيضُ يُقرأ أبيض سواءٌ رُسم أو سقط. فالمِجَسُّ الآن شريطُ الجملة
     * وحده (أعلاه)، وتُقاس الترويسةُ لذاتها: أبيضُ وأسودُ وحدٌّ سفليٌّ غليظ
     * — وهو ما يفصلها عن البنود، خطٌّ لا لون.
     */
    expect(m.thBg).toBe("rgb(255, 255, 255)");
    expect(m.thColor).toBe("rgb(0, 0, 0)");
    expect(m.thBorderBottom).toBe("2px");
  });

  /** والشريطُ شمالَ الورقة كما طُلب — يُقاس بالموضع لا بالقاعدة. */
  test("وشريطُ الجملة شمالَ الورقة", async ({ page }) => {
    await mount(page);
    const m = await page.evaluate(() => {
      const band = document.querySelector(".grand-band")!.getBoundingClientRect();
      /* الحافّةُ المقصودة حافّةُ **المحتوى** لا صندوقُ الورقة: للورقة حشوٌ
         10mm، فقياسُ المسافة من صندوقها يقرأ الحشوَ إزاحةً. والجدولُ فوقه
         يشغل عرضَ المحتوى كلَّه، فحافّتُه هي المرجع. */
      const tbl = document.querySelector("table[data-section='items']")!.getBoundingClientRect();
      return { fromContentLeft: Math.round(band.left - tbl.left),
               width: Math.round(band.width), contentW: Math.round(tbl.width) };
    });
    expect(m.fromContentLeft).toBeLessThan(4);        // ملتصقٌ بحافّة المحتوى اليسرى
    expect(m.width).toBeLessThan(m.contentW * 0.6);   // وبقدر محتواه لا بعرض الورقة
  });

  /** وخلايا الجدول متساويةُ المقاس فعلاً بعد التخطيط. */
  test("وخلايا الجدول والترويسة بمقاسٍ واحد بعد التخطيط", async ({ page }) => {
    await mount(page);
    const m = await page.evaluate(() => {
      const t = document.querySelector("table[data-section='items']")!;
      const px = (s: string) => parseFloat(getComputedStyle(t.querySelector(s)!).fontSize);
      return { td: px("tbody td"), th: px("thead th"), qty: px(".col-qty"), price: px(".col-price") };
    });
    expect(m.th).toBe(m.td);
    expect(m.qty).toBe(m.td);
    expect(m.price).toBe(m.td);
  });
});
