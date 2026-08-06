/**
 * ترقيمُ صفحات الورقة على الشاشة — «المعاينة بتنسيق الـPDF».
 *
 * ## ما طلبه صاحب المستودع
 * «كلُّ الشاشات الخاصة بالمعاينة تكون منسّقة بتنسيق الـPDF، فإذا زاد عن الـA4
 * تُقسم، وأضِف ترقيم صفحات — فإذا كانت الفاتورة ثلاث صفحات يظهر تحت 1 من 3».
 *
 * ## والمعاينةُ كانت شريطاً واحداً لا يُعرف أين ينتهي الورق
 * الورقةُ على الشاشة صفحةٌ بيضاء واحدة تطول بطول محتواها. فالمستخدم يرى
 * فاتورةَ ستّين بنداً عموداً متّصلاً، ولا يعرف أين يقع القطعُ في الـPDF ولا كم
 * صفحةً ستخرج من الطابعة — فيكتشفه بعد الطباعة.
 *
 * ## أين يعمل هذا ولماذا لا يفسد الـPDF
 * المعاينةُ ورابطُ العميل يعرضان الورقة في `iframe` بـ`srcDoc`، والسكربتُ
 * فيها **يعمل**. أمّا `buildPdfBlob` فيركّب الورقة بـ`innerHTML`، وهو **لا
 * يُشغّل** السكربتات أصلاً. فالفواصلُ لا تدخل الملفّ الناتج ولا تزاحم تقطيعَه،
 * وأرقامُ صفحاته تُكتب هناك بالضبط لأنها معلومةٌ وقتَ الرسم.
 *
 * وفي الطباعة تُخفى الفواصل: المتصفّح يقسّم بنفسه، وفاصلٌ مرسومٌ فوق تقسيمه
 * يزيح المحتوى.
 *
 * ## والحساب مرّةً واحدة لا مئة
 * القياسُ ثمّ الإدراج، لا قياسٌ بعد كلّ إدراج: إدخالُ فاصلٍ بارتفاع `g` يزيح
 * كلَّ ما تحته `g` بالضبط، فيُحسب الإزاحةُ تراكمياً على القياس الأوّل. فاتورةُ
 * مئة بندٍ إعادةُ تخطيطٍ واحدة لا مئة.
 */

/** ارتفاعُ الورقة وهوامشُها بالمليمتر — نفس ما في `@media screen` بالقالب. */
export const SCREEN_PAGE_MM = { height: 297, padding: 10 } as const;

/** ارتفاعُ منطقةِ المحتوى في الصفحة الواحدة — بالمليمتر. */
export const CONTENT_MM = SCREEN_PAGE_MM.height - 2 * SCREEN_PAGE_MM.padding;

/**
 * العناصرُ التي لا يُشطر جسمُها بين صفحتين.
 *
 * هي نفسُها التي يحترمها تقطيعُ الـPDF (`UNSPLITTABLE` في `shareDocumentPdf`)
 * — فالمعاينةُ تقطع حيث يقطع الملفّ، لا حيث يقع الحدُّ حسابياً.
 */
export const ATOM_SELECTOR =
  "tr, .extra-box, .account-box, .signatures, [data-pkg-line], .notes-section";

/**
 * ارتفاعُ شريط الترقيم المحجوز أسفل كل صفحة — بالبكسل.
 *
 * يُحجز ولا يُترك للمصادفة: الشريطُ يُرسم فوق الورقة بموضعٍ مطلق، فلو لم
 * يُحجز مكانُه لجاز أن ينتهي بندٌ عند الحدّ تماماً فيُكتب الرقمُ فوقه.
 */
export const FOOTER_H_PX = 22;

