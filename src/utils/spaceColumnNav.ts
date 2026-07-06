/**
 * Two-mode Space behaviour for the items tables (invoices / quotes /
 * purchases / stock-returns) and their quick-add row.
 *
 *   - Nav mode (default when focus arrives via keyboard / programmatic
 *     focus / tab / arrows): pressing Space jumps to the next
 *     `data-nav-col` cell in the same row without selecting text or
 *     inserting a space.
 *   - Edit mode (activated by a real mouse/touch pointerdown on the
 *     cell): Space types a normal space, everything works as a regular
 *     input.
 *
 * Idempotent — safe to call multiple times.
 */

const EDIT_ATTR = "data-edit-mode";

let attached = false;

function isEligibleCell(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const he = el as HTMLElement;
  if (!he.hasAttribute("data-nav-col")) return false;
  // Only scope to items table cells or the quick-add row.
  if (
    !he.closest("[data-nav-table]") &&
    !he.closest(".quick-add-row") &&
    !he.closest('[data-nav-zone="quick"]')
  ) return false;
  // Textareas should always behave normally (multiline needs real spaces).
  if (he.tagName === "TEXTAREA") return false;
  return true;
}

function rowContext(el: HTMLElement): { root: HTMLElement | Document; rowSelector: string | null } {
  const inTable = el.closest<HTMLElement>("[data-nav-table]");
  if (inTable) {
    const table = inTable.getAttribute("data-nav-table")!;
    const row = inTable.getAttribute("data-nav-row") ?? "";
    return {
      root: document,
      rowSelector: `[data-nav-table="${table}"][data-nav-row="${row}"][data-nav-col]`,
    };
  }
  const quick =
    el.closest<HTMLElement>(".quick-add-row") ||
    el.closest<HTMLElement>('[data-nav-zone="quick"]');
  if (quick) {
    // Use the quick row element itself as root; select all nav cells within it.
    return { root: quick, rowSelector: `[data-nav-col]` };
  }
  return { root: document, rowSelector: null };
}

function focusNextInRow(current: HTMLElement) {
  const ctx = rowContext(current);
  if (!ctx.rowSelector) return false;
  const cells = Array.from(
    (ctx.root as ParentNode).querySelectorAll<HTMLElement>(ctx.rowSelector),
  );
  const idx = cells.indexOf(current);
  if (idx < 0) return false;
  const next = cells[idx + 1];
  if (!next) return false;
  next.focus({ preventScroll: false });
  // Do NOT select text — this is navigation mode.
  return true;
}

export function attachSpaceColumnNav() {
  if (attached || typeof document === "undefined") return;
  attached = true;

  // Mouse/touch activation → edit mode on the pressed cell.
  const onPointerDown = (e: PointerEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const cell = el.closest<HTMLElement>("[data-nav-col]");
    if (!isEligibleCell(cell)) return;
    cell!.setAttribute(EDIT_ATTR, "true");
  };

  // Losing focus resets the cell back to nav mode for next visit.
  const onFocusOut = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.hasAttribute?.(EDIT_ATTR)) return;
    el.removeAttribute(EDIT_ATTR);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== " " && e.code !== "Space") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (!isEligibleCell(el)) return;
    // Edit mode → let the browser insert a space.
    if (el.getAttribute(EDIT_ATTR) === "true") return;
    // Nav mode → jump to next column without inserting a space.
    e.preventDefault();
    focusNextInRow(el);
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("keydown", onKeyDown, true);
}
