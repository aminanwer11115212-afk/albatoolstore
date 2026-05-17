import { useState, useEffect } from "react";
import splashLogo from "@/assets/splash-logo.png";

interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const [phase, setPhase] = useState<"show" | "fadeOut" | "done">("show");

  useEffect(() => {
    const fadeTimer = setTimeout(() => setPhase("fadeOut"), 2200);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      onFinish();
    }, 3000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  if (phase === "done") return null;

  return (
    <div
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
