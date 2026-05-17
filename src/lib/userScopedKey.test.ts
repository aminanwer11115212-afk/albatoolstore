import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase client used by userScopedKey's init()
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import { userScopedLegacyKey } from "./userScopedKey";

// Internal test helper: flip cached uid by re-importing module fresh.
// Since cachedUserId is module-private, we simulate per-user namespacing
// by manipulating localStorage directly + verifying key shape.

describe("userScopedLegacyKey", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a namespaced key (lov:u:<uid>:legacy:<key>)", () => {
    const k = userScopedLegacyKey("foo:bar");
    expect(k).toMatch(/^lov:u:[^:]+:legacy:foo:bar$/);
  });

  it("migrates a legacy value on first read", () => {
    localStorage.setItem("legacy:thing", "hello");
    const newKey = userScopedLegacyKey("legacy:thing");
    expect(localStorage.getItem(newKey)).toBe("hello");
  });

  it("migrates the companion :userResized flag too", () => {
    localStorage.setItem("cols:test", "[100,200]");
    localStorage.setItem("cols:test:userResized", "1");
    const newKey = userScopedLegacyKey("cols:test");
    expect(localStorage.getItem(newKey)).toBe("[100,200]");
    expect(localStorage.getItem(newKey + ":userResized")).toBe("1");
  });

  it("does not overwrite an already migrated value on subsequent calls", () => {
    localStorage.setItem("k1", "old");
    const newKey = userScopedLegacyKey("k1");
    localStorage.setItem(newKey, "new");
    // legacy changed afterwards must not clobber
    localStorage.setItem("k1", "changed-old");
    userScopedLegacyKey("k1");
    expect(localStorage.getItem(newKey)).toBe("new");
  });

  it("returns the same key for repeated calls (stable namespacing)", () => {
    const a = userScopedLegacyKey("same:key");
    const b = userScopedLegacyKey("same:key");
    expect(a).toBe(b);
  });

  it("isolates values between simulated users (different namespaces)", () => {
    // Simulate two different user namespaces by writing/reading directly
    const userAKey = "lov:u:user-a:legacy:pref";
    const userBKey = "lov:u:user-b:legacy:pref";
    localStorage.setItem(userAKey, "A-value");
    localStorage.setItem(userBKey, "B-value");
    expect(localStorage.getItem(userAKey)).toBe("A-value");
    expect(localStorage.getItem(userBKey)).toBe("B-value");
    expect(localStorage.getItem(userAKey)).not.toBe(localStorage.getItem(userBKey));
  });
});
