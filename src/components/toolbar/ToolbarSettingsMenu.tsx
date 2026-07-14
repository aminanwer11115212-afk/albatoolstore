import { useEffect, useRef, useState } from "react";
import { Settings, Check, RotateCcw, Wand2, Minus, Plus, Lock, Unlock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useToolbarCustomization } from "./ToolbarCustomizationContext";
import { useToolbarLock } from "./useToolbarLock";
import { toast } from "sonner";

interface ZoomCtl {
  value: number;
  inc: () => void;
  dec: () => void;
}

interface Props {
  /** مفتاح الصفحة لقفل الإعدادات بشكل دائم. */
  screenKey: string;
  zoom?: ZoomCtl;
}

const triggerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  height: 28,
  width: 32,
  padding: 0,
  borderRadius: 4,
  border: "1px solid hsl(var(--border))",
  cursor: "pointer",
  position: "relative",
  overflow: "hidden",
};

/** مدة الضغط المطوّل لتفعيل القفل/فك القفل. */
const LONG_PRESS_MS = 500;

/**
 * زر إعدادات موحّد على شكل ترس:
 *   - نقرة عادية → فتح القائمة فوراً (بدون أي تأخير).
 *   - ضغطة مطوّلة (≥500ms) → قفل/فك قفل الإعدادات + Toast تأكيدي.
 *     في وضع التخصيص: تنهي التخصيص وتقفل في خطوة واحدة.
 *   - بديل دائم داخل القائمة: بند "قفل/فك قفل الإعدادات".
 */
