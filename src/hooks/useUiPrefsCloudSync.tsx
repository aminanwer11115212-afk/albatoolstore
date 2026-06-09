/**
 * Cloud sync layer for UI preferences (column widths + lock state).
 *
 * Strategy:
 *   - On mount (and on auth change to a logged-in user): pull rows from
 *     `user_ui_preferences` for the SYNCED_KEYS and write them to localStorage,
 *     then dispatch the same custom events the column hooks already listen to,
 *     so any open page updates instantly.
 *   - On every change to a SYNCED_KEY in localStorage (storage event OR our
 *     custom events), debounce-push the new value to the cloud row for the
 *     current user.
 *   - If the user is logged out, fall back to localStorage-only behavior
 *     (existing default).
 *
 * No changes are required to the four create pages or to useColumnWidths.tsx
 * itself — this hook is mounted once at the App level.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  SHARED_COLS_WIDTHS_KEY,
  SHARED_COLS_LOCKED_KEY,
} from "./useColumnWidths";

const SHARED_UPDATE_EVENT = "colwidths-shared-update";
const SHARED_LOCK_EVENT = "colwidths-shared-lock";
const HIDDEN_COLS_EVENT = "recent-sidebar-hidden-update";

const SYNCED_KEYS = [SHARED_COLS_WIDTHS_KEY, SHARED_COLS_LOCKED_KEY] as const;

// Hidden-columns keys for the recent-items sidebar (per type).
const HIDDEN_COLS_KEYS = [
  "recent-sidebar:hidden:invoices:v1",
  "recent-sidebar:hidden:quotes:v1",
  "recent-sidebar:hidden:purchases:v1",
] as const;

// Explicit keys that must always sync.
const EXPLICIT_KEYS: readonly string[] = [
  ...SYNCED_KEYS,
  ...HIDDEN_COLS_KEYS,
  "albatoul_appearance",
  "albatoul_theme",
  "customers-page:showDashboard",
  "colwidths:resetBtn",
  "invoice-create:colWidths:v3",
  "purchase-create:colWidths:v3",
  "quote-create:colWidths:v3",
  "quote-create:colsLocked:v1",
];

// Prefix-based sync: any key starting with one of these auto-syncs.
// Covers future per-page customizations without code changes.
const SYNCED_PREFIXES: readonly string[] = [
  "neobilling:toolbar",       // toolbar order/labels/lock per page
  "colwidths:",               // any column widths
  "recent-sidebar:",          // sidebar hidden columns / order
  "albatoul_",                // appearance / theme / preferences
  "ui:",                      // generic UI prefs (future-proof)
  "page:",                    // per-page prefs (future-proof)
  "lov:u:",                   // per-user (and per-form-factor) scoped prefs
];

function isSyncedKey(k: string): boolean {
  if (EXPLICIT_KEYS.includes(k)) return true;
  return SYNCED_PREFIXES.some((p) => k.startsWith(p));
}

// Parse the stored localStorage value into the JSONB-safe shape used in DB.
function parseLocal(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    if (key === SHARED_COLS_LOCKED_KEY) return raw === "true";
    // Try JSON first; fall back to raw string for plain-text prefs.
    try { return JSON.parse(raw); } catch { return raw; }
  } catch {
    return null;
  }
}

// Convert a DB value back to its localStorage string representation.
function serializeForLocal(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (key === SHARED_COLS_LOCKED_KEY) return value ? "true" : "false";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return null; }
}

function dispatchUpdated(key: string) {
  if (typeof window === "undefined") return;
  if (key === SHARED_COLS_WIDTHS_KEY) {
    let widths: unknown = null;
    try {
      const raw = localStorage.getItem(key);
      widths = raw ? JSON.parse(raw) : null;
    } catch {
      /* noop */
    }
    window.dispatchEvent(
      new CustomEvent(SHARED_UPDATE_EVENT, { detail: { key, widths } })
    );
  } else if (key === SHARED_COLS_LOCKED_KEY) {
    const locked = localStorage.getItem(key) === "true";
    window.dispatchEvent(
      new CustomEvent(SHARED_LOCK_EVENT, { detail: { locked } })
    );
  } else if (HIDDEN_COLS_KEYS.includes(key as (typeof HIDDEN_COLS_KEYS)[number])) {
    let hidden: unknown = null;
    try {
      const raw = localStorage.getItem(key);
      hidden = raw ? JSON.parse(raw) : [];
    } catch {
      hidden = [];
    }
    window.dispatchEvent(
      new CustomEvent(HIDDEN_COLS_EVENT, { detail: { key, hidden } })
    );
  }
}

