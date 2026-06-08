import { useState, useRef, useEffect, useCallback } from "react";
import { startsWithMatch } from "@/utils/searchMatch";

interface Option {
  id: string;
  name: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  icon?: string;
  /** inline style overrides for the trigger */
  style?: React.CSSProperties;
  /** optional className for the trigger */
  className?: string;
  /** Whether to highlight when a value is selected */
  highlight?: boolean;
}

/**
 * Lightweight searchable select dropdown.
 * Shows a text input for filtering + a scrollable list.
 * Designed for use inside grids/tables where heavyweight Popover components are impractical.
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "اختر...",
  icon,
  style,
  className,
  highlight,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  // Normalise Arabic text for matching
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ")
      .trim();

  const filtered = search.trim()
    ? options.filter((o) => normalize(o.name).includes(normalize(search)))
    : options;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  // Auto-focus the search input when the dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setSearch("");
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  // Computed styles
  const hasValue = value.length > 0;
  const triggerBorder = highlight && hasValue ? "2px solid #7c3aed" : "1px solid hsl(var(--border))";
  const triggerShadow = highlight && hasValue ? "0 0 0 3px rgba(124, 58, 237, 0.15)" : "none";

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }} className={className}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          height: 34,
          borderRadius: 8,
          fontSize: 11,
          padding: "0 10px",
          border: triggerBorder,
          background: "hsl(var(--card))",
          boxShadow: triggerShadow,
          outline: "none",
          fontWeight: 500,
          textAlign: "right",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          color: hasValue ? "inherit" : "hsl(var(--muted-foreground))",
        }}
      >
        {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <span style={{ fontSize: 8, opacity: 0.5, flexShrink: 0 }}>▼</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 9999,
            marginTop: 4,
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
            overflow: "hidden",
            minWidth: 180,
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div style={{ padding: "6px 8px", borderBottom: "1px solid hsl(var(--border))" }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 بحث..."
              style={{
                width: "100%",
                height: 30,
                fontSize: 11,
                padding: "0 8px",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                background: "hsl(var(--muted))",
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered.length === 1) {
                  handleSelect(filtered[0].id);
                }
              }}
            />
          </div>

          {/* Options list */}
          <div
            ref={listRef}
            style={{
              maxHeight: 200,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {/* Clear option */}
            <div
              onClick={() => handleSelect("")}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                cursor: "pointer",
                color: "hsl(var(--muted-foreground))",
                borderBottom: "1px solid hsl(var(--border))",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "hsl(var(--accent))";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
              }}
            >
              {placeholder}
            </div>
            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "12px",
                  textAlign: "center",
                  fontSize: 11,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                لا توجد نتائج
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.id === value;
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    style={{
                      padding: "6px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      fontWeight: isSelected ? 700 : 400,
                      background: isSelected ? "hsl(var(--accent))" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "hsl(var(--accent))";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                    }}
                  >
                    {isSelected && <span style={{ color: "#7c3aed" }}>✓</span>}
                    <span>{opt.name}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
