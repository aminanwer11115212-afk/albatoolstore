import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Settings2, Check, RotateCcw } from "lucide-react";
import { useToolbarOrder } from "@/hooks/useToolbarOrder";
import { useToolbarCustomization } from "./ToolbarCustomizationContext";
import { findDropTargetFromStack } from "@/utils/toolbarDropTarget";

export interface ToolbarItem {
  id: string;
  node: ReactNode;
}

interface Props {
  screenKey: string;
  items: ToolbarItem[];
  className?: string;
  style?: React.CSSProperties;
  /** Show the customize/done/reset controls inside this bar. Defaults to true if no provider, or to first registered bar. */
  showControls?: boolean;
}

const DRAG_MIME = "text/x-toolbar-item";

const wrapBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  position: "relative",
};

export default function CustomizableToolbar({ screenKey, items, className, style, showControls }: Props) {
  const ids = items.map((i) => i.id);
  const {
    order,
    customizing: localCustomizing,
    toggleCustomizing: localToggle,
    resetOrder,
    moveItem,
    removeItem,
    insertItem,
  } = useToolbarOrder(screenKey, ids);

  const ctx = useToolbarCustomization();
  const customizing = ctx ? ctx.customizing : localCustomizing;
  const toggleCustomizing = ctx ? ctx.toggleCustomizing : localToggle;

  // Register bar with the context so cross-bar moves & resetAll work.
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerBar(screenKey, { removeItem, insertItem, resetOrder });
  }, [ctx, screenKey, removeItem, insertItem, resetOrder]);

  const dragRef = useRef<{ fromBar: string; id: string } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [overEnd, setOverEnd] = useState(false);

  // عند وجود Provider يُستخدم زر <ToolbarCustomizeToggle /> الموحّد على مستوى الصفحة،
  // فلا تعرض أي شريط زر التخصيص الخاص به. بدون Provider، كل شريط يعرض أزراره.
  const shouldShowControls = showControls !== undefined ? showControls : !ctx;

  const map = new Map(items.map((i) => [i.id, i.node]));
  const seenIds = new Set<string>();
  const ordered: { id: string; node: ReactNode }[] = [];
  for (const id of order) {
    const node = map.get(id);
    if (node === undefined) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    ordered.push({ id, node });
  }
  // Safety net: ensure every item provided to the bar is rendered, even if it's
  // missing from the saved order (e.g. after a cross-bar move + reload, or if
  // localStorage holds stale data). This guarantees buttons never disappear.
  for (const item of items) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    ordered.push({ id: item.id, node: item.node });
  }

  const ctrlBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 28,
    padding: "0 10px",
    borderRadius: 4,
    border: "1px solid hsl(var(--border))",
    background: customizing ? "#22c55e" : "hsl(var(--card))",
    color: customizing ? "#fff" : "hsl(var(--foreground))",
    fontSize: 12,
    cursor: "pointer",
  };

  const parsePayload = (e: React.DragEvent): { fromBar: string; id: string } | null => {
    try {
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (raw) {
        const [fromBar, id] = raw.split("|");
        if (fromBar && id) return { fromBar, id };
      }
    } catch {
      /* noop */
    }
    return dragRef.current;
  };

  const handleDropOn = (e: React.DragEvent, beforeId?: string) => {
    if (!customizing) return;
    e.preventDefault();
    e.stopPropagation();
    const payload = parsePayload(e);
    dragRef.current = null;
    setOverId(null);
    setOverEnd(false);
    if (!payload) return;
    if (payload.fromBar === screenKey) {
      // same bar
      if (!beforeId) {
        // drop at end: move to end
        insertItem(payload.id);
      } else if (payload.id !== beforeId) {
        moveItem(payload.id, beforeId);
      }
    } else if (ctx) {
      ctx.moveAcross(payload.fromBar, screenKey, payload.id, beforeId);
    }
    lastTargetRef.current = null;
  };

  // Touch/Pen drag support via pointer events (parallel to HTML5 DnD)
  const touchDragRef = useRef<{ id: string; pointerId: number } | null>(null);

  const findDropTargetAt = (x: number, y: number) => {
    const draggedId = touchDragRef.current?.id ?? dragRef.current?.id ?? null;
    const stack: Element[] = (typeof document.elementsFromPoint === 'function')
      ? document.elementsFromPoint(x, y)
      : ([document.elementFromPoint(x, y)].filter(Boolean) as Element[]);
    return findDropTargetFromStack(stack, draggedId, screenKey);
  };

  // Throttle pointermove handling via rAF + 40ms min interval (≈25fps).
  const moveThrottleRef = useRef<{ lastRun: number; rafId: number | null; lastXY: { x: number; y: number } | null }>({ lastRun: 0, rafId: null, lastXY: null });

  // Track last computed target to avoid intermediate/jumpy preview states.
  // Normalization rules (so semantically-identical targets compare equal):
  //  - `isEnd` is always coerced to a strict boolean.
  //  - When `isEnd` is true, `beforeId` is irrelevant -> normalized to null.
  //  - When `isEnd` is false, a missing/empty `beforeId` is normalized to null
  //    (so `undefined` vs `""` vs absent key never cause spurious updates).
  //  - `barKey` must match exactly; null targets compare equal only to null.
  type LastTarget = { barKey: string; beforeId: string | null; isEnd: boolean } | null;
  const lastTargetRef = useRef<LastTarget>(null);
  const normalizeTarget = (
    t: { barKey: string; beforeId?: string; isEnd?: boolean } | null,
  ): LastTarget => {
    if (!t) return null;
    const isEnd = !!t.isEnd;
    const beforeId = isEnd ? null : (t.beforeId && t.beforeId.length > 0 ? t.beforeId : null);
    return { barKey: t.barKey, beforeId, isEnd };
  };
  const sameTarget = (a: LastTarget, b: LastTarget): boolean => {
    if (a === b) return true;          // same ref or both null
    if (!a || !b) return false;        // exactly one is null
    if (a.barKey !== b.barKey) return false;
    if (a.isEnd !== b.isEnd) return false;
    // When isEnd is true, beforeId is ignored by drop logic -> already null after normalization.
    return a.beforeId === b.beforeId;
  };

  /**
   * تطبيق هدف محسوب مسبقاً على حالة المعاينة (overId/overEnd) عبر بوّابة
   * lastTargetRef — لا تحديث إن كان مطابقاً للهدف الأخير.
   * يُستخدم من كل المسارات (DnD العادي + اللمس + end-zone) لضمان مصدر
   * تثبيت واحد للمعاينة ومنع القفزات بين الإطارات أثناء الـ throttling.
   */
  const commitTarget = (
    target: { barKey: string; beforeId?: string; isEnd?: boolean } | null,
  ) => {
    const normalized = normalizeTarget(target);
    if (sameTarget(lastTargetRef.current, normalized)) return;
    lastTargetRef.current = normalized;
    if (normalized && normalized.barKey === screenKey && !normalized.isEnd && normalized.beforeId) {
      setOverId(normalized.beforeId);
      setOverEnd(false);
    } else if (normalized && normalized.barKey === screenKey && normalized.isEnd) {
      setOverId(null);
      setOverEnd(true);
    } else {
      setOverId(null);
      setOverEnd(false);
    }
  };

  const applyTargetUpdate = (x: number, y: number) => {
    commitTarget(findDropTargetAt(x, y));
  };

  const scheduleTargetUpdate = (x: number, y: number) => {
    const t = moveThrottleRef.current;
    t.lastXY = { x, y };
    const now = performance.now();
    const elapsed = now - t.lastRun;
    if (elapsed >= 40) {
      t.lastRun = now;
      applyTargetUpdate(x, y);
      return;
    }
    if (t.rafId != null) return; // already scheduled
    t.rafId = requestAnimationFrame(() => {
      const cur = moveThrottleRef.current;
      cur.rafId = null;
      cur.lastRun = performance.now();
      if (cur.lastXY) applyTargetUpdate(cur.lastXY.x, cur.lastXY.y);
    });
  };

  const cancelThrottle = () => {
    const t = moveThrottleRef.current;
    if (t.rafId != null) {
      cancelAnimationFrame(t.rafId);
      t.rafId = null;
    }
    t.lastXY = null;
  };

  const performDrop = (fromBar: string, id: string, target: { barKey: string; beforeId?: string; isEnd?: boolean } | null) => {
    if (!target) return;
    if (target.barKey === screenKey) {
      if (target.isEnd || !target.beforeId) {
        if (fromBar === screenKey) insertItem(id);
        else if (ctx) ctx.moveAcross(fromBar, screenKey, id, undefined);
      } else if (fromBar === screenKey) {
        if (id !== target.beforeId) moveItem(id, target.beforeId);
      } else if (ctx) {
        ctx.moveAcross(fromBar, screenKey, id, target.beforeId);
      }
    } else if (ctx) {
      ctx.moveAcross(fromBar, target.barKey, id, target.isEnd ? undefined : target.beforeId);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        alignContent: "flex-start",
        flexWrap: "wrap",
        rowGap: 6,
        columnGap: 8,
        padding: "6px 10px",
        minHeight: 44,
        boxSizing: "border-box",
        width: "100%",
        ...style,
      }}
    >
      {ordered.map(({ id, node }, idx) => {
        const isOver = customizing && overId === id && dragRef.current && !(dragRef.current.fromBar === screenKey && dragRef.current.id === id);
        const isLast = idx === ordered.length - 1;
        const wrapStyle: React.CSSProperties = {
          ...wrapBase,
          flex: "0 0 auto",
          padding: customizing ? 2 : 0,
          border: customizing ? "2px dashed hsl(var(--primary))" : "2px solid transparent",
          borderRadius: 6,
          cursor: customizing ? "grab" : undefined,
          background: isOver ? "hsl(var(--accent))" : undefined,
          transition: "background 0.1s",
          touchAction: customizing ? "none" : undefined,
        };
        return (
          <React.Fragment key={id}>
          <div
            data-toolbar-item-id={id}
            data-toolbar-bar-key={screenKey}
            draggable={customizing}
            onDragStart={(e) => {
              if (!customizing) return;
              dragRef.current = { fromBar: screenKey, id };
              lastTargetRef.current = null;
              e.dataTransfer.effectAllowed = "move";
              try { e.dataTransfer.setData(DRAG_MIME, `${screenKey}|${id}`); } catch { /* noop */ }
              try { e.dataTransfer.setData("text/plain", id); } catch { /* noop */ }
            }}
            onDragOver={(e) => {
              if (!customizing) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              // مرّ عبر بوّابة التثبيت لمنع قفزات بين إطارات الـ throttling.
              commitTarget({ barKey: screenKey, beforeId: id, isEnd: false });
            }}
            onDragLeave={() => {
              // لا تُصفّر مباشرةً — اترك الحدث التالي يستقر على الهدف الجديد
              // (يمنع وميض المعاينة بين أزرار متجاورة).
            }}
            onDrop={(e) => handleDropOn(e, id)}
            onDragEnd={() => {
              dragRef.current = null;
              lastTargetRef.current = null;
              setOverId(null);
              setOverEnd(false);
            }}
            style={{ ...wrapStyle, userSelect: customizing ? "none" : undefined }}
            title={customizing ? "اسحب لإعادة الترتيب" : undefined}
          >
            {customizing && (
              <div
                draggable={false}
                onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onMouseDownCapture={(e) => { e.stopPropagation(); }}
                onPointerDownCapture={(e) => { e.stopPropagation(); }}
                onPointerDown={(e) => {
                  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
                  e.preventDefault();
                  touchDragRef.current = { id, pointerId: e.pointerId };
                  dragRef.current = { fromBar: screenKey, id };
                  lastTargetRef.current = null;
                  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
                }}
                onPointerMove={(e) => {
                  if (!touchDragRef.current || touchDragRef.current.pointerId !== e.pointerId) return;
                  e.preventDefault();
                  scheduleTargetUpdate(e.clientX, e.clientY);
                }}
                onPointerUp={(e) => {
                  if (!touchDragRef.current || touchDragRef.current.pointerId !== e.pointerId) return;
                  e.preventDefault();
                  cancelThrottle();
                  const dragId = touchDragRef.current.id;
                  const target = findDropTargetAt(e.clientX, e.clientY);
                  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
                  touchDragRef.current = null;
                  dragRef.current = null;
                  lastTargetRef.current = null;
                  setOverId(null);
                  setOverEnd(false);
                  performDrop(screenKey, dragId, target);
                }}
                onPointerCancel={(e) => {
                  if (!touchDragRef.current || touchDragRef.current.pointerId !== e.pointerId) return;
                  cancelThrottle();
                  touchDragRef.current = null;
                  dragRef.current = null;
                  lastTargetRef.current = null;
                  setOverId(null);
                  setOverEnd(false);
                }}
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
            <div style={{ pointerEvents: customizing ? "none" : undefined, display: "inline-flex", alignItems: "center" }}>
              {node}
            </div>
          </div>
          {!isLast && (
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 1,
                height: 22,
                margin: "0 2px",
                background: "hsl(var(--border))",
                flex: "0 0 auto",
                alignSelf: "center",
              }}
            />
          )}
          </React.Fragment>
        );
      })}

      {/* End-of-bar drop zone for appending */}
      {customizing && (
        <div
          data-toolbar-end-zone
          data-toolbar-bar-key={screenKey}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            commitTarget({ barKey: screenKey, isEnd: true });
          }}
          onDragLeave={() => {
            // لا تصفير مباشر — يستقر التحديث التالي على الهدف الصحيح.
          }}
          onDrop={(e) => handleDropOn(e, undefined)}
          style={{
            minWidth: 36,
            height: 28,
            border: "2px dashed hsl(var(--border))",
            borderRadius: 6,
            background: overEnd ? "hsl(var(--accent))" : "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "hsl(var(--muted-foreground))",
            fontSize: 11,
            touchAction: "none",
          }}
          title="إفلات هنا للإلحاق في النهاية"
        >
          +
        </div>
      )}

      {shouldShowControls && customizing && (
        <button
          type="button"
          onClick={() => (ctx ? ctx.resetAll() : resetOrder())}
          style={{ ...ctrlBtn, background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
          title="إعادة الترتيب الافتراضي"
        >
          <RotateCcw size={14} /> افتراضي
        </button>
      )}
      {shouldShowControls && (
        <button
          type="button"
          onClick={toggleCustomizing}
          style={ctrlBtn}
          title={customizing ? "إنهاء التخصيص" : "تخصيص ترتيب الأزرار"}
        >
          {customizing ? <><Check size={14} /> تم</> : <><Settings2 size={14} /> تخصيص</>}
        </button>
      )}
    </div>
  );
}
