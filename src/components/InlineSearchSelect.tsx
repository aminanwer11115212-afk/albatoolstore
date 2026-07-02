import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { startsWithMatch, normalizeAr } from "@/utils/searchMatch";

export type InlineOption = { value: string; label: string };

export type InlineSearchSelectHandle = {
  /** يركّز الزر ويفتح القائمة تلقائياً — يستخدم عند التنقّل بلوحة المفاتيح */
  focus: () => void;
  /** يركّز الزر فقط دون فتح القائمة */
  focusOnly: () => void;
};

interface Props {
  value: string;
  options: InlineOption[];
  onChange: (v: string) => void;
  onAdd?: (name: string) => Promise<string | null>;
  onDelete?: (opt: InlineOption) => Promise<boolean> | boolean;
  deleteConfirm?: (opt: InlineOption) => string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  addLabel?: string;
  /** يُستدعى عند Enter من الزر إذا توفّرت قيمة، وبعد اختيار خيار من القائمة */
  onNavigateNext?: () => void;
  /** عند تفعيله، يتم تحديد كل الخيارات المتاحة عند الضغط Enter */
  selectAllOnEnter?: boolean;
  /** يُستدعى عند تحديد الكل (عند الضغط Enter مع selectAllOnEnter) */
  onSelectAll?: (allValues: string[]) => void;
  /** إظهار زر حذف لكل خيار في القائمة */
  showDeleteButton?: boolean;
}

