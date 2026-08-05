/**
 * ملاءمة ورقة المستند لعرض الإطار — ومعها تكبيرٌ بيد القارئ.
 *
 * ## العطل كما رآه صاحب المستودع
 * أرسل صورتين: **المعاينة** تُظهر الورقة كاملةً على الهاتف، و**رابط العميل**
 * يُظهر ثُلثها مقصوصاً من اليسار. وقال: «اجعل رابط العميل مثل شكل المعاينة،
 * أكبر لأرى أوضح، وليس هكذا».
 *
 * ## ولماذا اختلفتا وهما على قالبٍ واحد
 * `StandaloneShareDocument` تجرّب دالّة القاعدة `get_shared_document` أوّلاً،
 * فإن لم تكن الهجرة مطبَّقة **سقطت إلى دالّة الحافة القديمة** — وتلك تبني
 * HTML من عندها لا من `generatePrintHTML`. فيرى العميل ورقةً بمقاسٍ آخر بلا
 * ملاءمة. وهذا هو الخطر الذي تحذّر منه قاعدة الورقة الواحدة حرفياً.
 *
 * ولا سبيل لإصلاح دالّة الحافة من هنا: سياسة لافابل ترفض تعديل
 * `supabase/functions`، فما يُكتب فيها لا يصل الإنتاج.
 *
 * ## الحلّ: الإطار يقيس ما بداخله
 * فبدل انتظار الورقة أن تلائم نفسها، يقيس المضيفُ **عرض المحتوى الفعلي** —
 * لا مقاساً محفوظاً ولا رقماً بالمليمتر — ويصغّره حتى يدخل الإطار. فيعمل مع
 * القالب ومع أيّ HTML آخر يحمله الإطار، اليوم وبعد الهجرة.
 *
 * وهذا **لا يُنشئ مقاساً ثانياً للورقة**: لا مقاسَ بالمليمتر هنا ولا
 * بالبكسل. المقاس في القالب وحده، وهذا الملفّ يقرؤه من المرسوم ولا يعرفه.
 *
 * ## والتكبير بيد القارئ
 * «أكبر لأرى أوضح»: ملاءمةٌ أوّلاً ليرى الورقة كاملةً، ثم `+` و`−` يكبّران
 * ويصغّران حول تلك النسبة. و«ملاءمة» تعيده إلى الكل. وهي تعمل حيث لا يعمل
 * الضغط بالأصابع — داخل إطارٍ في تطبيقٍ يمنع تكبير الصفحة.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** حدود التكبير — أقصاه ثلاثة أضعاف الملاءمة، وأدناه نصفها. */
export const MIN_USER_SCALE = 0.5;
export const MAX_USER_SCALE = 3;
/** خطوة الزرّ الواحد. */
export const SCALE_STEP = 0.25;

export function clampUserScale(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.min(MAX_USER_SCALE, Math.max(MIN_USER_SCALE, v));
}

/**
 * نسبةُ ملاءمة عرض المحتوى لعرض الإطار.
 *
 * تُقاس **بعد تصفير أي تصغيرٍ سابق**، وإلا قِيس المقيسُ مصغَّراً فتراكمت
 * النسب حتى تختفي الورقة. وهذا خطأٌ يقع كثيراً في هذا النمط.
 */
export function fitRatio(contentWidth: number, frameWidth: number): number {
  if (!(contentWidth > 0) || !(frameWidth > 0)) return 1;
  const r = frameWidth / contentWidth;
  // لا تُكبَّر الورقة فوق مقاسها — التكبير للقارئ لا للملاءمة
  if (!Number.isFinite(r) || r >= 1) return 1;
  // ولا تُصغَّر إلى ما لا يُرى مهما ضاق الإطار
  return Math.max(r, 0.2);
}

/** الوسم الذي يعرّف ورقتنا — القالب يكتبه على `<html>`. */
const SHEET_MARK = "data-lov-sheet";

/**
 * يطبّق التصغير على مستند الإطار.
 *
 * لورقتنا: عبر المتغيّر `--lov-fit` الذي يستعمله القالب على `.page` — فيبقى
 * **كيف** تُصغَّر الورقة في القالب، و**كم** عند المضيف.
 * ولغيرها (ورقة دالّة الحافة القديمة): على `<html>` مباشرةً.
 */
