import { useEffect, useState, useCallback } from "react";
import { RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Floating "Reset column widths" button.
 *
 * Scans localStorage for any keys saved by `useColumnWidths` (their hallmarks
 * are: a `:userResized` flag exists, OR the value is a JSON array of
 * numbers/nulls and the key matches one of our known suffixes).
 *
 * Renders a small icon-only floating button at the bottom-right that opens a
 * popover listing every table whose columns have been customised, with an
 * individual "Reset" action per table and a "Reset all" footer action.
 *
 * Toggle visibility with localStorage flag `colwidths:resetBtn` = "0" to hide.
 * Hidden by default; press Ctrl+Shift+R to enable, or call
 * localStorage.setItem("colwidths:resetBtn","1") manually.
 */

const ENABLED_KEY = "colwidths:resetBtn";
const SHARED_UPDATE_EVENT = "colwidths-shared-update";

type Entry = {
  storageKey: string;
  label: string;
  customCount: number; // how many widths are non-null
  totalCount: number;
  userResized: boolean;
};

// Friendly labels for known storage keys.
function labelFor(key: string): string {
  if (key === "shared:itemsTable:colWidths:v1") return "جدول البنود (عرض/فاتورة/شراء/مرتجع)";
  if (key === "dashboard:recentInvoices:colWidths:v1") return "آخر الفواتير (لوحة التحكم)";
  if (key.startsWith("recent-sidebar:cols:")) {
    const type = key.split(":")[2] ?? "?";
    const map: Record<string, string> = {
      invoice: "آخر الفواتير (الشريط)",
      quote: "آخر عروض الأسعار (الشريط)",
      purchase: "آخر المشتريات (الشريط)",
      "stock-return": "آخر مرتجعات المخزون (الشريط)",
    };
    return map[type] ?? `الشريط الجانبي · ${type}`;
  }
  return key;
}

function parseWidthsArray(raw: string | null): (number | null)[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return null;
    if (!v.every((x) => x === null || (typeof x === "number" && isFinite(x)))) return null;
    return v;
  } catch {
    return null;
  }
}

function readEnabled(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function scanEntries(): Entry[] {
  if (typeof window === "undefined") return [];
  const out: Entry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // Only consider keys that look like our column-widths storage.
      const isOurKey =
        key === "shared:itemsTable:colWidths:v1" ||
        key.endsWith(":colWidths:v1") ||
        key.startsWith("recent-sidebar:cols:");
      if (!isOurKey) continue;
      if (key.endsWith(":userResized")) continue;
      const arr = parseWidthsArray(localStorage.getItem(key));
      if (!arr) continue;
      const customCount = arr.filter((x) => typeof x === "number").length;
      const userResized = localStorage.getItem(key + ":userResized") === "1";
      // Only show entries the user has actually touched.
      if (customCount === 0 && !userResized) continue;
      out.push({
        storageKey: key,
        label: labelFor(key),
        customCount,
        totalCount: arr.length,
        userResized,
      });
    }
  } catch { /* noop */ }
  out.sort((a, b) => a.label.localeCompare(b.label, "ar"));
  return out;
}

function resetSingle(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(storageKey + ":userResized");
    // Notify any mounted useColumnWidths instances on this same key.
    window.dispatchEvent(new CustomEvent(SHARED_UPDATE_EVENT, {
      detail: { key: storageKey, widths: [] },
    }));
    // Also clear any pinned table width left on the DOM.
    document.querySelectorAll<HTMLTableElement>('table[data-colwidths-pinned="1"]').forEach((tbl) => {
      tbl.style.width = "";
      tbl.style.maxWidth = "";
      tbl.style.minWidth = "";
      delete tbl.dataset.colwidthsPinned;
    });
  } catch { /* noop */ }
}

export function ColumnsResetFloatingButton() {
  const [enabled, setEnabled] = useState<boolean>(() => readEnabled());
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  // Toggle with Ctrl+Shift+R (Reset).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        const next = !readEnabled();
        try { localStorage.setItem(ENABLED_KEY, next ? "1" : "0"); } catch { /* noop */ }
        setEnabled(next);
        toast.success(next
          ? "تم تفعيل زر إعادة أعرض الأعمدة"
          : "تم إخفاء زر إعادة أعرض الأعمدة");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Refresh entries when popover opens, and on storage events.
  const refresh = useCallback(() => setEntries(scanEntries()), []);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const onStorage = () => refresh();
    const onCustom = () => refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(SHARED_UPDATE_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SHARED_UPDATE_EVENT, onCustom);
    };
  }, [enabled, refresh, open]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        insetInlineEnd: 12,
        zIndex: 99998,
      }}
    >
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) refresh(); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="إعادة أعرض الأعمدة · Ctrl+Shift+R لإخفاء/إظهار"
            aria-label="إعادة أعرض الأعمدة"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "hsl(var(--primary))",
              color: "hsl(var(--primary-foreground))",
              border: "none",
              boxShadow: "0 6px 18px hsl(var(--primary) / 0.35)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-80 p-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-sm font-semibold">إعادة أعرض الأعمدة</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="إغلاق"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {entries.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              لا توجد جداول مخصّصة حالياً.
            </div>
          ) : (
            <>
              <ul className="max-h-72 overflow-auto divide-y divide-border">
                {entries.map((e) => (
                  <li
                    key={e.storageKey}
                    className="flex items-center gap-2 px-1 py-1.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{e.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate" dir="ltr">
                        {e.customCount}/{e.totalCount} عمود مخصّص
                        {e.userResized ? " · مُثبَّت" : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background hover:bg-accent hover:text-accent-foreground px-2 py-1 text-[11px] transition-colors"
                      onClick={() => {
                        resetSingle(e.storageKey);
                        toast.success(`تمت إعادة "${e.label}" للافتراضي`);
                        refresh();
                      }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      إعادة
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                <button
                  type="button"
                  className="text-xs text-destructive hover:underline"
                  onClick={() => {
                    entries.forEach((e) => resetSingle(e.storageKey));
                    toast.success("تمت إعادة جميع الجداول للافتراضي");
                    refresh();
                  }}
                >
                  إعادة الكل
                </button>
                <span className="text-[10px] text-muted-foreground">
                  Ctrl+Shift+R للإخفاء
                </span>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
