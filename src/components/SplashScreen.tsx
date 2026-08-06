import { useState, useEffect, useCallback } from "react";
import splashLogo from "@/assets/splash-logo.png";

/**
 * شاشةُ البداية: تُرى ولا يُنتظَر خلفها.
 *
 * ## العطل: ثلاثُ ثوانٍ ميّتة في كلّ فتحة
 * كانت تُخفى بعد 3000 مللي **مهما كان** — والتطبيق جاهزٌ خلفها قبل ذلك بكثير،
 * فهي طبقةٌ فوقه لا تمنع تحميله بل تمنع لمسَه. فالمستخدم ينظر إلى شعارٍ ثابت
 * وهو ينتظر شاشةً صارت جاهزة.
 *
 * ## والعلاج لا يحذف الشعار
 * الرسمُ المتحرّك (`logo-grow`) طولُه 1.2 ثانية، فالإخفاءُ قبله يقطعه. فصار
 * الانتظارُ بقدر الرسم لا أكثر: يبدأ التلاشي عند انتهائه، وينتهي بعده بنصف
 * ثانية — **1700 بدل 3000**، والشعارُ يُرى كاملاً كما كان.
 *
 * ويُضاف إليه ما هو أهمّ: **لمسةٌ تتخطّاها**. فمن يعرف تطبيقه لا يُجبَر على
 * انتظار شعاره.
 */

/** طولُ رسم الشعار المتحرّك — راجع `.splash-logo-grow` في `index.css`. */
const LOGO_ANIM_MS = 1200;
/** وزمنُ التلاشي — راجع `duration-700` أدناه، وأقصرُ منه كي لا يُقطع. */
const FADE_MS = 500;

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [phase, setPhase] = useState<"show" | "fadeOut" | "done">("show");

  const finish = useCallback(() => {
    setPhase("done");
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fadeOut"), LOGO_ANIM_MS);
    const doneTimer = setTimeout(finish, LOGO_ANIM_MS + FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [finish]);

  if (phase === "done") return null;

  return (
    <div
      onClick={finish}
      onTouchStart={finish}
      role="presentation"
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-700 ${
        phase === "fadeOut" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex flex-col items-center gap-4">
        <img
          src={splashLogo}
          alt="البتول"
          className="splash-logo-grow object-contain drop-shadow-2xl"
        />
        <p className="text-sm md:text-base text-muted-foreground splash-subtitle-fade">
          لاسبيرات المواتر والتكاتك
        </p>
      </div>
    </div>
  );
}
