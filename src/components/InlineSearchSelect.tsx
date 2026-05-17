import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type InlineOption = { value: string; label: string };

export type InlineSearchSelectHandle = {
  focus: () => void;
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

  useImperativeHandle(ref, () => ({
    focus: () => btnRef.current?.focus(),
  }));

  const selectedLabel = options.find(o => o.value === value)?.label || "";
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  const exact = options.some(o => o.label.trim().toLowerCase() === q);
  const canAdd = !!onAdd && q.length > 0 && !exact;
  const totalItems = (canAdd ? 1 : 0) + filtered.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setQuery(selectedLabel);
    // تحديد الكلمة الحالية في القائمة
    const currentIndex = options.findIndex(o => o.value === value);
    setHighlight(currentIndex >= 0 ? currentIndex : 0);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
  };

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

  const handleMenuKey = async (e: React.KeyboardEvent) => {
    if (!open) return;
    if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab", "Backspace"].includes(e.key)) {
      e.stopPropagation();
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(Math.max(0, totalItems - 1), h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)); }
    else if (e.key === "Escape") { e.preventDefault(); closeAndFocus(false); }
    else if (e.key === "Backspace" && query === "") { e.preventDefault(); closeAndFocus(false); }
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
        const desiredWidth = isMobile ? Math.min(vw - 16, 360) : Math.max(rect.width, 220);
        // Clamp horizontally inside viewport (RTL: anchor by right)
        const rightOffset = Math.max(8, Math.min(vw - rect.right, vw - desiredWidth - 8));
        // If not enough space below, open upward
        const spaceBelow = vh - rect.bottom;
        const openUp = spaceBelow < 240 && rect.top > spaceBelow;
        const style: React.CSSProperties = {
          position: "fixed",
          ...(openUp
            ? { bottom: vh - rect.top + 2 }
            : { top: rect.bottom + 2 }),
          right: rightOffset,
          width: desiredWidth,
          maxWidth: `calc(100vw - 16px)`,
          zIndex: 9999,
        };
        return createPortal(
          <div
            className="bg-card border-2 border-primary rounded shadow-lg ring-2 ring-primary/40"
            style={style}
            onKeyDown={handleMenuKey}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
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
              className="w-full bg-background border-b border-border px-3 py-2 text-base sm:text-[11px] sm:px-2 sm:py-1 outline-none"
              dir="rtl"
            />
            <div className="max-h-[60vh] sm:max-h-48 overflow-y-auto overscroll-contain">
              {canAdd && (
                <button
                  type="button"
                  onClick={doAdd}
                  disabled={adding}
                  onMouseEnter={() => setHighlight(0)}
                  className={`w-full text-right px-3 py-2.5 sm:px-2 sm:py-1 text-sm sm:text-[11px] flex items-center gap-1 border-b border-border ${highlight === 0 ? "bg-primary/15" : "hover:bg-muted"}`}
                >
                  <span className="text-primary font-bold">＋</span>
                  <span className="truncate">{adding ? "جاري الإضافة..." : `${addLabel || "إضافة"}: "${query.trim()}"`}</span>
                </button>
              )}
              {filtered.length === 0 && !canAdd && (
                <div className="px-2 py-2 text-sm sm:text-[11px] text-muted-foreground text-center">لا نتائج</div>
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
                      className={`flex-1 text-right px-3 py-2.5 sm:px-2 sm:py-1 text-sm sm:text-[11px] truncate ${o.value === value ? "font-semibold text-primary" : ""}`}
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
                        className="px-3 py-2.5 sm:px-2 sm:py-1 text-sm sm:text-[11px] text-destructive hover:bg-destructive/10"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        );
      })()}
    </div>
  );
});

export default InlineSearchSelect;