export function useUiPrefsCloudSync() {
  const userIdRef = useRef<string | null>(null);
  // Debounce timers per key.
  const pushTimers = useRef<Record<string, number | undefined>>({});
  // Track values we just wrote *from* the cloud so we don't echo them back.
  const justAppliedFromCloud = useRef<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;

    const pullFromCloud = async (uid: string) => {
      try {
        const { data, error } = await supabase
          .from("user_ui_preferences")
          .select("key, value")
          .eq("user_id", uid);
        if (error || cancelled || !data) return;
        for (const row of data) {
          const key = row.key as string;
          if (!isSyncedKey(key)) continue;
          const next = serializeForLocal(key, row.value);
          if (next === null) continue;
          const cur = localStorage.getItem(key);
          if (cur === next) continue;
          justAppliedFromCloud.current[key] = next;
          localStorage.setItem(key, next);
          dispatchUpdated(key);
        }
      } catch {
        /* noop — cloud unavailable, fall back to localStorage */
      }
    };

    const ric: (cb: () => void) => void =
      (window as Window & { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback
        ? (cb) => (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(cb)
        : (cb) => window.setTimeout(cb, 0) as unknown as void;

    const pushToCloud = (key: string) => {
      const uid = userIdRef.current;
      if (!uid) return;
      // Cancel previous timer for this key.
      const prev = pushTimers.current[key];
      if (prev) window.clearTimeout(prev);
      // Debounce 1s + idle callback → الكتابة السحابية لا تزاحم الـ main thread.
      pushTimers.current[key] = window.setTimeout(() => {
        ric(async () => {
          try {
            const value = parseLocal(key);
            if (value === null) return;
            await supabase
              .from("user_ui_preferences")
              .upsert(
                { user_id: uid, key, value: value as never, updated_at: new Date().toISOString() },
                { onConflict: "user_id,key" }
              );
          } catch {
            /* noop */
          }
        });
      }, 1000);
    };

    const handleLocalChange = (key: string) => {
      // Skip echo of values we just applied from cloud.
      const justApplied = justAppliedFromCloud.current[key];
      const cur = localStorage.getItem(key);
      if (justApplied !== undefined && justApplied === cur) {
        justAppliedFromCloud.current[key] = null;
        return;
      }
      pushToCloud(key);
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (!isSyncedKey(e.key)) return;
      handleLocalChange(e.key);
    };
    const onWidthsCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      const k = detail?.key;
      if (!k || !isSyncedKey(k)) return;
      handleLocalChange(k);
    };
    const onLockCustom = () => {
      handleLocalChange(SHARED_COLS_LOCKED_KEY);
    };
    const onHiddenCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key?: string } | undefined;
      const k = detail?.key;
      if (!k || !isSyncedKey(k)) return;
      handleLocalChange(k);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SHARED_UPDATE_EVENT, onWidthsCustom as EventListener);
    window.addEventListener(SHARED_LOCK_EVENT, onLockCustom as EventListener);
    window.addEventListener(HIDDEN_COLS_EVENT, onHiddenCustom as EventListener);

    // Patch localStorage.setItem to capture same-tab writes for ANY synced key.
    // (storage event fires only across tabs, so we need this for in-tab updates.)
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    (localStorage as any).setItem = (k: string, v: string) => {
      originalSetItem(k, v);
      if (isSyncedKey(k)) {
        try { handleLocalChange(k); } catch { /* noop */ }
      }
    };
    (localStorage as any).removeItem = (k: string) => {
      originalRemoveItem(k);
      if (isSyncedKey(k)) {
        try { handleLocalChange(k); } catch { /* noop */ }
      }
    };

    // Watch auth state.
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id ?? null;
      userIdRef.current = uid;
      if (uid) pullFromCloud(uid);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      const prev = userIdRef.current;
      userIdRef.current = uid;
      if (uid && uid !== prev) {
        // Defer to avoid running inside the auth callback.
        setTimeout(() => pullFromCloud(uid), 0);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SHARED_UPDATE_EVENT, onWidthsCustom as EventListener);
      window.removeEventListener(SHARED_LOCK_EVENT, onLockCustom as EventListener);
      window.removeEventListener(HIDDEN_COLS_EVENT, onHiddenCustom as EventListener);
      (localStorage as any).setItem = originalSetItem;
      (localStorage as any).removeItem = originalRemoveItem;
      sub.subscription.unsubscribe();
      Object.values(pushTimers.current).forEach((t) => {
        if (t) window.clearTimeout(t);
      });
    };
  }, []);
}
