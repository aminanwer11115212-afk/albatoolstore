import { getCurrentUserIdSync } from "@/lib/userScopedKey";

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
 * Identity used for per-screen toolbar storage. Prefers the signed-in
 * user id so each user has independent toolbar customizations on the
 * same browser. Falls back to the device id (legacy) before login.
 */
export function getToolbarOwnerId(): string {
  const uid = getCurrentUserIdSync();
  if (uid) return `u_${uid}`;
  return getDeviceId();
}

/**
 * Build a per-owner + per-screen storage key for toolbar state, and
 * silently migrate a value from a legacy device-scoped key on first
 * read for this owner.
 *
 * - `prefix`: e.g. "neobilling:toolbar-positions:v2"
 * - `screenKey`: e.g. "quote-create-toolbar"
 *
 * Migration policy: if the new (owner-scoped) key has no value yet,
 * copy the value from the device-scoped key (same prefix + same
 * screenKey) so the user's existing customization is preserved.
 */
export function toolbarStorageKey(prefix: string, screenKey: string): string {
  const owner = getToolbarOwnerId();
  const newKey = `${prefix}:${owner}:${screenKey}`;
  try {
    if (typeof window !== "undefined" && localStorage.getItem(newKey) === null) {
      const legacyDeviceKey = `${prefix}:${getDeviceId()}:${screenKey}`;
      if (legacyDeviceKey !== newKey) {
        const legacy = localStorage.getItem(legacyDeviceKey);
        if (legacy !== null) localStorage.setItem(newKey, legacy);
      }
    }
  } catch { /* noop */ }
  return newKey;
}
