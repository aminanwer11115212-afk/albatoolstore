import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { userKey } from "@/lib/userScopedKey";
import { formFactorUserKey } from "@/lib/formFactorKey";

const SHARED_UPDATE_EVENT = "colwidths-shared-update";

/**
 * Per-screen + per-user + per-form-factor column-widths keys.
 *
 * Builds keys like:
 *   widths: lov:u:{uid}:ff:{ff}:cols:{screenId}:widths
 *   lock:   lov:u:{uid}:ff:{ff}:cols:{screenId}:locked
 *
 * On first read for a screen on desktop, silently copies values from the
 * pre-form-factor key `lov:u:{uid}:cols:{screenId}:widths` AND from the
 * legacy `SHARED_COLS_WIDTHS_KEY` so the user's existing layout is preserved.
 * Mobile starts clean (no inheritance) for a fresh phone experience.
 */
export function screenColWidthsKey(screenId: string): string {
  return formFactorUserKey("cols", `${screenId}:widths`);
}
export function screenColLockedKey(screenId: string): string {
  return formFactorUserKey("cols", `${screenId}:locked`);
}
export function migrateScreenColKeys(screenId: string) {
  if (typeof window === "undefined") return;
  try {
    const wKey = screenColWidthsKey(screenId);
    if (localStorage.getItem(wKey) === null && wKey.includes(":ff:desktop:")) {
      const legacy = localStorage.getItem("shared:itemsTable:colWidths:v1");
      if (legacy) localStorage.setItem(wKey, legacy);
    }
    const lKey = screenColLockedKey(screenId);
    if (localStorage.getItem(lKey) === null && lKey.includes(":ff:desktop:")) {
      const legacy = localStorage.getItem("shared:itemsTable:colsLocked:v1");
      if (legacy === "true" || legacy === "false") localStorage.setItem(lKey, legacy);
    }
  } catch { /* noop */ }
}


/**
 * Persisted column widths (in pixels) for resizable tables.
 *
 * If multiple pages pass the same `storageKey`, they share widths across
 * pages and tabs. Lengths may differ between pages — the hook pads/truncates
 * the persisted array to the current page's `defaults.length` on read, and
 * preserves extra trailing entries (from longer pages) on write.
 *
 * Pass `locked: true` to disable all resize interactions.
 */
