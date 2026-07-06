/**
 * Two-mode behaviour for items-table cells and the quick-add row.
 *
 *   - Nav mode (default when focus arrives via keyboard / Tab / arrows /
 *     programmatic focus): the cell shows no caret and refuses typing.
 *     Space is reserved for row selection (see `useSpaceToDelete`).
 *   - Edit mode (activated by a real mouse/touch pointerdown on the
 *     cell): the caret appears, typing works as usual, Space inserts a
 *     regular space.
 *
 * Visual state is exposed via data attributes; CSS in index.css styles
 * them (orange row outline, yellow focused cell, transparent caret).
 *
 * Idempotent — safe to call multiple times.
 */

const EDIT_ATTR = "data-edit-mode";

let attached = false;

function isEligibleCell(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const he = el as HTMLElement;
  if (!he.hasAttribute("data-nav-col")) return false;
  if (
    !he.closest("[data-nav-table]") &&
    !he.closest(".quick-add-row") &&
    !he.closest('[data-nav-zone="quick"]')
  ) return false;
  if (he.tagName === "TEXTAREA") return false;
  return true;
}

function inEditMode(el: HTMLElement): boolean {
  return el.getAttribute(EDIT_ATTR) === "true";
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

  // Losing focus resets the cell back to nav mode for the next visit.
  const onFocusOut = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || !el.hasAttribute?.(EDIT_ATTR)) return;
    el.removeAttribute(EDIT_ATTR);
  };

  // Nav mode: block any printable-key typing / paste / IME composition.
  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (!isEligibleCell(el)) return;
    if (inEditMode(el)) return;
    // Space is claimed by row-selection (useSpaceToDelete). Prevent the
    // browser from typing a space; the selection handler still receives it.
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      return;
    }
    // Allow navigation / modifier combos to pass through untouched.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Block single printable characters and destructive edits in nav mode.
    if (e.key.length === 1) e.preventDefault();
    else if (e.key === "Backspace" || e.key === "Delete") e.preventDefault();
  };

  const onBeforeInput = (e: Event) => {
    const el = e.target as HTMLElement | null;
    if (!isEligibleCell(el)) return;
    if (inEditMode(el)) return;
    e.preventDefault();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("beforeinput", onBeforeInput, true);
}