/** أنماطُ فاصل الصفحة وترقيمها — تُحقن في الورقة. */
export const PAGINATION_CSS = `
  /* === فاصلُ الصفحات وترقيمها في المعاينة ===
     الفاصلُ ارتفاعٌ خالصٌ بلا محتوى (overflow:hidden كي لا ينتفخ بما يُدسّ
     فيه)، والترقيمُ طبقةٌ مطلقةٌ فوق الورقة — فلا يزيح شيئاً ولا يتبع وجودَ
     فاصلٍ عنده: صفحةٌ ينتهي حدُّها في فراغٍ ترقَّم كغيرها. */
  .lov-pgbreak { padding: 0 !important; border: 0 !important; background: transparent !important; overflow: hidden; }
  /*
   * شريطُ الترقيم هو الفاصلُ نفسه — لا شريطَ رماديٌّ ثانٍ تحته.
   *
   * كان الفراغُ الرمادي يُرسم عند الحدّ بموضعٍ مطلق **فوق** ما بعده، فيغطّي
   * أعلى أوّل بندٍ في الصفحة التالية. والمكانُ المحجوز هو ما قبل الحدّ لا ما
   * بعده، فصار الشريطُ كلُّه داخل الحجز: أرضيةٌ رمادية بحدَّين يُقرأ منها
   * انتهاءُ الورقة، ولا يقع على محتوى.
   */
  .lov-pgfoot {
    position: absolute; left: 0; right: 0;
    text-align: center; height: ${FOOTER_H_PX}px; line-height: ${FOOTER_H_PX - 2}px;
    font-size: 11px; font-weight: 700; color: #64748b;
    letter-spacing: 0.4px;
    background: #f1f5f9;
    border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;
  }
  @media print {
    /* الطباعةُ تقسّم بنفسها — وفاصلٌ مرسومٌ فوق تقسيمها يزيح المحتوى */
    .lov-pgbreak, .lov-pgfoot { display: none !important; }
  }
`;

/**
 * السكربتُ كما يعيش داخل الورقة — جافاسكربت خام بلا استيراد.
 *
 * ويُكتب هنا لا في نصّ القالب: القالبُ سلسلةٌ نصّية طويلة، وكلُّ ما يُكتب
 * داخلها يُخاطر بعلامة الاقتباس الخلفية التي تُنهيها. راجع `PDF_SCALE_INLINE_JS`.
 */
