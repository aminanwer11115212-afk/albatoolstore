/**
 * Logical vertical Arrow-key navigation for the four create screens
 * (Quote / Invoice / Purchase / Stock Return).
 *
 * Flow:
 *   Customer/Supplier  ⇅  Quick row  ⇅  Items table rows
 *
 * Header chips, dates, currency selector, totals row and action buttons
 * are deliberately excluded from the Arrow path — they stay reachable via
 * Tab/mouse.
 *
 * Markers expected on the page:
 *   - Customer input: identified via `customerRef`.
 *   - Quick row wrapper: `data-nav-zone="quick"` (or any ancestor with
 *     class `quick-add-row`). Each input inside should carry
 *     `data-nav-col="product|quantity|unit_price|foreign_price|exchange_rate"`.
 *   - Items table cells: existing `data-nav-table` / `data-nav-row` /
 *     `data-nav-col` (managed by `makeRowNavHandler`).
 *
 * When a suggestions dropdown (.search-suggestions / .customer-suggestions)
 * is visible we yield to the existing list handler.
 */

import { useEffect } from "react";

export type CreatePageNavOptions = {
  rootRef: React.RefObject<HTMLElement>;
  customerRef: React.RefObject<HTMLInputElement>;
  itemsTableId: string;
  /** Column keys that exist in the quick row, in left→right order. */
  quickCols?: string[];
};

const DEFAULT_QUICK_COLS = ["product", "quantity", "unit_price", "foreign_price", "exchange_rate"];

function isSuggestionsOpen(): boolean {
  // Either the floating product list (portal) or the inline customer list.
  const lists = document.querySelectorAll<HTMLElement>(".search-suggestions, .customer-suggestions");
  for (const el of Array.from(lists)) {
    if (el.offsetParent !== null) return true;
  }
  return false;
}

function focusEl(el: HTMLElement | null): boolean {
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "number")) {
    try { el.select(); } catch {}
  }
  return true;
}

function findQuickInput(root: HTMLElement, col: string): HTMLInputElement | null {
  const zone =
    root.querySelector<HTMLElement>('[data-nav-zone="quick"]') ||
    root.querySelector<HTMLElement>('.quick-add-row');
  if (!zone) return null;
  return (
    zone.querySelector<HTMLInputElement>(`input[data-nav-col="${col}"]`) ||
    zone.querySelector<HTMLInputElement>('input[data-nav-col="product"]') ||
    zone.querySelector<HTMLInputElement>('input')
  );
}

function findItemCell(tableId: string, row: number, col: string): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(
      `[data-nav-table="${tableId}"][data-nav-row="${row}"][data-nav-col="${col}"]`,
    ) ||
    document.querySelector<HTMLElement>(
      `[data-nav-table="${tableId}"][data-nav-row="${row}"][data-nav-col="product"]`,
    )
  );
}

function lastItemRowIndex(tableId: string): number {
  const rows = document.querySelectorAll<HTMLElement>(`[data-nav-table="${tableId}"][data-nav-col="product"]`);
  return rows.length - 1;
}

type Zone =
  | { kind: "customer" }
  | { kind: "quick"; col: string }
  | { kind: "item"; row: number; col: string }
  | { kind: "other" };

function detectZone(target: HTMLElement, customerEl: HTMLElement | null, tableId: string): Zone {
  if (customerEl && (target === customerEl || customerEl.contains(target))) {
    return { kind: "customer" };
  }
  const itemTable = target.closest<HTMLElement>(`[data-nav-table="${tableId}"]`);
  if (itemTable) {
    return {
      kind: "item",
      row: Number(itemTable.getAttribute("data-nav-row") || 0),
      col: itemTable.getAttribute("data-nav-col") || "product",
    };
  }
  const quickZone =
    target.closest<HTMLElement>('[data-nav-zone="quick"]') ||
    target.closest<HTMLElement>(".quick-add-row");
  if (quickZone) {
    const col = target.getAttribute("data-nav-col") || "product";
    return { kind: "quick", col };
  }
  return { kind: "other" };
}

export function useCreatePageNav(opts: CreatePageNavOptions) {
  const { rootRef, customerRef, itemsTableId, quickCols = DEFAULT_QUICK_COLS } = opts;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      const target = e.target as HTMLElement | null;
      if (!target || !root.contains(target)) return;

      const tag = target.tagName;
      if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") return;
      if (tag === "TEXTAREA") return; // textarea owns its own arrows

      // Suggestions list open → leave navigation to the list handler.
      if (isSuggestionsOpen()) return;

      const customerEl = customerRef.current;
      const zone = detectZone(target, customerEl, itemsTableId);

      if (e.key === "ArrowDown") {
        if (zone.kind === "customer") {
          if (focusEl(findQuickInput(root, "product"))) e.preventDefault();
          return;
        }
        if (zone.kind === "quick") {
          // Use the same column (if it exists in the items table), else fall back to product.
          const col = quickCols.includes(zone.col) ? zone.col : "product";
          if (focusEl(findItemCell(itemsTableId, 0, col))) e.preventDefault();
          return;
        }
        if (zone.kind === "other") {
          // Nudge users back into the productive flow.
          if (focusEl(findQuickInput(root, "product"))) e.preventDefault();
          return;
        }
        // items zone → handled by makeRowNavHandler, do nothing here.
        return;
      }

      if (e.key === "ArrowUp") {
        if (zone.kind === "customer") return;
        if (zone.kind === "quick") {
          if (focusEl(customerEl)) e.preventDefault();
          return;
        }
        if (zone.kind === "item") {
          if (zone.row === 0) {
            const col = quickCols.includes(zone.col) ? zone.col : "product";
            if (focusEl(findQuickInput(root, col))) e.preventDefault();
          }
          // row > 0 → makeRowNavHandler moves up between rows.
          return;
        }
        if (zone.kind === "other") {
          if (focusEl(customerEl)) e.preventDefault();
          return;
        }
      }
    };

    root.addEventListener("keydown", handler, true); // capture, runs before field handlers
    return () => root.removeEventListener("keydown", handler, true);
  }, [rootRef, customerRef, itemsTableId, quickCols]);
}
