/**
 * Pure utility for resolving a toolbar drop target from a stack of DOM
 * elements (typically the result of `document.elementsFromPoint`).
 *
 * Rules:
 * 1. Prefer end-of-bar drop zones (`[data-toolbar-end-zone]`) over item
 *    targets — they exist for "append to end" semantics.
 * 2. Otherwise return the first toolbar item (`[data-toolbar-item-id]`)
 *    that is not the dragged item itself within the same bar.
 * 3. Cross-bar items with the same id are allowed targets.
 */
export interface DropTarget {
  barKey: string;
  beforeId?: string;
  isEnd?: boolean;
}

export function findDropTargetFromStack(
  stack: Element[],
  draggedId: string | null,
  currentBarKey: string,
): DropTarget | null {
  // 1) End zones first
  for (const node of stack) {
    const endZone = (node as HTMLElement).closest?.('[data-toolbar-end-zone]') as HTMLElement | null;
    if (endZone) {
      const barKey = endZone.getAttribute('data-toolbar-bar-key') || undefined;
      if (barKey) return { barKey, isEnd: true };
    }
  }

  // 2) Item targets (skipping the dragged item within the same bar)
  for (const node of stack) {
    const item = (node as HTMLElement).closest?.('[data-toolbar-item-id]') as HTMLElement | null;
    if (!item) continue;
    const beforeId = item.getAttribute('data-toolbar-item-id') || undefined;
    const barKey = item.getAttribute('data-toolbar-bar-key') || undefined;
    if (!beforeId || !barKey) continue;
    if (draggedId && beforeId === draggedId && barKey === currentBarKey) continue;
    return { barKey, beforeId };
  }

  return null;
}
