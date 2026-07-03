import { useCallback, useEffect, useRef, useState } from "react";

/**
 * اختصار المسطرة (Space) في جدول البنود:
 *
 * وضع "التنقّل" (افتراضي بعد Focus): Space يُحدِّد/يحذف الصف.
 * وضع "التحرير": بعد ضغط Enter داخل الحقل، أو نقر بالماوس لوضع المؤشر،
 *                 يعمل Space كمسطرة عادية ولا يُفعّل التحديد.
 * الخروج من وضع التحرير: مغادرة الحقل (blur) أو Escape أو Tab/Arrow.
 */
const DOUBLE_PRESS_WINDOW_MS = 250;

// عناصر الإدخال التي دخلت "وضع التحرير" (Enter أو نقر بالماوس)
const editingElements = new WeakSet<HTMLElement>();

function isEditing(el: HTMLElement | null): boolean {
  return !!el && editingElements.has(el);
}

// مُستمِعات عالمية لضبط وضع التحرير — تُسجَّل مرّة واحدة.
if (typeof window !== "undefined" && !(window as any).__spaceEditingHooked) {
  (window as any).__spaceEditingHooked = true;

  // Enter داخل حقل نصّي → ادخل وضع التحرير
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || (t as HTMLElement).isContentEditable) {
        editingElements.add(t);
        return;
      }
      if (tag === "INPUT") {
        const type = ((t as HTMLInputElement).type || "text").toLowerCase();
        const textLike = ["text", "search", "email", "tel", "url", "password"];
        if (textLike.includes(type)) editingElements.add(t);
      }
    },
    true,
  );

  // نقر بالماوس داخل حقل نصّي → ادخل وضع التحرير
  window.addEventListener(
    "mousedown",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "TEXTAREA" || t.isContentEditable) {
        editingElements.add(t);
        return;
      }
      if (tag === "INPUT") {
        const type = ((t as HTMLInputElement).type || "text").toLowerCase();
        const textLike = ["text", "search", "email", "tel", "url", "password"];
        if (textLike.includes(type)) editingElements.add(t);
      }
    },
    true,
  );

  // Tab / السهم / Escape → خروج من وضع التحرير
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        const t = e.target as HTMLElement | null;
        if (t) editingElements.delete(t);
      }
    },
    true,
  );

  // مغادرة الحقل تُنهي وضع التحرير
  window.addEventListener(
    "blur",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t) editingElements.delete(t);
    },
    true,
  );

  // ============ مؤشر بصري لوضع Space (تنقّل/تعديل) ============
  // يعمل فقط على الحقول داخل جدول البنود (data-nav-table).
  const badge = document.createElement("div");
  badge.setAttribute("data-space-mode-badge", "");
  badge.style.cssText = [
    "position:fixed","z-index:9999","pointer-events:none",
    "font-family:inherit","font-size:10px","font-weight:700",
    "padding:1px 6px","border-radius:9999px","line-height:1.4",
    "box-shadow:0 1px 2px rgba(0,0,0,.15)","display:none","color:#fff",
  ].join(";");
  const attachBadge = () => {
    if (!badge.isConnected && document.body) document.body.appendChild(badge);
  };

  const isTextLike = (el: HTMLElement) => {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || el.isContentEditable) return true;
    if (tag === "INPUT") {
      const type = ((el as HTMLInputElement).type || "text").toLowerCase();
      return ["text","search","email","tel","url","password"].includes(type);
    }
    return false;
  };

  const computeMode = (el: HTMLElement): "nav" | "edit" | null => {
    if (!el.closest?.("[data-nav-table]")) return null;
    const tag = el.tagName;
    if (tag === "SELECT") return "nav";
    if (tag === "INPUT") {
      const type = ((el as HTMLInputElement).type || "text").toLowerCase();
      if (type === "number") return "nav";
    }
    if (!isTextLike(el)) return null;
    // النصوص: افتراضياً تنقّل. لا يدخل وضع التعديل إلا صراحةً (Enter/نقر).
    if (editingElements.has(el)) return "edit";
    return "nav";
  };


  const refresh = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) { badge.style.display = "none"; return; }
    const mode = computeMode(el);
    document.querySelectorAll("[data-space-mode]").forEach((n) => {
      if (n !== el) (n as HTMLElement).removeAttribute("data-space-mode");
    });
    if (!mode) {
      el.removeAttribute("data-space-mode");
      badge.style.display = "none";
      return;
    }
    el.setAttribute("data-space-mode", mode);
    attachBadge();
    const rect = el.getBoundingClientRect();
    badge.textContent = mode === "edit" ? "تعديل" : "تنقّل";
    badge.style.background = mode === "edit" ? "hsl(142 71% 40%)" : "hsl(38 92% 45%)";
    badge.style.top = `${Math.max(2, rect.top - 10)}px`;
    badge.style.left = `${Math.max(2, rect.left - 4)}px`;
    badge.style.display = "block";
  };

  const scheduleRefresh = () => requestAnimationFrame(refresh);
  window.addEventListener("focusin", scheduleRefresh, true);
  window.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      if (!document.activeElement || document.activeElement === document.body) {
        badge.style.display = "none";
      } else refresh();
    });
  }, true);
  window.addEventListener("keyup", scheduleRefresh, true);
  window.addEventListener("mouseup", scheduleRefresh, true);
  window.addEventListener("input", scheduleRefresh, true);
  window.addEventListener("scroll", scheduleRefresh, true);
  window.addEventListener("resize", scheduleRefresh, true);
}


