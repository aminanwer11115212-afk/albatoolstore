/**
 * تقسيمُ ورقةٍ طويلة إلى صفحات A4 — الحسابُ وحده، بلا DOM ولا canvas.
 *
 * ## لماذا يُحسب هنا لا في html2pdf
 * كان التقسيم لـhtml2pdf، وهو يصوّر عبر حاويةٍ يضعها في طبقةٍ عرضُها
 * `left:-100000px; right:0` ويوسّطها بـ`margin:auto`. فموضعُ الحاوية يتبع
 * عرضَ النافذة، ويختلف بين المستند الأصلي ونسخةِ html2canvas — فتخرج الورقةُ
 * مزاحةً وتُقصّ حافّتها. ثلاثةُ أعطالٍ متتالية خرجت من تلك الطبقة: صفحةٌ
 * بيضاء، ثمّ إزاحة، ثمّ قصُّ حافّة.
 *
 * فصار المسار مباشراً: لوحةٌ واحدة من html2canvas، ثمّ تقطيعٌ بحسابٍ معلوم.
 *
 * ## والقطعُ لا يقع وسط سطر
 * التقطيعُ الأعمى يشطر صفّاً أو صندوقاً نصفين — نصفُه أسفل صفحةٍ ونصفُه أعلى
 * التالية. فتُجمع مواضعُ العناصر التي لا تُشطر (صفوفُ البنود، صندوقا التغليف
 * والترحيل، التواقيع)، ويُنزل القطعُ إلى أقربها فوق الحدّ.
 */

/** مقاسُ A4 بالمليمتر، وهامشُ الورقة. */
export const A4_MM = { width: 210, height: 297, margin: 8 } as const;

/**
 * لا تُقصّر الصفحةُ إلى أقلّ من هذه النسبة من ارتفاعها بحثاً عن حدٍّ آمن.
 *
 * فلو كان أقربُ حدٍّ آمن قريباً من رأس الصفحة لخرجت صفحةٌ شبه فارغة ثمّ
 * تراكم الباقي — والفراغُ الكبير أقبح من شطر صفٍّ واحد.
 */
export const MIN_PAGE_FILL = 0.55;

/**
 * يخطّط مواضع بداية كل صفحة.
 *
 * @param totalPx  ارتفاع الورقة كلّها بالبكسل
 * @param pagePx   ارتفاع الصفحة الواحدة بالبكسل
 * @param breaks   مواضعُ يُستحسن القطعُ عندها (أعلى العناصر التي لا تُشطر)
 * @returns مواضعُ البداية بالبكسل، أوّلها صفر
 */
export function planPages(totalPx: number, pagePx: number, breaks: number[] = []): number[] {
  if (!(totalPx > 0) || !(pagePx > 0)) return [0];
  const sorted = Array.from(new Set(breaks.filter((b) => Number.isFinite(b) && b > 0))).sort((a, b) => a - b);
  const starts: number[] = [0];
  let at = 0;
  // حدُّ أمانٍ للحلقة: صفحةٌ لكل `pagePx` على الأكثر، وزيادةٌ يسيرة
  const maxPages = Math.ceil(totalPx / pagePx) + 2;

  while (at + pagePx < totalPx && starts.length < maxPages) {
    const ideal = at + pagePx;
    const floor = at + pagePx * MIN_PAGE_FILL;
    // أقربُ حدٍّ آمن تحت المثالي وفوق الحدّ الأدنى للامتلاء
    let cut = ideal;
    for (const b of sorted) {
      if (b > ideal) break;
      if (b >= floor && b > at) cut = b;
    }
    // لا تراجع: القطعُ يتقدّم دائماً
    if (cut <= at) cut = ideal;
    starts.push(cut);
    at = cut;
  }
  return starts;
}

/** ارتفاعُ كل صفحة من مواضع البدايات. */
export function pageHeights(starts: number[], totalPx: number): number[] {
  return starts.map((s, i) => (i + 1 < starts.length ? starts[i + 1] : totalPx) - s);
}