export function useColumnWidths(
  storageKey: string,
  defaults: (number | null)[],
  locked: boolean = false
) {
  const minFor = useCallback(
    (index: number) => {
      const d = defaults[index];
      if (typeof d !== "number") return 16;
      // الحد الأدنى لعمود مقاس هو defaults[i] نفسه (لا نسمح بالانكماش تحت التصميم)،
      // ولكن نُقيّده بسقف 60px حتى لا يُقفل عمود عريض من الانكماش عند ضيق الشاشة.
      return Math.min(d, 60);
    },
    [defaults]
  );

  const readFromStorage = useCallback((): (number | null)[] => {
    const initial: (number | null)[] = defaults.map(() => null);
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as (number | null)[];
      if (!Array.isArray(parsed)) return initial;
      // Pad / truncate to defaults.length, validating each entry.
      return defaults.map((_, i) => {
        const v = parsed[i];
        const floor = minFor(i);
        return typeof v === "number" && isFinite(v) && v >= floor ? v : null;
      });
    } catch {
      return initial;
    }
  }, [defaults, storageKey, minFor]);

  const [widths, setWidths] = useState<(number | null)[]>(() => readFromStorage());

  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  // Persist on change. Merge with any longer existing array so other pages
  // (with more columns) don't lose their extra trailing entries.
  useEffect(() => {
    try {
      let merged: (number | null)[] = widths.slice();
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const prev = JSON.parse(raw) as (number | null)[];
        if (Array.isArray(prev) && prev.length > widths.length) {
          merged = widths.concat(prev.slice(widths.length));
        }
      }
      const serialized = JSON.stringify(merged);
      const before = localStorage.getItem(storageKey);
      localStorage.setItem(storageKey, serialized);
      if (before !== serialized && typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SHARED_UPDATE_EVENT, {
            detail: { key: storageKey, widths: merged },
          })
        );
      }
    } catch {
      /* noop */
    }
  }, [widths, storageKey]);

  // Listen for changes from other tabs (storage event) and same tab (custom event).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const next = readFromStorage();
      // Avoid setting if equal.
      const cur = widthsRef.current;
      if (next.length === cur.length && next.every((v, i) => v === cur[i])) return;
      setWidths(next);
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      if (!detail || detail.key !== storageKey) return;
      const next = readFromStorage();
      const cur = widthsRef.current;
      if (next.length === cur.length && next.every((v, i) => v === cur[i])) return;
      setWidths(next);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SHARED_UPDATE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SHARED_UPDATE_EVENT, onCustom as EventListener);
    };
  }, [storageKey, readFromStorage]);

  // Track the actual <table> element so we can pin its width to the
  // sum of column widths after a drag (preventing CSS auto-redistribution).
  const tableElRef = useRef<HTMLTableElement | null>(null);

  const startDrag = useCallback((index: number, e: React.MouseEvent | MouseEvent | React.PointerEvent | PointerEvent) => {
    if (lockedRef.current) return;
    e.preventDefault();
    if ("stopPropagation" in e) e.stopPropagation();
    const startX = (e as PointerEvent).clientX;
    const pointerId = (e as PointerEvent).pointerId;
    const handleEl = (e as PointerEvent).target as HTMLElement | null;
    // Capture pointer so we keep getting events even if finger drifts off the handle.
    try {
      if (handleEl && typeof pointerId === "number" && (handleEl as any).setPointerCapture) {
        (handleEl as any).setPointerCapture(pointerId);
      }
    } catch { /* noop */ }

    // Excel/Access-style: ONLY the dragged column changes.
    const tableEl = (handleEl?.closest?.("table") as HTMLTableElement | null) ?? null;
    const headerCells = tableEl
      ? (Array.from(tableEl.querySelectorAll("thead th")) as HTMLTableCellElement[])
      : [];
    const measured: (number | null)[] = defaults.map((_, i) => {
      const cell = headerCells[i];
      if (!cell) return widthsRef.current[i] ?? null;
      const w = Math.round(cell.getBoundingClientRect().width);
      return w > 0 ? w : (widthsRef.current[i] ?? null);
    });

    const startW = (
      typeof widthsRef.current[index] === "number"
        ? widthsRef.current[index]
        : (typeof measured[index] === "number"
          ? measured[index]
          : (typeof defaults[index] === "number" ? defaults[index] : 100))
    ) as number;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Block touch scroll/zoom while dragging on touch devices.
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.touchAction = "none";
    document.body.setAttribute("data-resizing-col", String(index + 1));

    const pinTableWidth = (cols: (number | null)[]) => {
      if (!tableEl) return;
      let sum = 0;
      for (let i = 0; i < cols.length; i++) {
        const v = cols[i];
        const m = measured[i];
        sum += typeof v === "number" ? v : (typeof m === "number" ? m : (defaults[i] as number) || 100);
      }
      if (sum <= 0) return;
      tableEl.style.width = sum + "px";
      tableEl.style.maxWidth = "none";
      tableEl.style.minWidth = sum + "px";
      tableEl.dataset.colwidthsPinned = "1";
    };

    const floor = minFor(index);

    const beforeSnapshot: (number | null)[] = widthsRef.current.map((v, i) => {
      if (typeof v === "number") return v;
      const m = measured[i];
      return typeof m === "number" ? m : null;
    });

    setWidths((prev) => {
      const arr = prev.slice();
      for (let i = 0; i < arr.length; i++) {
        if (i === index) continue;
        if (typeof arr[i] !== "number" && typeof measured[i] === "number") {
          arr[i] = measured[i];
        }
      }
      return arr;
    });

    const snapshotTablePin = () => {
      if (!tableEl) return { pinned: false, width: "", inlineWidth: "" };
      return {
        pinned: tableEl.dataset.colwidthsPinned === "1",
        width: tableEl.style.width || "",
        inlineWidth: tableEl.getAttribute("style") || "",
      };
    };
    const initialPin = snapshotTablePin();

    try {
      window.dispatchEvent(new CustomEvent("colwidths-debug-start", {
        detail: { storageKey, index, startW, before: beforeSnapshot, initialPin },
      }));
    } catch { /* noop */ }

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const isRtl = document.documentElement.dir === "rtl" || document.body.dir === "rtl";
      // On coarse pointers, apply a small dead-zone to prevent jitter, and a
      // sub-pixel snap so dragging feels smoother on touch.
      const isCoarse = (ev as any).pointerType === "touch" || (ev as any).pointerType === "pen";
      const raw = startW + (isRtl ? -dx : dx);
      const next = Math.max(floor, Math.round(isCoarse ? raw : raw));
      setWidths((prev) => {
        const arr = prev.slice();
        arr[index] = next;
        try {
          const pin = snapshotTablePin();
          window.dispatchEvent(new CustomEvent("colwidths-debug-move", {
            detail: {
              storageKey, index, dx, widths: arr.slice(),
              tablePinned: pin.pinned,
              tableWidth: pin.width,
              pinChangedDuringDrag:
                pin.pinned !== initialPin.pinned || pin.width !== initialPin.width,
            },
          }));
        } catch { /* noop */ }
        return arr;
      });
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.touchAction = prevTouchAction;
      document.body.removeAttribute("data-resizing-col");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      try {
        if (handleEl && typeof pointerId === "number" && (handleEl as any).releasePointerCapture) {
          (handleEl as any).releasePointerCapture(pointerId);
        }
      } catch { /* noop */ }

      const beforePinUp = snapshotTablePin();
      try {
        localStorage.setItem(storageKey + ":userResized", "1");
      } catch { /* noop */ }
      pinTableWidth(widthsRef.current);
      const afterPinUp = snapshotTablePin();
      let expectedSum = 0;
      for (let i = 0; i < widthsRef.current.length; i++) {
        const v = widthsRef.current[i];
        const m = measured[i];
        expectedSum += typeof v === "number" ? v : (typeof m === "number" ? m : (defaults[i] as number) || 100);
      }
      try {
        window.dispatchEvent(new CustomEvent("colwidths-debug-end", {
          detail: {
            storageKey, index, final: widthsRef.current.slice(),
            initialPin,
            beforePinUp,
            afterPinUp,
            expectedSum,
          },
        }));
      } catch { /* noop */ }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [defaults, minFor, storageKey]);

  const reset = useCallback(() => {
    // Check if user has a personal default saved.
    const userDefaultKey = storageKey + ":userDefault";
    let userDefaults: (number | null)[] | null = null;
    try {
      const raw = localStorage.getItem(userDefaultKey);
      if (raw) {
        const parsed = JSON.parse(raw) as (number | null)[];
        if (Array.isArray(parsed)) userDefaults = parsed;
      }
    } catch { /* noop */ }

    // Clear current widths and userResized flag.
    try {
      localStorage.removeItem(storageKey + ":userResized");
      if (userDefaults) {
        // Restore user's personal default instead of system default.
        localStorage.setItem(storageKey, JSON.stringify(userDefaults));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch { /* noop */ }

    const tbl = tableElRef.current;
    if (tbl && tbl.dataset.colwidthsPinned === "1") {
      tbl.style.width = "";
      tbl.style.maxWidth = "";
      tbl.style.minWidth = "";
      delete tbl.dataset.colwidthsPinned;
    }

    const nextWidths = userDefaults ?? defaults.map(() => null);
    setWidths(nextWidths);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SHARED_UPDATE_EVENT, {
          detail: { key: storageKey, widths: nextWidths },
        }));
      }
    } catch { /* noop */ }
  }, [defaults, storageKey]);

  /**
   * Save current widths as the user's personal default.
   * Next time `reset()` is called, these widths are restored instead of system defaults.
   */
  const saveAsUserDefault = useCallback(() => {
    const userDefaultKey = storageKey + ":userDefault";
    try {
      // Snapshot current rendered widths (use measured DOM if null).
      const tbl = tableElRef.current;
      const cells = tbl ? Array.from(tbl.querySelectorAll("thead th")) as HTMLTableCellElement[] : [];
      const snapshot = widthsRef.current.map((v, i) => {
        if (typeof v === "number") return v;
        const cell = cells[i];
        if (cell) {
          const w = Math.round(cell.getBoundingClientRect().width);
          if (w > 0) return w;
        }
        return typeof defaults[i] === "number" ? defaults[i] : null;
      });
      localStorage.setItem(userDefaultKey, JSON.stringify(snapshot));
    } catch { /* noop */ }
  }, [storageKey, defaults]);

  /**
   * Clear user-specific default, reverting reset() to system defaults.
   */
  const clearUserDefault = useCallback(() => {
    try { localStorage.removeItem(storageKey + ":userDefault"); } catch { /* noop */ }
  }, [storageKey]);

  /**
   * Returns true if the user has saved a personal default for this table.
   */
  const hasUserDefault = useCallback((): boolean => {
    try { return localStorage.getItem(storageKey + ":userDefault") !== null; } catch { return false; }
  }, [storageKey]);

  /**
   * Clamp current widths so the table fits inside `containerWidth` (px).
   * - Fixed columns (defaults[i] is a number) shrink proportionally.
   * - Flexible columns (defaults[i] is null) reserve a min of 60px.
   * - Each fixed column respects its own minimum (`minFor(i)`).
   * - Returns true if any width changed.
   *
   * When `persist` is false (e.g. locked mode), the in-memory widths still
   * update so the layout fits, but no localStorage write happens because
   * the persist effect already merges before writing — to truly avoid
   * persistence in locked mode, callers should skip calling clamp when
   * locked, OR accept that the clamped values become the new saved state.
   * To keep saved values intact while locked, we expose a `dryRun` flag
   * that returns the would-be widths without calling setWidths.
   */
  const clampWidthsToContainer = useCallback(
    (containerWidth: number, opts?: { dryRun?: boolean; scrollbarBuffer?: number }) => {
      if (!isFinite(containerWidth) || containerWidth <= 0) return false;
      // Excel/Access-style: once the user has manually resized any column
      // for this storage key, never auto-redistribute. Let horizontal
      // scrolling handle overflow instead.
      try {
        if (typeof window !== "undefined" &&
            localStorage.getItem(storageKey + ":userResized") === "1") {
          return false;
        }
      } catch { /* noop */ }
      const buffer = opts?.scrollbarBuffer ?? 2;
      const available = Math.max(0, containerWidth - buffer);
      const cur = widthsRef.current;
      const FLEX_MIN = 24;

      // Compute current effective widths.
      const effective = defaults.map((d, i) => {
        if (d === null) return FLEX_MIN; // flex column reserves min only
        const v = cur[i];
        return typeof v === "number" ? v : (d as number);
      });
      const total = effective.reduce((a, b) => a + b, 0);
      if (total <= available) return false;

      // Need to shrink fixed columns by (total - available).
      const overflow = total - available;
      // Sum of shrinkable headroom on fixed cols.
      const headrooms = defaults.map((d, i) => {
        if (d === null) return 0;
        const w = effective[i];
        const floor = minFor(i);
        return Math.max(0, w - floor);
      });
      const totalHeadroom = headrooms.reduce((a, b) => a + b, 0);
      if (totalHeadroom <= 0) return false; // can't shrink further

      const shrink = Math.min(overflow, totalHeadroom);
      const next = cur.slice();
      let changed = false;
      defaults.forEach((d, i) => {
        if (d === null) return;
        const hr = headrooms[i];
        if (hr <= 0) return;
        const portion = (hr / totalHeadroom) * shrink;
        const newW = Math.max(minFor(i), Math.round(effective[i] - portion));
        if (newW !== cur[i]) {
          next[i] = newW;
          changed = true;
        }
      });

      if (changed && !opts?.dryRun) setWidths(next);
      return changed;
    },
    [defaults, minFor, storageKey]
  );

  // (tableElRef is declared earlier so `reset` can use it.)

  const applyPinnedTableWidth = useCallback(() => {
    const tbl = tableElRef.current;
    if (!tbl) return;
    let userResized = false;
    try {
      userResized = typeof window !== "undefined" &&
        localStorage.getItem(storageKey + ":userResized") === "1";
    } catch { /* noop */ }
    if (!userResized) {
      // Restore default behavior so initial layout stays 100%.
      if (tbl.dataset.colwidthsPinned === "1") {
        tbl.style.width = "";
        tbl.style.maxWidth = "";
        tbl.style.minWidth = "";
        delete tbl.dataset.colwidthsPinned;
      }
      return;
    }
    // Sum effective widths from <thead th> rendered cells.
    const cells = Array.from(tbl.querySelectorAll("thead th")) as HTMLTableCellElement[];
    if (cells.length === 0) return;
    let sum = 0;
    for (let i = 0; i < cells.length; i++) {
      const v = widthsRef.current[i];
      if (typeof v === "number") sum += v;
      else sum += Math.round(cells[i].getBoundingClientRect().width);
    }
    if (sum <= 0) return;
    tbl.style.width = sum + "px";
    tbl.style.maxWidth = "none";
    tbl.style.minWidth = sum + "px";
    tbl.dataset.colwidthsPinned = "1";
  }, [storageKey]);

  // Re-pin whenever widths change.
  useEffect(() => {
    applyPinnedTableWidth();
  }, [widths, applyPinnedTableWidth]);

  const tableProps = useMemo(() => {
    const HIT = 8;
    const TOOLTIP = "اسحب للتكبير";

    /**
     * Detect which edge of `cell` the pointer is over.
     * Returns "left" / "right" (relative to the cell's bounding box, NOT
     * to the writing direction) or null if not near any edge.
     */
    const detectEdge = (cell: HTMLTableCellElement, clientX: number): "left" | "right" | null => {
      const rect = cell.getBoundingClientRect();
      const distLeft = clientX - rect.left;
      const distRight = rect.right - clientX;
      // Allow a tiny negative tolerance for clicks exactly on the border.
      if (distRight <= HIT && distRight >= -2) return "right";
      if (distLeft <= HIT && distLeft >= -2) return "left";
      return null;
    };

    /**
     * Map the touched edge of cell #cellIndex to the column whose width
     * should change.
     *
     *  LTR layout:  | col 0 | col 1 | col 2 |
     *               ^left of 0       ^right of 1 = drag col 1
     *               left of 1 = drag col 0 (the previous one)
     *
     *  RTL layout:  | col 2 | col 1 | col 0 |  (visually flipped)
     *               left of cell i (visually = its END) = drag col i
     *               right of cell i (visually = its START) = drag col i-1
     */
    const resolveColumnIndex = (
      cellIndex: number,
      edge: "left" | "right",
      isRtl: boolean
    ): number => {
      if (isRtl) {
        // In RTL, the "end" of a column is its LEFT edge.
        return edge === "left" ? cellIndex : cellIndex - 1;
      }
      // In LTR, the "end" of a column is its RIGHT edge.
      return edge === "right" ? cellIndex : cellIndex - 1;
    };

    const captureTable = (e: React.MouseEvent<HTMLTableElement>) => {
      if (!tableElRef.current) {
        tableElRef.current = e.currentTarget;
        applyPinnedTableWidth();
      }
    };

    /**
     * Ref callback — runs as soon as React mounts the <table>. This
     * guarantees that on a fresh page reload, if `:userResized="1"` is
     * persisted, we re-pin the table width to the saved column sum
     * BEFORE the user touches anything. Two rAFs ensure thead cells have
     * been laid out so width measurements are correct.
     */
    const refCallback = (el: HTMLTableElement | null) => {
      if (!el) {
        tableElRef.current = null;
        return;
      }
      tableElRef.current = el;
      // Apply once now (in case widths array already has saved px values),
      // then again after layout to use measured cell widths for any null
      // entries (flex columns).
      applyPinnedTableWidth();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => applyPinnedTableWidth());
      });
    };

    const onMouseDown = (e: React.MouseEvent<HTMLTableElement>) => {
      captureTable(e);
      if (lockedRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, button, a, [role='button'], .col-resize-handle")) return;
      const cell = target.closest("td, th") as HTMLTableCellElement | null;
      if (!cell) return;
      const edge = detectEdge(cell, e.clientX);
      if (!edge) return;
      const isRtl = document.documentElement.dir === "rtl" || document.body.dir === "rtl";
      const idx = resolveColumnIndex(cell.cellIndex, edge, isRtl);
      if (idx < 0 || idx >= defaults.length) return;

      // Debug: emit edge resolution so the HUD can display it.
      try {
        window.dispatchEvent(new CustomEvent("colwidths-debug-edge", {
          detail: {
            storageKey,
            cellIndex: cell.cellIndex,
            edge,
            dir: isRtl ? "rtl" : "ltr",
            resolvedIndex: idx,
          },
        }));
      } catch { /* noop */ }

      startDrag(idx, e.nativeEvent);
    };

    const onMouseMove = (e: React.MouseEvent<HTMLTableElement>) => {
      captureTable(e);
      if (lockedRef.current) return;
      const target = e.target as HTMLElement;
      const cell = target.closest("td, th") as HTMLTableCellElement | null;
      if (!cell) return;
      // Only show tooltip on body cells (not header) — keep header free for sort/menu.
      if (cell.tagName === "TH") return;
      const edge = detectEdge(cell, e.clientX);
      if (edge) {
        if (cell.getAttribute("title") !== TOOLTIP) cell.setAttribute("title", TOOLTIP);
        // Use directional cursor so the user sees which edge is active.
        cell.style.cursor = "col-resize";
      } else if (cell.getAttribute("title") === TOOLTIP) {
        cell.removeAttribute("title");
        cell.style.cursor = "";
      }
    };
    return { ref: refCallback, onMouseDown, onMouseMove };
  }, [defaults.length, startDrag, applyPinnedTableWidth, storageKey]);


  return { widths, minWidths: defaults, startDrag, reset, saveAsUserDefault, clearUserDefault, hasUserDefault, tableProps, locked, clampWidthsToContainer };
}

