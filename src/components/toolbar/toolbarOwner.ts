import { getCurrentUserIdSync, onUserChange } from "@/lib/userScopedKey";
import { getFormFactorSync } from "@/hooks/useFormFactor";
import { useEffect, useState } from "react";

const DEVICE_KEY = "neobilling:device-id";

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

/**
 * Per-user × per-form-factor identity used for toolbar storage.
 *
 * Format: `u_<uid>:ff:<mobile|desktop>`. Falls back to `<deviceId>:ff:<ff>`
 * before login. Each user gets independent mobile vs desktop toolbar state
 * so customizing the phone never affects the desktop layout and vice versa.
 */
export function getToolbarOwnerId(): string {
  const ff = getFormFactorSync();
  const uid = getCurrentUserIdSync();
  if (uid) return `u_${uid}:ff:${ff}`;
  return `${getDeviceId()}:ff:${ff}`;
}

/**
 * Build a per-owner + per-screen storage key for toolbar state with silent
 * migration from older key shapes.
 *
 * Migration order (only when the new key is empty):
 *   1. `<prefix>:u_<uid>:<screenKey>`           — old owner without form factor.
 *      Copied ONLY to the desktop bucket; mobile starts fresh so it can
 *      pick up phone-appropriate defaults.
 *   2. `<prefix>:<deviceId>:<screenKey>`        — pre-login legacy.
 */
export function toolbarStorageKey(prefix: string, screenKey: string): string {
  const ff = getFormFactorSync();
  const owner = getToolbarOwnerId();
  const newKey = `${prefix}:${owner}:${screenKey}`;
  if (typeof window === "undefined") return newKey;
  try {
    if (localStorage.getItem(newKey) !== null) return newKey;

    // 1) Old user-scoped key without form factor → desktop only.
    const uid = getCurrentUserIdSync();
    if (uid && ff === "desktop") {
      const oldUserKey = `${prefix}:u_${uid}:${screenKey}`;
      const v = localStorage.getItem(oldUserKey);
      if (v !== null) {
        localStorage.setItem(newKey, v);
        return newKey;
      }
    }

    // 2) Pre-login device key (any form factor).
    const deviceKey = `${prefix}:${getDeviceId()}:${screenKey}`;
    if (deviceKey !== newKey) {
      const v = localStorage.getItem(deviceKey);
      if (v !== null) localStorage.setItem(newKey, v);
    }
  } catch {
    /* noop */
  }
  return newKey;
}

/**
 * Reactive subscription token — changes whenever the toolbar owner changes
 * (user signs in/out, viewport crosses the mobile/desktop breakpoint).
 *
 * Use in a hook's `useEffect` deps to re-read state from localStorage when
 * the underlying key shifts.
 */
export function useToolbarOwnerToken(): string {
  const [token, setToken] = useState<string>(() => getToolbarOwnerId());

  useEffect(() => {
    const refresh = () => {
      const next = getToolbarOwnerId();
      setToken((prev) => (prev === next ? prev : next));
    };
    const off = onUserChange(refresh);
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      const mql = window.matchMedia("(max-width: 640px)");
      const onMq = () => refresh();
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onMq);
        return () => {
          off();
          mql.removeEventListener("change", onMq);
        };
      }
      const legacy = mql as unknown as { addListener: (cb: () => void) => void; removeListener: (cb: () => void) => void };
      legacy.addListener(onMq);
      return () => {
        off();
        legacy.removeListener(onMq);
      };
    }
    return off;
  }, []);

  return token;
}
