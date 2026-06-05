import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reusable hook for persisting dialog/popup dimensions per user.
 *
 * Usage:
 *   const { dlgSize, dlgRef } = useDialogSize("transport_dialog", open);
 *   <DialogContent ref={dlgRef} style={{ width: dlgSize?.w, height: dlgSize?.h, resize:"both" }} />
 *
 * The key is scoped to the current authenticated user:
 *   localStorage key = `dlg_size_v2__<userId>__<dialogKey>`
 *
 * If no user session is found it falls back to a global (non-scoped) key
 * so the dialog still works for unauthenticated previews.
 */
export function useDialogSize(
  dialogKey: string,
  open: boolean,
  defaults?: { w?: string; h?: string },
) {
  const [dlgSize, setDlgSize] = useState<{ w: number; h: number } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth <= 640 : false,
  );
  const dlgRef = useRef<HTMLDivElement>(null);
  const userIdRef = useRef<string | null>(null);

  // Track mobile viewport so dialogs go fullscreen on phones
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Resolve current user id (cached for the session)
  const resolveUserId = useCallback(async () => {
    if (userIdRef.current) return userIdRef.current;
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id ?? null;
      userIdRef.current = uid;
      return uid;
    } catch {
      return null;
    }
  }, []);

  const buildKey = useCallback(
    (uid: string | null) => {
      const scope = uid ? `__${uid}` : "";
      return `dlg_size_v2${scope}__${dialogKey}`;
    },
    [dialogKey],
  );

  // Load saved size when dialog opens (skip on mobile — always fullscreen)
  useEffect(() => {
    if (!open || isMobile) return;
    let cancelled = false;
    (async () => {
      const uid = await resolveUserId();
      if (cancelled) return;
      const key = buildKey(uid);
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const p = JSON.parse(raw);
          if (p?.w && p?.h) setDlgSize(p);
        }
      } catch { /* corrupt data — ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open, isMobile, resolveUserId, buildKey]);

  // Observe resize and persist (desktop only)
  useEffect(() => {
    if (!open || isMobile || !dlgRef.current) return;
    const el = dlgRef.current;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;

      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const uid = await resolveUserId();
        const key = buildKey(uid);
        try {
          localStorage.setItem(key, JSON.stringify({ w, h }));
        } catch { /* quota exceeded — silently fail */ }
      }, 300);
    });

    ro.observe(el);
    return () => {
      ro.disconnect();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [open, isMobile, resolveUserId, buildKey]);

  // Mobile: fullscreen, no resize, no min sizes (fits 375px phones)
  const dlgStyle: React.CSSProperties = isMobile
    ? {
        width: "100vw",
        height: "100dvh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
        minWidth: 0,
        minHeight: 0,
        resize: "none",
        overflow: "auto",
        borderRadius: 0,
      }
    : {
        width: dlgSize ? `${dlgSize.w}px` : (defaults?.w ?? "min(1400px, 96vw)"),
        height: dlgSize ? `${dlgSize.h}px` : (defaults?.h ?? "92vh"),
        maxWidth: "98vw",
        maxHeight: "98vh",
        minWidth: 480,
        minHeight: 360,
        resize: "both" as const,
        overflow: "hidden",
      };

  return { dlgSize, dlgRef, dlgStyle };
}
