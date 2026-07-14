import { useCallback, useEffect, useRef } from "react";

interface Options {
  /** Whether the page currently has unsaved changes. */
  isDirty: boolean;
  /**
   * Async function that persists the current draft.
   * Should return true on success, false to abort navigation.
   */
  onSave: () => Promise<boolean> | boolean;
}

/**
 * Guards against navigating away from a page with unsaved changes.
 * Auto-saves silently on SPA navigation; only blocks if save fails.
 * Still warns on tab close / refresh via beforeunload (browser-native).
 */
export function useUnsavedChangesGuard({ isDirty, onSave }: Options) {
  const isDirtyRef = useRef(isDirty);
  const onSaveRef = useRef(onSave);
  const savingRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Native browser warning (close tab / refresh)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const autoSaveAndProceed = useCallback((proceed: () => void) => {
    // Try to save; only proceed if save succeeds. Aborts navigation on failure.
    if (savingRef.current) return;
    savingRef.current = true;
    Promise.resolve()
      .then(() => onSaveRef.current())
      .then((ok) => {
        savingRef.current = false;
        if (ok === false) return; // abort
        isDirtyRef.current = false;
        proceed();
      })
      .catch(() => {
        savingRef.current = false;
        // treat throw as failure — do not navigate
      });
  }, []);

  // Intercept SPA navigations: link clicks + history API + back/forward.
  useEffect(() => {
    const currentPath = window.location.pathname;

    const blockNavigation = (proceed: () => void) => {
      void autoSaveAndProceed(proceed);
    };

    const onClick = (e: MouseEvent) => {
      if (!isDirtyRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname) return;
        e.preventDefault();
        blockNavigation(() => {
          window.history.pushState({}, "", url.pathname + url.search + url.hash);
          window.dispatchEvent(new PopStateEvent("popstate"));
        });
      } catch {
        /* ignore */
      }
    };

    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    const wrap = (orig: typeof window.history.pushState) =>
      function (this: History, ...args: Parameters<typeof window.history.pushState>) {
        const [, , url] = args;
        if (isDirtyRef.current && url) {
          try {
            const next = new URL(url.toString(), window.location.href);
            if (next.pathname !== window.location.pathname) {
              blockNavigation(() => {
                orig.apply(this, args);
                // Notify React Router of the navigation after silent save
                window.dispatchEvent(new PopStateEvent("popstate"));
              });
              return;
            }
          } catch {
            /* fall through */
          }
        }
        return orig.apply(this, args);
      };
    window.history.pushState = wrap(origPush) as typeof window.history.pushState;
    window.history.replaceState = wrap(origReplace) as typeof window.history.replaceState;

    const onPopState = () => {
      if (!isDirtyRef.current) return;
      if (window.location.pathname === currentPath) return;
      const targetPath = window.location.pathname + window.location.search + window.location.hash;
      origPush.call(window.history, {}, "", currentPath);
      blockNavigation(() => {
        origPush.call(window.history, {}, "", targetPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, [autoSaveAndProceed]);

  // Backward-compatible return shape (dialog never opens).
  return {
    dialogProps: {
      open: false,
      saving: false,
      onSaveAndContinue: () => {},
      onDiscardAndContinue: () => {},
      onCancel: () => {},
    },
  };
}