/**
 * Observe a container element and clamp column widths so the table never
 * overflows it horizontally. Reacts to window resize, sidebar toggles,
 * and zoom changes via ResizeObserver.
 */
export function useContainerFit(
  ref: React.RefObject<HTMLElement>,
  clamp: (w: number, opts?: { dryRun?: boolean }) => boolean,
  options?: { locked?: boolean }
) {
  const lockedRef = useRef(options?.locked ?? false);
  lockedRef.current = options?.locked ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const run = () => {
      const w = el.clientWidth;
      // When locked, do a dry-run only — preserve user-saved widths.
      clamp(w, { dryRun: lockedRef.current });
    };

    run();

    const ro = new ResizeObserver(() => run());
    ro.observe(el);
    window.addEventListener("resize", run);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", run);
    };
  }, [ref, clamp]);
}

/**
 * Inline drag handle to place inside a `<th>`. Pass `hidden` to render nothing
 * (used when the table is in "locked" mode).
 */
export function ColumnResizeHandle({
  onMouseDown,
  title,
  hidden,
}: {
  onMouseDown: (e: React.MouseEvent | React.PointerEvent) => void;
  title?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onMouseDown}
      onDoubleClick={(e) => e.stopPropagation()}
      title={title ?? "اسحب للتكبير"}
      className="col-resize-handle"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        // Wider invisible touch area, with a visible thin bar centered.
        insetInlineEnd: -10,
        width: 20,
        cursor: "col-resize",
        zIndex: 6,
        userSelect: "none",
        touchAction: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    />
  );
}

