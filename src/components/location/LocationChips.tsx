import { Plus } from "lucide-react";

type Item = { id: string; name: string };

type Props = {
  label: string;
  items: Item[];
  value: string | null;
  onChange: (id: string) => void;
  onAdd?: () => void;
  disabled?: boolean;
  emptyHint?: string;
};

export default function LocationChips({ label, items, value, onChange, onAdd, disabled, emptyHint }: Props) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">{label}</div>
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
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">{emptyHint || "لا توجد عناصر"}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => {
            const active = value === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => onChange(it.id)}
                className={[
                  "px-3 py-1.5 rounded-full text-sm border transition-all duration-200 hover-scale animate-fade-in",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-foreground border-border hover:border-primary/60 hover:bg-accent",
                ].join(" ")}
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "both" }}
                aria-pressed={active}
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
