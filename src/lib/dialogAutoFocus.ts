/**
 * Helper used by Dialog and Sheet content components to automatically
 * focus the first writable input inside the popup when it opens.
 *
 * Triggers the on-screen keyboard on mobile (iOS/Android) because the
 * focus call happens synchronously inside the user gesture that opened
 * the dialog.
 *
 * Opt-out by setting `data-no-autofocus` on the dialog content element
 * (e.g. confirmation dialogs that don't have any text inputs).
 */

const WRITABLE_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([disabled]):not([readonly]):not([aria-hidden="true"])',
  "textarea:not([disabled]):not([readonly]):not([aria-hidden=\"true\"])",
  '[contenteditable="true"]:not([aria-hidden="true"])',
].join(", ");

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute("data-no-autofocus")) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  // Don't auto-focus inputs inside a hidden parent
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    if (parent.hasAttribute("data-no-autofocus")) return false;
    parent = parent.parentElement;
  }
  return true;
}

/**
 * onOpenAutoFocus handler for Radix Dialog/Sheet Content.
 * Returns a callback that prevents Radix's default focus and instead
 * focuses the first writable input.
 */
export function handleOpenAutoFocus(event: Event) {
  const container = event.currentTarget as HTMLElement | null;
  if (!container) return;
  // Explicit opt-out
  if (container.hasAttribute("data-no-autofocus")) return;

  const candidates = Array.from(container.querySelectorAll<HTMLElement>(WRITABLE_SELECTOR));
  const target = candidates.find(isVisible);
  if (!target) return;

  // Prevent Radix from focusing the dialog container or first focusable
  event.preventDefault();
  // Focus on next frame so layout/transitions settle (helps iOS keyboard)
  requestAnimationFrame(() => {
    try {
      target.focus({ preventScroll: false });
      // For text inputs, place caret at end if empty value to avoid awkward selection
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        const v = target.value;
        if (v && typeof target.setSelectionRange === "function") {
          try { target.setSelectionRange(v.length, v.length); } catch { /* ignore */ }
        }
      }
    } catch {
      /* ignore */
    }
  });
}