/**
 * Shared-lock helper: read/write a single localStorage flag and emit a custom
 * event so all hook subscribers (in any open page) update simultaneously.
 */
export const SHARED_COLS_WIDTHS_KEY = "shared:itemsTable:colWidths:v1";
export const SHARED_COLS_LOCKED_KEY = "shared:itemsTable:colsLocked:v1";
export const SHARED_LOCK_EVENT = "colwidths-shared-lock";

/**
 * Unified toast messages for the column-lock toggle. Centralized here so
 * all four item-table pages share the exact same wording (and translation
 * keys, if i18n is added later).
 */
export const COLS_TOAST_SAVED = "تم حفظ وقفل عرض الأعمدة";
export const COLS_TOAST_SAVE_FAILED = "تعذّر الحفظ";
export const COLS_TOAST_EDIT_MODE = "وضع التعديل مفعّل — اسحب الحواف لضبط الأعمدة";
export const COLS_BTN_SAVE_LABEL = "حفظ";
export const COLS_BTN_EDIT_LABEL = "تعديل";
export const COLS_BTN_SAVE_TITLE = "حفظ وقفل عرض الأعمدة الحالي";
export const COLS_BTN_EDIT_TITLE = "فتح القفل لتعديل عرض الأعمدة";

export function readSharedLock(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SHARED_COLS_LOCKED_KEY) === "true";
}

