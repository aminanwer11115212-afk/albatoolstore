import { Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { startsWithMatch } from "@/utils/searchMatch";

type Item = { id: string; name: string };

type Props = {
  label: string;
  items: Item[];
  value: string | null;
  onChange: (id: string) => void;
  onAdd?: () => void;
  disabled?: boolean;
  emptyHint?: string;
  filter?: string;
};

export default function LocationChips({ label, items, value, onChange, onAdd, disabled, emptyHint, filter }: Props) {
  const listboxId = useId();
  const optionId = (id: string) => `${listboxId}-opt-${id}`;

  const filtered = useMemo(() => {
    const q = (filter || "").trim();
    if (!q) return items;
    try {
      return items.filter(it => startsWithMatch(it.name, q) || it.name.includes(q));
    } catch {
      return items.filter(it => it.name.includes(q));
    }
  }, [items, filter]);

  const [activeIdx, setActiveIdx] = useState<number>(() => {
    const i = filtered.findIndex(it => it.id === value);
    return i >= 0 ? i : (filtered.length > 0 ? 0 : -1);
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // إعادة ضبط active عند تغيّر البحث/العناصر
    if (filtered.length === 0) { setActiveIdx(-1); return; }
    const i = filtered.findIndex(it => it.id === value);
    setActiveIdx(i >= 0 ? i : 0);
  }, [filter, items.length, value, filtered]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (filtered.length === 0) return;
    const len = filtered.length;
    let next = activeIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (activeIdx + 1) % len;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (activeIdx - 1 + len) % len;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = len - 1;
    else if (e.key === "Enter" || e.key === " ") {
      if (activeIdx >= 0) { e.preventDefault(); onChange(filtered[activeIdx].id); }
      return;
    } else return;
    e.preventDefault();
    setActiveIdx(next);
    // Scroll إلى العنصر النشط
    const activeEl = containerRef.current?.querySelector<HTMLButtonElement>(
      `#${CSS.escape(optionId(filtered[next].id))}`,
    );
    activeEl?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  const activeDescId = activeIdx >= 0 && filtered[activeIdx] ? optionId(filtered[activeIdx].id) : undefined;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground" id={`${listboxId}-label`}>
          {label}
          <span
            className="mx-1 text-[10px] text-primary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {filter && filtered.length !== items.length ? `(${filtered.length}/${items.length})` : ""}
          </span>
        </div>
        {onAdd && (
          <button
            type="button"
            disabled={disabled}
            onClick={onAdd}
            className="text-xs text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Plus size={12} /> إضافة
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2" role="status" aria-live="polite">
          {filter ? "لا نتائج مطابقة" : (emptyHint || "لا توجد عناصر")}
        </div>
      ) : (
        <div
          ref={containerRef}
          role="listbox"
          tabIndex={0}
          aria-labelledby={`${listboxId}-label`}
          aria-activedescendant={activeDescId}
          onKeyDown={onKeyDown}
          className="flex flex-wrap gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md p-0.5"
        >
          {filtered.map((it, i) => {
            const active = value === it.id;
            const isActiveDesc = i === activeIdx;
            return (
              <button
                key={it.id}
                id={optionId(it.id)}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                onClick={() => { setActiveIdx(i); onChange(it.id); }}
                title={it.name}
                className={[
                  "px-3 py-1.5 rounded-full text-sm border transition-all duration-200 hover-scale animate-fade-in",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-foreground border-border hover:border-primary/60 hover:bg-accent",
                  isActiveDesc && !active ? "ring-2 ring-primary/50" : "",
                ].join(" ")}
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "both" }}
              >
                {it.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