function applyScale(doc: Document, scale: number): void {
  const root = doc.documentElement;
  if (root.hasAttribute(SHEET_MARK)) {
    root.style.setProperty("--lov-fit", String(scale));
    root.style.zoom = "";
  } else {
    root.style.zoom = scale === 1 ? "" : String(scale);
  }
}

/** يُصفّر التصغير قبل القياس — وإلا قِيس المصغَّر فتراكمت النسب. */
function resetScale(doc: Document): void {
  const root = doc.documentElement;
  root.style.setProperty("--lov-fit", "1");
  root.style.zoom = "";
}

/** عرض المحتوى الفعلي داخل المستند. */
function measureContentWidth(doc: Document): number {
  const page = doc.querySelector<HTMLElement>(".page");
  // `.page` أدقّ من `scrollWidth` للجسم كلّه: الأخير يتأثّر بعناصر عائمة
  if (page) return page.getBoundingClientRect().width || page.scrollWidth;
  return doc.documentElement.scrollWidth || doc.body?.scrollWidth || 0;
}

export interface DocumentFrameFit {
  /** نسبة التكبير التي اختارها القارئ فوق الملاءمة (1 = ملاءمة تامّة) */
  userScale: number;
  /** النسبة المعروضة كنسبة مئوية للعرض على الزرّ */
  percent: number;
  /** هل الورقة أعرض من الإطار أصلاً؟ (على الحاسوب لا تكون، فتُخفى الأزرار) */
  needsFit: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  /** يعيدها إلى الورقة كاملةً في عرض الإطار */
  resetFit: () => void;
  /** يُعاد قياسها — يُستدعى من `onLoad` للإطار */
  refit: () => void;
}

/**
 * يلائم ورقة الإطار ويُبقيها ملائمة عند تغيّر المقاس أو تدوير الهاتف.
 *
 * محروسٌ كاملاً: إطارٌ لم يُحمَّل بعد، أو مستندٌ لا يُقرأ (سياسة مصدر)، أو
 * بيئةٌ بلا `ResizeObserver` — كلّها تترك الورقة على حالها بلا استثناء يُسقط
 * الصفحة. والتدهور اللطيف هنا مقصود: ورقةٌ غير ملائمة خيرٌ من صفحةٍ بيضاء.
 */
export function useDocumentFrameFit(
  iframeRef: React.RefObject<HTMLIFrameElement>,
  deps: unknown[] = [],
): DocumentFrameFit {
  const [userScale, setUserScale] = useState(1);
  const [needsFit, setNeedsFit] = useState(false);
  const [percent, setPercent] = useState(100);
  const userScaleRef = useRef(1);
  userScaleRef.current = userScale;

  const apply = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return; // مستندٌ من مصدرٍ آخر — لا يُقرأ ولا يُلمَس
    }
    if (!doc || !doc.documentElement) return;
    try {
      resetScale(doc);
      const content = measureContentWidth(doc);
      const frameWidth = frame.clientWidth;
      const fit = fitRatio(content, frameWidth);
      const scale = clampUserScale(userScaleRef.current) * fit;
      applyScale(doc, scale);
      setNeedsFit(fit < 1);
      setPercent(Math.round(scale * 100));
    } catch { /* لا نُسقط الصفحة لأجل تصغير */ }
  }, [iframeRef]);

  // إعادة القياس عند تغيّر المحتوى أو مقاس النافذة أو تدوير الهاتف
  useEffect(() => {
    apply();
    const onResize = () => apply();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    let ro: ResizeObserver | null = null;
    try {
      if (typeof ResizeObserver !== "undefined" && iframeRef.current) {
        ro = new ResizeObserver(onResize);
        ro.observe(iframeRef.current);
      }
    } catch { /* بيئة بلا مراقب */ }
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      try { ro?.disconnect(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, ...deps]);

  useEffect(() => { apply(); }, [userScale, apply]);

  const zoomIn = useCallback(() => setUserScale((s) => clampUserScale(s + SCALE_STEP)), []);
  const zoomOut = useCallback(() => setUserScale((s) => clampUserScale(s - SCALE_STEP)), []);
  const resetFit = useCallback(() => setUserScale(1), []);

  return { userScale, percent, needsFit, zoomIn, zoomOut, resetFit, refit: apply };
}