export function writeSharedLock(locked: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SHARED_COLS_LOCKED_KEY, locked ? "true" : "false");
  window.dispatchEvent(
    new CustomEvent(SHARED_LOCK_EVENT, { detail: { locked } })
  );
}

export function useSharedColsLocked(initialFromLegacy?: () => boolean): [boolean, (v: boolean) => void] {
  const [locked, setLockedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const flag = localStorage.getItem(SHARED_COLS_LOCKED_KEY);
    if (flag === "true") return true;
    if (flag === "false") return false;
    // First run: migrate from legacy or default to false.
    if (initialFromLegacy) return initialFromLegacy();
    return !!localStorage.getItem(SHARED_COLS_WIDTHS_KEY);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SHARED_COLS_LOCKED_KEY) return;
      setLockedState(e.newValue === "true");
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { locked?: boolean } | undefined;
      if (!detail) return;
      setLockedState(!!detail.locked);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SHARED_LOCK_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SHARED_LOCK_EVENT, onCustom as EventListener);
    };
  }, []);

  const setLocked = useCallback((v: boolean) => {
    writeSharedLock(v);
    setLockedState(v);
  }, []);

  return [locked, setLocked];
}

/**
 * Per-screen + per-user lock flag. Mirrors `useSharedColsLocked` API but
 * stores the lock in a key scoped to the current user and screen.
 * Migrates the legacy shared lock value on first read for the screen.
 */
