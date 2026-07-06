/**
 * Two-mode behaviour for items-table cells and the quick-add row.
 *
 *   - Nav mode (default when focus arrives via keyboard / Tab / arrows /
 *     programmatic focus): the cell shows no caret and refuses typing.
 *     Space is reserved for row selection (see `useSpaceToDelete`).
 *   - Edit mode: activated by a real mouse/touch pointerdown OR by
 *     pressing Shift while a cell is focused. Caret appears, typing works
 *     as usual, Space inserts a regular space.
 *
 * A floating pill in the corner reflects the current mode. Visual cell
 * state is styled in index.css via `data-edit-mode` / `data-nav-col`.
 *
 * Idempotent — safe to call multiple times.
 */

const EDIT_ATTR = "data-edit-mode";

let attached = false;
let detach: (() => void) | null = null;
let pendingFocusOutTimer: number | null = null;

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

function setEditMode(cell: HTMLElement) {
  cell.setAttribute(EDIT_ATTR, "true");
  updateModeIndicator(cell);
  if (cell instanceof HTMLInputElement && typeof cell.setSelectionRange === "function") {
    try {
      const v = cell.value ?? "";
      cell.setSelectionRange(v.length, v.length);
    } catch { /* ignore */ }
  }
}

/* -------- Mode indicator: على الصف نفسه عبر data-row-mode -------- */
function clearRowModeAttr() {
  const prev = document.querySelectorAll<HTMLElement>("[data-row-mode]");
  prev.forEach((el) => el.removeAttribute("data-row-mode"));
}
function updateModeIndicator(cell: HTMLElement | null) {
  clearRowModeAttr();
  if (!cell || !isEligibleCell(cell)) return;
  const row = cell.closest<HTMLElement>("tr, .quick-add-row, [data-nav-zone='quick']");
  if (!row) return;
  row.setAttribute("data-row-mode", inEditMode(cell) ? "edit" : "nav");
}

export function attachSpaceColumnNav() {
  if (attached || typeof document === "undefined") return;
  attached = true;

  const onPointerDown = (e: PointerEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const cell = el.closest<HTMLElement>("[data-nav-col]");
    if (!isEligibleCell(cell)) return;
    setEditMode(cell!);
  };

  const onFocusIn = (e: FocusEvent) => {
    // Cancel any pending focusout cleanup — the new focus target wins.
    if (pendingFocusOutTimer !== null) {
      clearTimeout(pendingFocusOutTimer);
      pendingFocusOutTimer = null;
    }
    const el = e.target as HTMLElement | null;
    updateModeIndicator(el && isEligibleCell(el) ? el : null);
  };

  const onFocusOut = (e: FocusEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.hasAttribute?.(EDIT_ATTR)) el.removeAttribute(EDIT_ATTR);
    if (pendingFocusOutTimer !== null) clearTimeout(pendingFocusOutTimer);
    pendingFocusOutTimer = window.setTimeout(() => {
      pendingFocusOutTimer = null;
      const active = document.activeElement as HTMLElement | null;
      updateModeIndicator(active && isEligibleCell(active) ? active : null);
    }, 0);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (!isEligibleCell(el)) return;

    // Shift مفردة → دخول وضع التعديل فوراً.
    if (e.key === "Shift" && !e.repeat && !inEditMode(el)) {
      setEditMode(el);
      return;
    }

    if (inEditMode(el)) return;

    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("beforeinput", onBeforeInput, true);
}
