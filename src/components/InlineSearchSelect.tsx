import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
  onRename?: (opt: InlineOption, newName: string) => Promise<boolean> | boolean;
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
  /** تخطي رسالة التأكيد الافتراضية — يستخدم عندما يعرض الأب حوار تأكيد ذكياً */
  skipDeleteConfirm?: boolean;
}

const InlineSearchSelect = forwardRef<InlineSearchSelectHandle, Props>(function InlineSearchSelect({
  value, options, onChange, onAdd, onDelete, onRename, deleteConfirm, placeholder = "—",
  disabled, className, title, addLabel, onNavigateNext, selectAllOnEnter, onSelectAll, showDeleteButton, skipDeleteConfirm,
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
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    const onDoc = (e: Event) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    // على الموبايل: نعتمد على النقر على overlay داخل الـ sheet لإغلاق القائمة.
    // نتجنّب document.touchstart لأنه يُغلق بأدنى لمسة أثناء إظهار/إخفاء الكيبورد
    // فيُلغي كل النص المكتوب. desktop يبقى بسلوكه الحالي.
    document.addEventListener("mousedown", onDoc);
    if (!isMobile) document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  // (تم حذف capture-listener القديم — القائمة الآن داخل شجرة DOM لا تتسرّب لـ Radix)

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    // نبدأ ببحث فارغ — لا نُعبّئه بالقيمة الحالية حتى لا تلتصق الكتابة الجديدة
    // بالنص القديم على الموبايل ويصبح «+ إضافة» غير مرئي.
    setQuery("");
    const currentIndex = options.findIndex(o => o.value === value);
    setHighlight(currentIndex >= 0 ? currentIndex : 0);
  };

  // عند فتح القائمة نُركّز حقل البحث الداخلي حتى تظهر لوحة المفاتيح مباشرة
  // ويستطيع المستخدم الكتابة/الإضافة دون نقرة ثانية.
  useEffect(() => {
    if (!open) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        try {
          inputRef.current?.focus({ preventScroll: true });
        } catch { /* ignore */ }
      });
      (raf1 as unknown as { _r2?: number })._r2 = raf2;
    });
    return () => {
      cancelAnimationFrame(raf1);
      const r2 = (raf1 as unknown as { _r2?: number })._r2;
      if (r2) cancelAnimationFrame(r2);
    };
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
        onKeyDown={(e) => {
          // القائمة مفتوحة والفوكس بقي على الزر (Radix FocusScope داخل Dialog
          // يعيد الفوكس هنا لأن القائمة portaled خارج DialogContent). لذا
          // نعالج مفاتيح الملاحة والكتابة على الزر مباشرة.
          if (open) {
            if (["ArrowDown","ArrowUp","Enter","Escape","Tab","Backspace"].includes(e.key)) {
              e.stopPropagation();
            }
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(Math.max(0, totalItems - 1), h + 1)); return; }
            if (e.key === "ArrowUp")   { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)); return; }
            if (e.key === "Escape")    { e.preventDefault(); closeAndFocus(false); return; }
            if (e.key === "Backspace") {
              e.preventDefault();
              if (query.length === 0) closeAndFocus(false);
              else { setQuery(q => q.slice(0, -1)); setHighlight(0); }
              return;
            }
            if (e.key === "Tab") {
              commitHighlighted();
              setOpen(false);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (selectAllOnEnter && onSelectAll) {
                onSelectAll(options.map(o => o.value));
                closeAndFocus(true);
              } else if (canAdd && highlight === 0) {
                doAdd();
              } else {
                const i2 = canAdd ? highlight - 1 : highlight;
                const opt = filtered[i2];
                if (opt) { onChange(opt.value); closeAndFocus(true); }
              }
              return;
            }
            // كتابة أحرف عادية أو أرقام → أضف إلى query
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              setQuery(q => q + e.key);
              setHighlight(0);
              return;
            }
            return;
          }
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
        const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
        const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
        const vh = typeof window !== "undefined" ? window.innerHeight : 768;

        // ─── محتوى القائمة (مشترك بين الموبايل والديسكتوب) ───
        const listBody = (
          <>
            {canAdd && (
              <button
                type="button"
                onClick={doAdd}
                disabled={adding}
                onMouseEnter={() => setHighlight(0)}
                className={`w-full text-right px-3 flex items-center gap-2 border-b border-border ${isMobile ? "py-3 text-base" : "py-2.5 text-sm"} ${highlight === 0 ? "bg-primary/15" : "hover:bg-muted"}`}
              >
                <span className="text-primary font-bold text-lg">＋</span>
                <span className="truncate">{adding ? "جاري الإضافة..." : `${addLabel || "إضافة"}: "${query.trim()}"`}</span>
              </button>
            )}
            {filtered.length === 0 && !canAdd && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">لا نتائج</div>
            )}
            {filtered.map((o, i) => {
              const idx = canAdd ? i + 1 : i;
              const canDelete = !!onDelete && (showDeleteButton || onDelete);
              const canRename = !!onRename;
              return (
                <div
                  key={o.value}
                  className={`flex items-center ${idx === highlight ? "bg-primary/15" : "hover:bg-muted"}`}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  <button
                    type="button"
                    onClick={() => { onChange(o.value); closeAndFocus(true); }}
                    className={`flex-1 text-right px-3 truncate ${isMobile ? "py-3 text-base" : "py-2.5 text-sm"} ${o.value === value ? "font-semibold text-primary" : ""}`}
                  >
                    {o.label}
                  </button>
                  {canRename && onRename && (
                    <button
                      type="button"
                      title="تعديل الاسم"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const next = window.prompt(`تعديل اسم "${o.label}"`, o.label);
                        if (next == null) return;
                        const trimmed = next.trim();
                        if (!trimmed || trimmed === o.label) return;
                        await onRename(o, trimmed);
                      }}
                      className={`px-3 text-muted-foreground hover:text-primary hover:bg-primary/10 ${isMobile ? "py-3 text-base" : "py-2.5 text-sm"}`}
                    >
                      ✎
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      type="button"
                      title="حذف"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!skipDeleteConfirm) {
                          const msg = deleteConfirm ? deleteConfirm(o) : `حذف "${o.label}"؟`;
                          if (!window.confirm(msg)) return;
                        }
                        const ok = await onDelete(o);
                        if (ok && o.value === value) onChange("");
                      }}
                      className={`px-3 text-destructive hover:bg-destructive/10 ${isMobile ? "py-3 text-base" : "py-2.5 text-sm"}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </>
        );

        // ─── فرع الموبايل: Bottom Sheet ملء العرض ───
        if (isMobile) {
          return (
            <>
              {/* overlay خلفي — النقر عليه يُغلق فقط */}
              <div
                className="fixed inset-0 bg-black/50 animate-fade-in"
                style={{ zIndex: 9998, pointerEvents: "auto" }}
                onMouseDown={(e) => { e.stopPropagation(); setOpen(false); }}
                onTouchStart={(e) => { e.stopPropagation(); setOpen(false); }}
              />
              <div
                ref={menuRef}
                dir="rtl"
                className="fixed left-0 right-0 bottom-0 bg-popover text-popover-foreground rounded-t-2xl shadow-2xl flex flex-col animate-slide-in-right"
                style={{
                  zIndex: 9999,
                  maxHeight: "85vh",
                  pointerEvents: "auto",
                }}
                onKeyDown={handleMenuKey}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {/* مقبض السحب */}
                <div className="pt-2 pb-1 flex justify-center">
                  <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
                </div>
                {/* رأس ثابت: عنوان + إغلاق */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="text-sm font-semibold truncate">{title || placeholder}</span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted text-xl text-muted-foreground"
                    aria-label="إغلاق"
                  >
                    ✕
                  </button>
                </div>
                {/* حقل البحث */}
                <div className="p-3 border-b border-border">
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
                    placeholder="ابحث أو اكتب اسم جديد..."
                    onKeyDown={handleMenuKey}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    className="w-full bg-background border border-border rounded-lg px-3 py-3 text-base outline-none focus:ring-2 focus:ring-primary"
                    dir="rtl"
                  />
                </div>
                {/* القائمة */}
                <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                  {listBody}
                </div>
              </div>
            </>
          );
        }

        // ─── فرع الديسكتوب: popover عائم بجانب الزر (كما كان) ───
        const rect = btnRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const desiredWidth = Math.max(rect.width, 240);
        const rightEdge = vw - rect.right;
        const rightOffset = Math.max(8, Math.min(rightEdge, vw - desiredWidth - 8));
        const spaceBelow = vh - rect.bottom;
        const spaceAbove = rect.top;
        const menuMax = 320;
        const openUp = spaceBelow < menuMax && spaceAbove > spaceBelow;
        const style: React.CSSProperties = {
          position: "fixed",
          ...(openUp ? { bottom: vh - rect.top + 4 } : { top: rect.bottom + 4 }),
          right: rightOffset,
          width: desiredWidth,
          maxWidth: `calc(100vw - 16px)`,
          maxHeight: menuMax,
          zIndex: 10000,
          pointerEvents: "auto",
        };
        return (
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
              onKeyDown={handleMenuKey}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              className="w-full bg-background border-b border-border px-3 py-2.5 text-base sm:text-sm outline-none focus:bg-background"
              dir="rtl"
            />
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {listBody}
            </div>
          </div>
        );
      })()}
    </div>
  );

});

export default InlineSearchSelect;