export const SCREEN_LOCK_EVENT = "colwidths-screen-lock";

export function useScreenColsLocked(screenId: string): [boolean, (v: boolean) => void] {
  const keyRef = useRef(screenColLockedKey(screenId));
  const [locked, setLockedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    migrateScreenColKeys(screenId);
    const flag = localStorage.getItem(keyRef.current);
    return flag === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    keyRef.current = screenColLockedKey(screenId);
    migrateScreenColKeys(screenId);
    const flag = localStorage.getItem(keyRef.current);
    setLockedState(flag === "true");
    const onStorage = (e: StorageEvent) => {
      if (e.key !== keyRef.current) return;
      setLockedState(e.newValue === "true");
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { screenId?: string; locked?: boolean; all?: boolean } | undefined;
      if (!detail) return;
      if (detail.all || detail.screenId === screenId) {
        setLockedState(!!detail.locked);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SCREEN_LOCK_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SCREEN_LOCK_EVENT, onCustom as EventListener);
    };
  }, [screenId]);

  const setLocked = useCallback((v: boolean) => {
    try { localStorage.setItem(keyRef.current, v ? "true" : "false"); } catch { /* noop */ }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SCREEN_LOCK_EVENT, { detail: { screenId, locked: v } }));
    }
    setLockedState(v);
  }, [screenId]);

  return [locked, setLocked];
}

