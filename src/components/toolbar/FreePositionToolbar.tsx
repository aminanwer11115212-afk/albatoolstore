import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { useToolbarCustomization } from "./ToolbarCustomizationContext";
import ToolbarSettingsMenu from "./ToolbarSettingsMenu";
import { useToolbarHidden } from "./useToolbarHidden";
import { useToolbarLabels } from "./useToolbarLabels";
import HiddenItemsTray from "./HiddenItemsTray";
import { toolbarStorageKey } from "./toolbarOwner";

export interface FreeToolbarItem {
  id: string;
  node: ReactNode;
  /** Optional group key — items sharing the same group are placed adjacently
   *  with a thin vertical divider between groups in auto-layout. */
  group?: string;
  /** Optional double-click handler invoked while in customizing mode (the drag
   *  overlay normally swallows the inner element's events). Useful for the
   *  "Done" button which should exit customizing mode on double-click. */
  onDoubleClick?: () => void;
  /** Default human label, shown in the Hidden Items tray to identify the item. */
  defaultLabel?: string;
  /** When true, render only a small drag handle on the start edge (so inner
   *  controls like edit/hide buttons remain clickable while customizing). */
  useHandle?: boolean;
  /** When true, this item cannot be hidden (e.g. customize/reset buttons). */
  notHideable?: boolean;
}

interface Props {
  screenKey: string;
  items: FreeToolbarItem[];
  className?: string;
  style?: React.CSSProperties;
  /** Min height of the free area (auto-grows with farthest button). */
  minHeight?: number;
  /** When true, automatically appends draggable Customize/Reset buttons as items.
   *  These buttons get persisted positions like any other item, and the Customize
   *  button (which becomes "تم" while customizing) exits the mode on double-click. */
  withCustomizeButtons?: boolean;
  /** Optional zoom controls to embed in the unified settings menu. */
  zoom?: { value: number; inc: () => void; dec: () => void };
}

// v2: bumped to reset legacy messy positions and adopt new tidy auto-layout.
const POS_PREFIX = "neobilling:toolbar-positions:v2";

const ITEM_HEIGHT = 34;
const GAP = 8;
const PADDING = 6;
const GROUP_DIVIDER_W = 1;
const GROUP_DIVIDER_GAP = 6; // extra space around the divider

type Pos = { x: number; y: number };
type PosMap = Record<string, Pos>;

function storageKey(screenKey: string) {
  return toolbarStorageKey(POS_PREFIX, screenKey);
}