const InlineSearchSelect = forwardRef<InlineSearchSelectHandle, Props>(function InlineSearchSelect({
  value, options, onChange, onAdd, onDelete, deleteConfirm, placeholder = "—",
  disabled, className, title, addLabel, onNavigateNext, selectAllOnEnter, onSelectAll, showDeleteButton,
}, ref) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [adding, setAdding] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    // focus() الافتراضي (من التنقّل بلوحة المفاتيح) يفتح القائمة أيضاً
    // حتى لا يحتاج المستخدم لضغطة Enter إضافية.
    focus: () => {
      btnRef.current?.focus();
      // افتح القائمة إن لم تكن مفتوحة ولم يكن الحقل معطّلاً
      if (!disabled) setTimeout(() => openMenu(), 0);
    },
    focusOnly: () => btnRef.current?.focus(),
  }));

  const selectedLabel = options.find(o => o.value === value)?.label || "";
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => startsWithMatch(o.label, q)) : options;
  const exact = options.some(o => normalizeAr(o.label) === normalizeAr(q));
  const canAdd = !!onAdd && q.length > 0 && !exact;
  const totalItems = (canAdd ? 1 : 0) + filtered.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const target = e.target as Node;
      // القائمة مرسومة عبر portal إلى body، فلا تكفي wrapRef وحدها
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  // (تم حذف capture-listener القديم — القائمة الآن داخل شجرة DOM لا تتسرّب لـ Radix)

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setQuery(selectedLabel);
    const currentIndex = options.findIndex(o => o.value === value);
    setHighlight(currentIndex >= 0 ? currentIndex : 0);
    // input focus حصراً عبر useEffect بعد الـ commit — setTimeout(...,0) لا يضمن
    // أن inputRef.current صار مربوطاً (React 18 batching).
  };

  // بعد فتح القائمة وضمان mount للـ input، ركّز عليه وحدّد نصه.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.select(); }
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const closeAndFocus = (advance = false) => {
    setOpen(false);
    if (advance && onNavigateNext) {
      setTimeout(() => onNavigateNext(), 0);
    } else {
      setTimeout(() => btnRef.current?.focus(), 0);
    }
  };

  const doAdd = async () => {
    if (!onAdd || !query.trim()) return;
    setAdding(true);
    try {
      const newId = await onAdd(query.trim());
      if (newId) onChange(newId);
      closeAndFocus(true);
    } catch (e: any) {
      alert(e?.message || "فشل الإضافة");
    } finally {
      setAdding(false);
    }
  };

  const commitHighlighted = () => {
    if (selectAllOnEnter && onSelectAll) {
      onSelectAll(options.map(o => o.value));
      return true;
    }
    if (canAdd && highlight === 0) return false; // Add يتطلّب await — لا يُعالَج هنا
    const idx = canAdd ? highlight - 1 : highlight;
    const opt = filtered[idx];
    if (opt) { onChange(opt.value); return true; }
    return false;
  };

  const handleMenuKey = async (e: React.KeyboardEvent) => {
    if (!open) return;
    if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab", "Backspace"].includes(e.key)) {
      e.stopPropagation();
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(Math.max(0, totalItems - 1), h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)); }
    else if (e.key === "Escape") { e.preventDefault(); closeAndFocus(false); }
    else if (e.key === "Backspace" && query === "") { e.preventDefault(); closeAndFocus(false); }
    else if (e.key === "Tab") {
      // Tab يختار المُبرَز (إن وُجد) ثم يُغلق القائمة ويترك المتصفح ينقل الفوكس
      // طبيعياً إلى الحقل التالي/السابق — بدلاً من أن يعلق داخل أزرار القائمة.
      commitHighlighted();
      setOpen(false);
      // لا preventDefault — نسمح للـ Tab أن ينقل الفوكس
    }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (selectAllOnEnter && onSelectAll) {
        const allValues = options.map(o => o.value);
        onSelectAll(allValues);
        closeAndFocus(true);
      } else if (canAdd && highlight === 0) {
        await doAdd();
      } else {
        const idx = canAdd ? highlight - 1 : highlight;
        const opt = filtered[idx];
        if (opt) { onChange(opt.value); closeAndFocus(true); }
      }
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`relative ${open ? "ring-2 ring-primary bg-primary/10" : ""}`}
      style={{ width: "100%", height: "100%" }}
    >
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onFocus={() => {
          // Radix Dialog's FocusScope يعيد الفوكس للزر لأن القائمة portaled خارج
          // DialogContent — نعيد توجيه الفوكس للـ input بعد تأخير يتجاوز مسروق
          // FocusScope (يعمل عبر microtask/rAF).
          if (open) {
            setTimeout(() => inputRef.current?.focus(), 60);
          }
        }}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Enter" && value && onNavigateNext) onNavigateNext();
            else openMenu();
          }
        }}
        className={className || "bg-transparent border-0 outline-none px-1 text-[11px] w-full h-full text-right truncate"}
        style={{ background: "transparent" }}
        title={title}
      >
        {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
      </button>
      {open && (() => {
        const rect = btnRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const desiredWidth = isMobile ? Math.min(vw - 16, 360) : Math.max(rect.width, 240);
        // Clamp horizontally inside viewport (RTL: anchor by right edge of trigger)
        const rightEdge = vw - rect.right;
        const rightOffset = Math.max(8, Math.min(rightEdge, vw - desiredWidth - 8));
        // Decide direction by available space (open up if not enough below)
        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;
        const menuMax = isMobile ? Math.min(vh * 0.7, 420) : 320;
        const openUp = spaceBelow < menuMax && spaceAbove > spaceBelow;
        const style: React.CSSProperties = {
          position: "fixed",
          ...(openUp
            ? { bottom: vh - rect.top + 4 }
            : { top: rect.bottom + 4 }),
          right: rightOffset,
          width: desiredWidth,
          maxWidth: `calc(100vw - 16px)`,
          maxHeight: menuMax,
          zIndex: 10000, // above Radix Dialog (z-50) and any overlay
          // Radix Dialog sets `body { pointer-events: none }` while open and
          // `pointer-events` IS inherited. Since this menu is portaled to
          // <body>, we must re-enable pointer events explicitly — otherwise
          // mouse clicks fall through to the dialog footer below.
          pointerEvents: "auto",
        };
        const menu = (
          <div
            ref={menuRef}
            className="bg-popover text-popover-foreground border border-border rounded-lg shadow-xl overflow-hidden flex flex-col"
            style={style}
            onKeyDown={handleMenuKey}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              placeholder="ابحث أو اكتب اسم جديد..."
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              className="w-full bg-background border-b border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:bg-background"
              dir="rtl"
            />
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {canAdd && (
                <button
                  type="button"
                  onClick={doAdd}
                  disabled={adding}
                  onMouseEnter={() => setHighlight(0)}
                  className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-2 border-b border-border ${highlight === 0 ? "bg-primary/15" : "hover:bg-muted"}`}
                >
                  <span className="text-primary font-bold text-base">＋</span>
                  <span className="truncate">{adding ? "جاري الإضافة..." : `${addLabel || "إضافة"}: "${query.trim()}"`}</span>
                </button>
              )}
              {filtered.length === 0 && !canAdd && (
                <div className="px-3 py-3 text-sm text-muted-foreground text-center">لا نتائج</div>
              )}
              {filtered.map((o, i) => {
                const idx = canAdd ? i + 1 : i;
                const canDelete = showDeleteButton || (onDelete && o.value === value);
                return (
                  <div
                    key={o.value}
                    className={`flex items-center ${idx === highlight ? "bg-primary/15" : "hover:bg-muted"}`}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <button
                      type="button"
                      onClick={() => { onChange(o.value); closeAndFocus(true); }}
                      className={`flex-1 text-right px-3 py-2.5 text-sm truncate ${o.value === value ? "font-semibold text-primary" : ""}`}
                    >
                      {o.label}
                    </button>
                    {canDelete && onDelete && (
                      <button
                        type="button"
                        title="حذف"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const msg = deleteConfirm ? deleteConfirm(o) : `حذف "${o.label}"؟`;
                          if (!window.confirm(msg)) return;
                          const ok = await onDelete(o);
                          if (ok && o.value === value) onChange("");
                        }}
                        className="px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
        // Portal to body so the menu escapes any ancestor with `transform`
        // (Radix Dialog wraps content in translate(-50%,-50%) which would otherwise
        //  trap our position:fixed inside the dialog box and misplace the menu).
        return typeof document !== "undefined"
          ? createPortal(menu, document.body)
          : menu;
      })()}
    </div>
  );
});

export default InlineSearchSelect;