/**
 * One-time migration: copy the first available legacy widths key to the
 * shared key (priority: invoice → quote → purchase → stock-return).
 * Safe to call on every mount; it's a no-op once the shared key exists.
 */
export function migrateLegacyColWidths() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SHARED_COLS_WIDTHS_KEY)) return;
  const legacyKeys = [
    "invoice-create:colWidths:v3",
    "quote-create:colWidths:v3",
    "purchase-create:colWidths:v3",
    "stock-return-create:colWidths:v3",
  ];
  for (const k of legacyKeys) {
    const v = localStorage.getItem(k);
    if (v) {
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, v);
      break;
    }
  }
  // Migrate lock flag (first found wins).
  if (!localStorage.getItem(SHARED_COLS_LOCKED_KEY)) {
    const legacyLocks = [
      "invoice-create:colsLocked:v1",
      "quote-create:colsLocked:v1",
      "purchase-create:colsLocked:v1",
      "stock-return-create:colsLocked:v1",
    ];
    for (const k of legacyLocks) {
      const v = localStorage.getItem(k);
      if (v === "true" || v === "false") {
        localStorage.setItem(SHARED_COLS_LOCKED_KEY, v);
        break;
      }
    }
  }
}

/**
 * Known per-screen lock IDs used across the app. Keep this in sync with
 * each page that calls `useScreenColsLocked(...)`.
 */