export default function ToolbarSettingsMenu({ screenKey, zoom }: Props) {
  const ctx = useToolbarCustomization();
  const { isLocked, toggle: toggleLock } = useToolbarLock(screenKey);
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const enterHeldRef = useRef(false);
  const enterDownAtRef = useRef<number>(0);

  // تنظيف عند الإلغاء
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  if (!ctx) return null;
  const { customizing, toggleCustomizing, resetAll } = ctx;

  const stopAll = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  /** ينفّذ فعل القفل/فك القفل (مع حالة التخصيص) ويظهر Toast. */
  const performLockToggle = () => {
    const wasLocked = isLocked;
    let isCustomizing = customizing;
    try {
      if (typeof window !== "undefined") {
        isCustomizing = localStorage.getItem("neobilling:toolbar-customizing:global:v1") === "1";
      }
    } catch { /* noop */ }
    if (isCustomizing && !wasLocked) {
      // اكتب "0" مباشرة ودعّم بحدث حتى يزامن الـ Provider الحالة.
      try {
        localStorage.setItem("neobilling:toolbar-customizing:global:v1", "0");
        window.dispatchEvent(new CustomEvent("neobilling:toolbar-customizing-changed", { detail: false }));
      } catch { /* noop */ }
      window.setTimeout(() => {
        toggleLock();
      }, 0);
      toast.success("تم إنهاء التخصيص وقفل الإعدادات 🔒");
      return;
    }
    toggleLock();
    toast.success(wasLocked ? "تم فك قفل الإعدادات 🔓" : "تم قفل الإعدادات 🔒");
  };

  const startLongPress = () => {
    if (longPressTimerRef.current !== null) return; // مؤقت قائم
    longPressFiredRef.current = false;
    setPressing(true);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      setPressing(false);
      performLockToggle();
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setPressing(false);
  };

  // ── الماوس/اللمس ─────────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // امنع Radix من فتح القائمة على pointerdown — سنفتحها في onClick.
    e.preventDefault();
    startLongPress();
  };

  const handlePointerUpOrLeave = (_e: React.PointerEvent<HTMLButtonElement>) => {
    cancelLongPress();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (longPressFiredRef.current) {
      // الفعل (قفل/فك قفل) نُفِّذ بالفعل في نهاية الضغط المطوّل.
      longPressFiredRef.current = false;
      return;
    }
    setOpen(true);
  };

  // ── لوحة المفاتيح ─────────────────────────────────────────────────────────
  // Enter و Space كلاهما يدعمان قياس طول الضغط:
  //   - ضغط قصير (إفلات قبل 500ms) → فتح القائمة.
  //   - ضغط مطوّل (≥500ms) → قفل/فك قفل.
  // نتجاهل autoRepeat بعد البدء حتى لا يُعاد تشغيل المؤقت.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (enterHeldRef.current) return;
      enterHeldRef.current = true;
      enterDownAtRef.current = Date.now();
      startLongPress();
      return;
    }
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      e.stopPropagation();
      if (spaceHeldRef.current) return;
      spaceHeldRef.current = true;
      startLongPress();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") {
      enterHeldRef.current = false;
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
      } else {
        cancelLongPress();
        setOpen(true);
      }
      return;
    }
    if (e.key === " " || e.key === "Spacebar") {
      spaceHeldRef.current = false;
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
      } else {
        cancelLongPress();
        setOpen(true);
      }
    }
  };

  const triggerColor = isLocked
    ? { bg: "hsl(142 71% 45%)", fg: "#fff" }
    : customizing
      ? { bg: "hsl(142 71% 45%)", fg: "#fff" }
      : { bg: "hsl(var(--card))", fg: "hsl(var(--foreground))" };

  const ariaLabel = isLocked
    ? "إعدادات شريط الأدوات: مقفلة. اضغط لفتح القائمة، أو اضغط مطوّلاً لفك القفل"
    : customizing
      ? "إعدادات شريط الأدوات: وضع التخصيص فعّال. اضغط لفتح القائمة، أو اضغط مطوّلاً لإنهاء التخصيص والقفل"
      : "إعدادات شريط الأدوات. اضغط لفتح القائمة، أو اضغط مطوّلاً للقفل";

  /** ينهي وضع التخصيص ويظهر Toast تأكيدي. التغييرات محفوظة تلقائياً مع كل تحريك. */
  const handleSaveCustomization = () => {
    toggleCustomizing();
    toast.success("تم حفظ ترتيب الأزرار ✓");
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {/* زر حفظ ظاهر فقط أثناء وضع التخصيص — مرئي وواضح */}
      {customizing && !isLocked && (
        <button
          type="button"
          onClick={handleSaveCustomization}
          aria-label="حفظ ترتيب الأزرار وإنهاء التخصيص"
          title="حفظ التخصيص — التغييرات تُحفظ تلقائياً، اضغط هنا لإنهاء وضع التخصيص"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            height: 28,
            padding: "0 10px",
            borderRadius: 4,
            border: "1px solid hsl(142 71% 38%)",
            background: "hsl(142 71% 45%)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 0 0 2px hsl(142 71% 45% / 0.25)",
          }}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Check size={14} />
          حفظ
        </button>
      )}

    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-pressed={isLocked}
          title={
            isLocked
              ? "مقفلة — اضغط لفتح القائمة، اضغط مطوّلاً لفك القفل"
              : customizing
                ? "وضع التخصيص — اضغط مطوّلاً للحفظ والقفل"
                : "اضغط لفتح القائمة، اضغط مطوّلاً للقفل"
          }
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUpOrLeave}
          onPointerLeave={handlePointerUpOrLeave}
          onPointerCancel={handlePointerUpOrLeave}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className="focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{
            ...triggerStyle,
            background: triggerColor.bg,
            color: triggerColor.fg,
          }}
        >
          {/* شريط تقدّم بصري للضغط المطوّل */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "hsl(142 71% 45% / 0.35)",
              transformOrigin: "left",
              transform: pressing ? "scaleX(1)" : "scaleX(0)",
              transition: pressing
                ? `transform ${LONG_PRESS_MS}ms linear`
                : "transform 120ms ease-out",
              pointerEvents: "none",
            }}
          />
          <Settings size={15} style={{ position: "relative", zIndex: 1 }} />
          {isLocked && (
            <Lock
              size={9}
              style={{
                position: "absolute",
                bottom: -2,
                insetInlineEnd: -2,
                background: triggerColor.bg,
                borderRadius: 2,
                zIndex: 1,
              }}
            />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[240px]">
        {/* بديل دائم للقفل من داخل القائمة */}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            performLockToggle();
          }}
        >
          {isLocked ? (
            <>
              <Unlock size={14} className="ml-2" />
              فك قفل الإعدادات
            </>
          ) : (
            <>
              <Lock size={14} className="ml-2" />
              قفل الإعدادات
            </>
          )}
        </DropdownMenuItem>

        {isLocked && (
          <DropdownMenuLabel className="text-xs text-destructive font-normal flex items-center gap-2">
            <Lock size={12} />
            الإعدادات مقفلة على هذه الصفحة
          </DropdownMenuLabel>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isLocked}
          onSelect={(e) => {
            e.preventDefault();
            if (isLocked) return;
            toggleCustomizing();
          }}
        >
          {customizing ? (
            <>
              <Check size={14} className="ml-2" />
              إنهاء التخصيص
            </>
          ) : (
            <>
              <Wand2 size={14} className="ml-2" />
              تخصيص ترتيب الأزرار
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={isLocked}
          onSelect={(e) => {
            e.preventDefault();
            if (isLocked) return;
            toast("إعادة ترتيب الأزرار للافتراضي؟", {
              description: "سيتم إعادة كل أشرطة الأدوات في هذه الصفحة إلى وضعها الأصلي.",
              action: {
                label: "تأكيد",
                onClick: () => { resetAll(); toast.success("تمت إعادة الترتيب إلى الافتراضي"); },
              },
              cancel: { label: "إلغاء", onClick: () => {} },
            });
          }}
        >
          <RotateCcw size={14} className="ml-2" />
          إعادة الترتيب الافتراضي
        </DropdownMenuItem>

        {zoom && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              حجم سطور البنود
            </DropdownMenuLabel>
            <div
              className="flex items-center justify-between gap-2 px-2 py-1.5"
              onPointerDown={stopAll}
              onPointerUp={stopAll}
              onClick={stopAll}
            >
              <button
                type="button"
                onPointerDown={stopAll}
                onClick={(e) => {
                  stopAll(e);
                  zoom.dec();
                }}
                title="تصغير"
                className="inline-flex items-center justify-center h-7 w-7 rounded border border-border bg-card hover:bg-accent"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm font-medium tabular-nums min-w-[3.5rem] text-center">
                {Math.round(zoom.value * 100)}%
              </span>
              <button
                type="button"
                onPointerDown={stopAll}
                onClick={(e) => {
                  stopAll(e);
                  zoom.inc();
                }}
                title="تكبير"
                className="inline-flex items-center justify-center h-7 w-7 rounded border border-border bg-card hover:bg-accent"
              >
                <Plus size={14} />
              </button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}
