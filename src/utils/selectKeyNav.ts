/**
 * Global key handler for native <select> elements:
 * - Backspace: blur the select (closes it implicitly if open) and return focus
 *   to the containing <td> when focusable, otherwise let the browser handle it.
 *   This restores free row/column navigation.
 * - Arrow keys: prevent the default value-change behavior so arrows can be used
 *   for free cell navigation (any row/col handler attached on parents still runs
 *   because we don't stopPropagation).
 *
 * Idempotent: safe to call multiple times.
 */
let attached = false;

export function attachSelectBackspaceClose() {
  if (attached || typeof document === "undefined") return;
  attached = true;

  document.addEventListener(
    "keydown",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.tagName !== "SELECT") return;

      if (e.key === "Backspace") {
        e.preventDefault();
        const sel = t as HTMLSelectElement;
        sel.blur();
        const td = sel.closest("td,th") as HTMLElement | null;
        if (td && typeof td.focus === "function") {
          try { td.focus(); } catch { /* noop */ }
        }
        return;
      }

      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        // Don't change the select's value; let parent nav handler bubble.
        e.preventDefault();
      }
    },
    true, // capture
  );
}