export const KNOWN_SCREEN_IDS: string[] = [
  "invoice-create",
  "quote-create",
  "side-quote-create",
  "purchase-create",
  "stock-return-create",
];

function setAllLocks(locked: boolean) {
  if (typeof window === "undefined") return;
  // Shared lock (Products / Customers).
  try {
    localStorage.setItem(SHARED_COLS_LOCKED_KEY, locked ? "true" : "false");
    window.dispatchEvent(new CustomEvent(SHARED_LOCK_EVENT, { detail: { locked } }));
  } catch { /* noop */ }
  // Per-screen locks.
  for (const id of KNOWN_SCREEN_IDS) {
    try {
      const k = screenColLockedKey(id);
      localStorage.setItem(k, locked ? "true" : "false");
    } catch { /* noop */ }
  }
  // Broadcast a single "all" event that every screen-lock hook listens for.
  try {
    window.dispatchEvent(new CustomEvent(SCREEN_LOCK_EVENT, { detail: { all: true, locked } }));
  } catch { /* noop */ }
}

/** Lock column widths across all known pages for the current user. */
export function lockAllPagesColumnWidths() { setAllLocks(true); }

/** Unlock column widths across all known pages for the current user. */
export function unlockAllPagesColumnWidths() { setAllLocks(false); }

/**
 * Reset all saved column widths for the current user across every page.
 * Broadcasts SHARED_UPDATE_EVENT per cleared key so any open table re-renders
 * at defaults instantly without a refresh.
 */
export function resetAllPagesColumnWidths() {
  if (typeof window === "undefined") return;
  const removed: string[] = [];
  const removeKey = (k: string) => {
    try {
      const had = localStorage.getItem(k) !== null;
      localStorage.removeItem(k);
      localStorage.removeItem(k + ":userResized");
      if (had) removed.push(k);
    } catch { /* noop */ }
  };

  removeKey(SHARED_COLS_WIDTHS_KEY);
  try { removeKey(userKey("legacy", SHARED_COLS_WIDTHS_KEY)); } catch { /* noop */ }

  for (const id of KNOWN_SCREEN_IDS) {
    try { removeKey(screenColWidthsKey(id)); } catch { /* noop */ }
  }

  try {
    const prefix = userKey("cols", "");
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(prefix) && k.endsWith(":widths")) toDelete.push(k);
    }
    for (const k of toDelete) removeKey(k);
  } catch { /* noop */ }

  for (const k of removed) {
    try {
      window.dispatchEvent(new CustomEvent(SHARED_UPDATE_EVENT, {
        detail: { key: k, widths: [] },
      }));
    } catch { /* noop */ }
  }
}