function readPositions(screenKey: string): PosMap {
  try {
    const raw = localStorage.getItem(storageKey(screenKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as PosMap;
  } catch { /* noop */ }
  return {};
}

function writePositions(screenKey: string, map: PosMap) {
  try {
    localStorage.setItem(storageKey(screenKey), JSON.stringify(map));
  } catch { /* noop */ }
}

export default function FreePositionToolbar({ screenKey, items: rawItems, className, style, minHeight = ITEM_HEIGHT + PADDING * 2, withCustomizeButtons = false, zoom }: Props) {
  const ctx = useToolbarCustomization();
  const toggleCustomizing = ctx?.toggleCustomizing;
  const { hidden, isHidden, reset: resetHidden } = useToolbarHidden(screenKey);
  const { reset: resetLabels } = useToolbarLabels(screenKey);

  // Append a single unified settings menu (gear icon) when requested.
  const allItems = useMemo<FreeToolbarItem[]>(() => {
    if (!withCustomizeButtons) return rawItems;
    return [
      ...rawItems,
      {
        id: "__settings_menu__",
        group: "9-customize",
        node: <ToolbarSettingsMenu screenKey={screenKey} zoom={zoom} />,
        useHandle: true,
        notHideable: true,
      },
    ];
  }, [rawItems, withCustomizeButtons, zoom, screenKey]);

  // Filter out hidden items (kept in allItems for the tray to restore them).
  const items = useMemo(
    () => allItems.filter((it) => !isHidden(it.id)),
    [allItems, isHidden],
  );

  const customizing = !!ctx?.customizing;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [positions, setPositions] = useState<PosMap>(() => readPositions(screenKey));
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const dragRef = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  // Persist on change
  useEffect(() => {
    writePositions(screenKey, positions);
  }, [positions, screenKey]);

  // Track container width for auto-layout & divider positioning
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth || 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-layout for items without saved position: tidy horizontal flow,
  // vertically centered per row, group-aware (adds extra spacing between groups).
  // For new items added after the user has saved positions, find a free spot
  // that does NOT overlap any existing saved item (prevents stacked buttons).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth || 800;
    let x = PADDING;
    let y = PADDING;
    let rowH = ITEM_HEIGHT;
    let prevGroup: string | undefined;
    const next: PosMap = { ...positions };
    let changed = false;

    // Collect bounding boxes of items that already have a (saved) position so
    // we can avoid overlapping them when placing newcomers.
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const it of items) {
      const p = next[it.id];
      if (!p) continue;
      const el = itemRefs.current.get(it.id);
      const w = el?.offsetWidth || 80;
      const h = Math.max(el?.offsetHeight || ITEM_HEIGHT, ITEM_HEIGHT);
      placed.push({ x: p.x, y: p.y, w, h });
    }
    const overlaps = (ax: number, ay: number, aw: number, ah: number) =>
      placed.some((b) =>
        ax < b.x + b.w + 2 &&
        ax + aw + 2 > b.x &&
        ay < b.y + b.h + 2 &&
        ay + ah + 2 > b.y
      );

    for (const it of items) {
      const el = itemRefs.current.get(it.id);
      const w = el?.offsetWidth || 80;
      const h = Math.max(el?.offsetHeight || ITEM_HEIGHT, ITEM_HEIGHT);
      const saved = next[it.id];

      // إذا كان لدينا موقع محفوظ ولكنه يخرج عن العرض الحالي للحاوية
      // (مثلاً بعد فتح الـ Sidebar)، أعِد تدفّق هذا العنصر للصف التالي.
      if (saved && saved.x + w > cw - PADDING) {
        delete next[it.id];
        // أزل من قائمة placed أيضاً
        const idx = placed.findIndex((b) => b.x === saved.x && b.y === saved.y);
        if (idx >= 0) placed.splice(idx, 1);
        changed = true;
      }

      if (next[it.id]) {
        prevGroup = it.group;
        continue;
      }

      // Add extra gap when entering a new group (and not first in row)
      const groupBreak = prevGroup !== undefined && it.group !== undefined && it.group !== prevGroup;
      const extra = groupBreak ? GROUP_DIVIDER_GAP * 2 + GROUP_DIVIDER_W : 0;

      if (x + extra + w > cw - PADDING && x > PADDING) {
        x = PADDING;
        y += rowH + GAP;
        rowH = ITEM_HEIGHT;
      } else {
        x += extra;
      }

      let centeredY = y + Math.max(0, (Math.max(rowH, h) - h) / 2);

      // If this trial position collides with any already-saved item, scan for
      // the next free slot (advance horizontally then wrap to a new row).
      let guard = 0;
      while (overlaps(x, centeredY, w, h) && guard < 200) {
        x += GAP + 8;
        if (x + w > cw - PADDING) {
          x = PADDING;
          y += rowH + GAP;
          rowH = ITEM_HEIGHT;
        }
        centeredY = y + Math.max(0, (Math.max(rowH, h) - h) / 2);
        guard++;
      }

      next[it.id] = { x, y: centeredY };
      placed.push({ x, y: centeredY, w, h });
      changed = true;
      x += w + GAP;
      rowH = Math.max(rowH, h);
      prevGroup = it.group;
    }
    if (changed) setPositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => `${i.id}:${i.group ?? ""}`).join("|"), containerWidth, Object.keys(positions).length]);

  // Container auto height
  const computedHeight = (() => {
    let max = minHeight;
    for (const it of items) {
      const p = positions[it.id];
      const el = itemRefs.current.get(it.id);
      const h = Math.max(el?.offsetHeight || ITEM_HEIGHT, ITEM_HEIGHT);
      if (p) max = Math.max(max, p.y + h + PADDING);
    }
    return max;
  })();

  // Compute group divider X positions (only when items use groups & have positions)
  const dividers = useMemo(() => {
    const list: { x: number; y: number; h: number }[] = [];
    if (!items.some((i) => i.group)) return list;
    // Group consecutive items by group, collect bounding boxes per row
    let prev: { id: string; group?: string } | null = null;
    for (const it of items) {
      const p = positions[it.id];
      if (!p) { prev = it; continue; }
      const el = itemRefs.current.get(it.id);
      const w = el?.offsetWidth || 0;
      const h = Math.max(el?.offsetHeight || ITEM_HEIGHT, ITEM_HEIGHT);
      if (prev) {
        const pp = positions[prev.id];
        if (pp && prev.group !== undefined && it.group !== undefined && prev.group !== it.group) {
          // Same row only
          if (Math.abs(pp.y - p.y) < ITEM_HEIGHT) {
            const prevEl = itemRefs.current.get(prev.id);
            const prevW = prevEl?.offsetWidth || 0;
            const dividerX = pp.x + prevW + (p.x - (pp.x + prevW)) / 2;
            list.push({ x: dividerX, y: Math.min(pp.y, p.y) + 2, h: h - 4 });
          }
        }
      }
      prev = it;
    }
    return list;
  }, [items, positions]);

  // Reset positions + labels + hidden together
  const resetOrder = useCallback(() => {
    setPositions({});
    resetLabels();
    resetHidden();
  }, [resetLabels, resetHidden]);

  // Register with context for resetAll. Stub removeItem/insertItem (cross-bar moves not supported here).
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerBar(screenKey, {
      removeItem: () => { /* not supported in free layout */ },
      insertItem: () => { /* not supported in free layout */ },
      resetOrder,
    });
  }, [ctx, screenKey, resetOrder]);

  const beginDrag = (e: React.PointerEvent, id: string) => {
    if (!customizing) return;
    const itemEl = itemRefs.current.get(id);
    const container = containerRef.current;
    if (!itemEl || !container) return;
    const itemRect = itemEl.getBoundingClientRect();
    const offsetX = e.clientX - itemRect.left;
    const offsetY = e.clientY - itemRect.top;
    dragRef.current = { id, pointerId: e.pointerId, offsetX, offsetY };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    e.preventDefault();
    e.stopPropagation();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const itemEl = itemRefs.current.get(d.id);
    const w = itemEl?.offsetWidth || 80;
    let x = e.clientX - rect.left - d.offsetX;
    let y = e.clientY - rect.top - d.offsetY;
    x = Math.max(0, Math.min(x, rect.width - w));
    y = Math.max(0, y);
    setPositions((prev) => ({ ...prev, [d.id]: { x, y } }));
    e.preventDefault();
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={`free-toolbar ${className ?? ""}`}
      style={{
        position: "relative",
        width: "100%",
        minHeight: computedHeight,
        border: customizing ? "2px dashed hsl(var(--primary))" : undefined,
        borderRadius: 6,
        padding: 2,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {/* Visual group dividers (auto-layout only) */}
      {dividers.map((d, i) => (
        <div
          key={`div-${i}`}
          aria-hidden
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: GROUP_DIVIDER_W,
            height: d.h,
            background: "hsl(var(--border))",
            opacity: 0.7,
            pointerEvents: "none",
            borderRadius: 1,
          }}
        />
      ))}

      {/* Uniform sizing for primary controls inside each item wrapper */}
      <style>{`
        .free-toolbar > .ft-item > div > button,
        .free-toolbar > .ft-item > div > a {
          height: ${ITEM_HEIGHT}px;
          min-width: ${ITEM_HEIGHT + 2}px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          box-sizing: border-box;
        }
      `}</style>

      {items.map((it) => {
        const p = positions[it.id];
        const useHandle = !!it.useHandle;
        const wrapStyle: React.CSSProperties = {
          position: "absolute",
          left: p ? p.x : 0,
          top: p ? p.y : 0,
          visibility: p ? "visible" : "hidden",
          padding: customizing ? 2 : 0,
          border: customizing ? "2px dashed hsl(var(--primary))" : "2px solid transparent",
          borderRadius: 6,
          cursor: customizing && !useHandle ? "grab" : undefined,
          touchAction: customizing ? "none" : undefined,
          userSelect: customizing ? "none" : undefined,
          display: "inline-flex",
          alignItems: "center",
          gap: useHandle ? 4 : 0,
          height: ITEM_HEIGHT + (customizing ? 4 : 0),
        };
        return (
          <div
            key={it.id}
            ref={(el) => { itemRefs.current.set(it.id, el); }}
            className="ft-item"
            style={wrapStyle}
            title={customizing ? "اسحب إلى أي مكان" : undefined}
          >
            {/* Full-cover overlay (default) — covers the entire item so any inner
                control becomes draggable. Used for plain buttons. */}
            {customizing && !useHandle && (
              <div
                draggable={false}
                onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onMouseDownCapture={(e) => { e.stopPropagation(); }}
                onDoubleClick={(e) => {
                  if (it.onDoubleClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    it.onDoubleClick();
                  }
                }}
                onPointerDown={(e) => beginDrag(e, it.id)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 10,
                  cursor: "grab",
                  background: "transparent",
                  pointerEvents: "auto",
                  touchAction: "none",
                }}
              />
            )}

            {/* Handle mode (for SummaryChip etc.) — small grip on the start edge,
                inner controls (edit/hide buttons) remain interactive. */}
            {customizing && useHandle && (
              <div
                onPointerDown={(e) => beginDrag(e, it.id)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title="اسحب لتحريك العنصر"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: ITEM_HEIGHT,
                  cursor: "grab",
                  color: "hsl(var(--primary))",
                  touchAction: "none",
                  flexShrink: 0,
                }}
              >
                <GripVertical size={14} />
              </div>
            )}

            <div style={{
              pointerEvents: customizing && !useHandle ? "none" : undefined,
              display: "inline-flex",
              alignItems: "center",
            }}>
              {it.node}
            </div>
          </div>
        );
      })}

      {/* Tray to restore hidden items — only visible while customizing. */}
      {customizing && hidden.length > 0 && (
        <HiddenItemsTray
          screenKey={screenKey}
          hiddenIds={hidden}
          allItems={allItems}
        />
      )}
    </div>
  );
}