export function useSpaceToDelete(onDelete: (uid: string) => void | Promise<void>) {
  const [pendingUids, setPendingUids] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef<Set<string>>(new Set());
  const lastPressUidRef = useRef<string | null>(null);
  const lastPressAtRef = useRef<number>(0);

  useEffect(() => {
    pendingRef.current = pendingUids;
  }, [pendingUids]);

  const isPending = useCallback(
    (uid: string) => pendingUids.has(uid),
    [pendingUids],
  );

  const handleRowKeyDown = useCallback(
    (uid: string, e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingRef.current.size > 0) {
          setPendingUids(new Set());
          lastPressUidRef.current = null;
        }
        return;
      }
      if (e.key !== " " && e.code !== "Space") return;

      const t = e.target as HTMLElement;
      const tag = t.tagName;

      // إذا كان الحقل في "وضع التحرير" (بعد Enter أو نقر بالماوس)
      // → اترك Space يعمل عادياً ويكتب مسافة (لا تحديد ولا حذف).
      if (isEditing(t)) return;

      // الحقول النصية في وضع التنقّل: Space يُحدِّد/يحذف الصف (كالأرقام).
      // للكتابة داخل الحقل يجب أولاً ضغط Enter أو النقر بالماوس لدخول
      // وضع التحرير (يعالَج ذلك في المستمعات العالمية أعلاه).
      const isTextTag =
        tag === "TEXTAREA" || t.isContentEditable ||
        (tag === "INPUT" && ["text","search","email","tel","url","password"].includes(
          ((t as HTMLInputElement).type || "text").toLowerCase()
        ));
      // الأرقام/الاختيار أيضاً تعمل كاختصار.
      const isInput = tag === "INPUT" || tag === "SELECT";
      if (!isTextTag && !isInput) return;



      // الحقول الرقمية/الاختيار في وضع التنقّل: Space يُحدِّد/يحذف الصف.
      e.preventDefault();

      const now = Date.now();
      const isDoublePress =
        lastPressUidRef.current === uid &&
        now - lastPressAtRef.current <= DOUBLE_PRESS_WINDOW_MS;

      if (isDoublePress) {
        // ضغطتان متتاليتان على نفس الصف → احذف كل المحددين (مع ضمان تضمين هذا الصف)
        const uidsToDelete = new Set(pendingRef.current);
        uidsToDelete.add(uid);

        // احفظ موقع الصف الحالي لنقل التركيز لاحقاً
        const rowEl = t.closest("[data-nav-row]") as HTMLElement | null;
        const tableName = rowEl?.getAttribute("data-nav-table") || null;
        const rowIdx = rowEl
          ? parseInt(rowEl.getAttribute("data-nav-row") || "-1", 10)
          : -1;

        setPendingUids(new Set());
        lastPressUidRef.current = null;
        lastPressAtRef.current = 0;

        // نفّذ الحذف بالتسلسل
        const runDeletes = async () => {
          for (const u of uidsToDelete) {
            try {
              await Promise.resolve(onDelete(u));
            } catch {
              /* تجاهل */
            }
          }
        };

        runDeletes().then(() => {
          if (rowIdx < 0 || !tableName) return;
          window.setTimeout(() => {
            const sel = (r: number) =>
              document.querySelector<HTMLElement>(
                `[data-nav-table="${tableName}"][data-nav-row="${r}"][data-nav-col="product"]`,
              );
            // ابحث عن أول صف موجود بدءاً من نفس الفهرس ثم تنازلياً
            let target: HTMLElement | null = null;
            for (let r = rowIdx; r >= 0 && !target; r--) {
              target = sel(r);
            }
            if (!target) {
              // لا توجد صفوف → اذهب إلى Quick Add
              target = document.querySelector<HTMLElement>(
                `.quick-add-row [data-nav-col="product"]`,
              );
            }
            if (target) {
              target.focus();
              if (target instanceof HTMLInputElement) target.select();
            }
          }, 30);
        });
        return;
      }

      // غير ضغطة مزدوجة → Toggle لذلك الصف
      setPendingUids((prev) => {
        const next = new Set(prev);
        if (next.has(uid)) {
          next.delete(uid);
        } else {
          next.add(uid);
        }
        return next;
      });
      lastPressUidRef.current = uid;
      lastPressAtRef.current = now;
    },
    [onDelete],
  );

  const clear = useCallback(() => {
    setPendingUids(new Set());
    lastPressUidRef.current = null;
    lastPressAtRef.current = 0;
  }, []);

  return { pendingUids, isPending, handleRowKeyDown, clear };
}
