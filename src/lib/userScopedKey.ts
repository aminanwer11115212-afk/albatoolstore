/**
 * Per-user localStorage key namespacing.
 *
 * Builds a key of the form: `lov:u:{userId}:{scope}:{baseKey}`.
 * Falls back to `guest` before login. The current user id is cached
 * synchronously so callers (hooks, helpers) don't need to await.
 *
 * IMPORTANT: This utility ONLY namespaces keys — it does NOT migrate
 * legacy values. Migration happens explicitly in each hook that needs it,
 * so legacy behavior is preserved during rollout.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cachedUserId: string | null = null;
let initialized = false;
const listeners = new Set<(uid: string | null) => void>();

function setUid(uid: string | null) {
  if (cachedUserId === uid) return;
  cachedUserId = uid;
  listeners.forEach((l) => {
    try { l(uid); } catch { /* noop */ }
  });
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => {
    setUid(data.session?.user?.id ?? null);
  }).catch(() => { /* noop */ });
  supabase.auth.onAuthStateChange((_e, session) => {
    setUid(session?.user?.id ?? null);
  });
}

init();

export function getCurrentUserIdSync(): string | null {
  return cachedUserId;
}

export function userKey(scope: string, baseKey: string): string {
  const uid = cachedUserId ?? "guest";
  return `lov:u:${uid}:${scope}:${baseKey}`;
}

/**
 * Wrap a legacy localStorage key with the current user's namespace, and
 * silently migrate the legacy value on first read.
 *
 * Returns: `lov:u:{uid}:legacy:{legacyKey}`
 *
 * Use this when you have an existing storageKey string that's hard-coded
 * inside another hook (e.g. `useColumnWidths(storageKey, ...)`) and you
 * want to scope it per-user without rewriting the hook.
 */
export function userScopedLegacyKey(legacyKey: string): string {
  const newKey = userKey("legacy", legacyKey);
  try {
    if (typeof window !== "undefined" && localStorage.getItem(newKey) === null) {
      const old = localStorage.getItem(legacyKey);
      if (old !== null) localStorage.setItem(newKey, old);
      // Migrate the companion ":userResized" flag too (used by useColumnWidths).
      const oldFlag = localStorage.getItem(legacyKey + ":userResized");
      if (oldFlag !== null && localStorage.getItem(newKey + ":userResized") === null) {
        localStorage.setItem(newKey + ":userResized", oldFlag);
      }
    }
  } catch { /* noop */ }
  return newKey;
}

export function onUserChange(cb: (uid: string | null) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Reactive variant of `userScopedLegacyKey`.
 *
 * - Returns the current per-user key and re-renders when the auth user changes.
 * - On first render with a real uid, silently migrates from BOTH the legacy
 *   un-namespaced key AND the `guest` namespaced key (in case the page rendered
 *   before the Supabase session resolved).
 *
 * Use this in components instead of calling `userScopedLegacyKey` once in the
 * function body, which would freeze the key to whatever uid existed at render time.
 */
export function useUserScopedLegacyKey(legacyKey: string): string {
  const [uid, setUidState] = useState<string | null>(getCurrentUserIdSync());

  useEffect(() => {
    // Sync once on mount in case auth resolved between module init and this effect.
    setUidState(getCurrentUserIdSync());
    const off = onUserChange((u) => setUidState(u));
    return off;
  }, []);

  const newKey = `lov:u:${uid ?? "guest"}:legacy:${legacyKey}`;

  try {
    if (typeof window !== "undefined" && localStorage.getItem(newKey) === null) {
      // Prefer the un-namespaced legacy value first, then fall back to a guest-scoped
      // value that may have been written before the session resolved.
      const guestKey = `lov:u:guest:legacy:${legacyKey}`;
      const old = localStorage.getItem(legacyKey) ?? (uid ? localStorage.getItem(guestKey) : null);
      if (old !== null) localStorage.setItem(newKey, old);

      const oldFlag =
        localStorage.getItem(legacyKey + ":userResized") ??
        (uid ? localStorage.getItem(guestKey + ":userResized") : null);
      if (oldFlag !== null && localStorage.getItem(newKey + ":userResized") === null) {
        localStorage.setItem(newKey + ":userResized", oldFlag);
      }
    }
  } catch { /* noop */ }

  return newKey;
}