export const PAGINATION_INLINE_JS = `
(function(){
  var CONTENT_MM = ${CONTENT_MM};
  var FOOT = ${FOOTER_H_PX};
  var ATOMS = ${JSON.stringify(ATOM_SELECTOR)};

  function mmToPx(page){
    // قياسٌ بمسبارٍ داخل الورقة نفسها: أدقُّ من 96dpi المفترضة، ويصمد
    // للتصغير (zoom) لأن المسبار يخضع له كالمحتوى.
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:' + CONTENT_MM + 'mm;';
    page.appendChild(probe);
    var h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  }

  function clear(page){
    var old = page.querySelectorAll('.lov-pgbreak, .lov-pgfoot');
    for (var i = 0; i < old.length; i++) old[i].remove();
    page.style.minHeight = '';
  }

  function paginate(){
    var page = document.querySelector('.page');
    if (!page) return;
    clear(page);

    var pageH = mmToPx(page);
    if (!(pageH > FOOT * 3)) return;

    var padTop = parseFloat(getComputedStyle(page).paddingTop || '0');
    var top0 = page.getBoundingClientRect().top + padTop;

    /*
     * ١) اجمع العناصر الذرّية، ثمّ ارفع كلَّ واحدٍ إلى **مرساه في التدفّق**.
     *
     * الفاصلُ عنصرٌ يُدرَج قبل العنصر ليدفعه إلى الصفحة التالية — وهذا يصحّ
     * في التدفّق العادي وحده. فصندوقا الترحيل والحساب متجاوران في سطرِ
     * مرونة، والفاصلُ المُدرَج قبل أحدهما يصير عنصرَ مرونةٍ ثالثاً **بجانبه**
     * لا فوقه، فلا يدفع شيئاً. قِيس: أُدرج فاصلٌ 44px وبقي الصندوقان عابرَين
     * للحدّ كما كانا.
     *
     * فيُصعَد من العنصر ما دام أبوه مرونةً أو شبكةً أو متعدّدَ الأعمدة، حتى
     * يُبلَغ عنصرٌ أبوه تدفّقٌ عادي — وهو ما يُدفع فعلاً.
     */
    function flowAnchor(el){
      var node = el;
      while (node.parentElement && node.parentElement !== page) {
        var ps = getComputedStyle(node.parentElement);
        var multiCol = ps.columnCount && ps.columnCount !== 'auto' && ps.columnCount !== '1';
        if (ps.display.indexOf('flex') >= 0 || ps.display.indexOf('grid') >= 0 || multiCol) {
          node = node.parentElement;
          continue;
        }
        break;
      }
      return node;
    }

    var raw = page.querySelectorAll(ATOMS);
    var atoms = [];
    var seen = [];
    for (var i = 0; i < raw.length; i++) {
      var el = raw[i];
      if (el.closest('.account-box') && !el.classList.contains('account-box')) continue;
      var anchor = flowAnchor(el);
      if (seen.indexOf(anchor) >= 0) continue;      // مرساةٌ واحدة لعدّة ذرّات
      seen.push(anchor);
      atoms.push(anchor);
    }

    /*
     * ٢) قِس مرّةً واحدة، واحسب الإزاحة تراكمياً.
     *
     * إدخالُ فاصلٍ بارتفاع g يزيح كلَّ ما تحته g بالضبط، فلا حاجة لإعادة
     * القياس بعد كلّ إدخال — وفاتورةُ مئة بندٍ إعادةُ تخطيطٍ واحدة لا مئة.
     *
     * والحدُّ الذي لا يُتجاوز ليس نهايةَ الصفحة بل نهايتُها ناقصَ شريطِ
     * الترقيم: مكانُه محجوزٌ فلا يُكتب الرقمُ فوق بند.
     */
    var plan = [];
    var shift = 0;
    for (var j = 0; j < atoms.length; j++) {
      var r = atoms[j].getBoundingClientRect();
      var t = r.top - top0 + shift;
      var b = r.bottom - top0 + shift;
      if (b - t >= pageH - FOOT) continue;     // أطولُ من صفحة: لا مفرّ من شطره
      var p = Math.floor(t / pageH);
      if (b > (p + 1) * pageH - FOOT) {
        var gap = (p + 1) * pageH - t;
        if (gap > 1) { plan.push({ el: atoms[j], gap: gap }); shift += gap; }
      }
    }

    // ٣) أدرِج الفواصل — بعد القياس كلِّه
    for (var k = 0; k < plan.length; k++) {
      var el = plan[k].el, gap = plan[k].gap;
      if (el.tagName === 'TR') {
        var cells = el.children.length || 1;
        var tr = document.createElement('tr');
        tr.className = 'lov-pgbreak';
        var td = document.createElement('td');
        td.setAttribute('colspan', String(cells));
        td.style.cssText = 'height:' + gap + 'px;';
        tr.appendChild(td);
        el.parentNode.insertBefore(tr, el);
      } else {
        var div = document.createElement('div');
        div.className = 'lov-pgbreak';
        div.style.height = gap + 'px';
        el.parentNode.insertBefore(div, el);
      }
    }

    /*
     * ارتفاعُ المحتوى = الورقة ناقصَ حشوَيها. وبلا طرح الحشو الأسفل تخرج
     * فاتورةٌ تملأ صفحةً واحدةً بالضبط في «صفحتين» — قِيس: محتوىً 1047.4
     * وصفحةٌ 1046.9، فبقيّةُ نصفِ بكسلٍ تصنع صفحةً كاملةً فارغة. ولهذا
     * تسامحٌ بأربعة بكسلات: الكسورُ في القياس لا تُصنع منها ورقة.
     */
    var padBot = parseFloat(getComputedStyle(page).paddingBottom || '0');
    var contentH = page.scrollHeight - padTop - padBot;
    var pages = Math.max(1, Math.ceil((contentH - 4) / pageH));
    if (pages < 2) return;                     // صفحةٌ واحدة: لا ترقيم ولا فاصل

    /*
     * ٤) الترقيمُ طبقةٌ مطلقةٌ فوق الورقة — لا يتبع وجودَ فاصلٍ عند الحدّ.
     *
     * فصفحةٌ ينتهي حدُّها في فراغٍ لا فاصلَ فيها، وكانت تخرج بلا رقم: أوّلُ
     * ما ظهر في القياس «2 من 2» وحدَها بلا «1 من 2».
     */
    if (getComputedStyle(page).position === 'static') page.style.position = 'relative';
    page.style.minHeight = (pages * pageH + padTop * 2) + 'px';

    for (var n = 1; n <= pages; n++) {
      var f = document.createElement('div');
      f.className = 'lov-pgfoot';
      f.textContent = n + ' من ' + pages;
      f.style.top = (padTop + n * pageH - FOOT) + 'px';
      page.appendChild(f);
    }
  }

  function run(){ try { paginate(); } catch (e) {} }

  if (document.readyState === 'complete') setTimeout(run, 0);
  else window.addEventListener('load', function(){ setTimeout(run, 0); });

  // الخطوطُ والصورُ تصل متأخّرةً فتتغيّر الارتفاعات — وإعادةُ القياس رخيصة
  var t = null;
  window.addEventListener('resize', function(){
    clearTimeout(t); t = setTimeout(run, 150);
  });
})();
`;
