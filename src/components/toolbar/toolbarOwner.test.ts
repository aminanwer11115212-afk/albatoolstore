import { describe, it, expect, beforeEach } from "vitest";
import { getToolbarOwnerId, toolbarStorageKey } from "./toolbarOwner";

beforeEach(() => {
  localStorage.clear();
});

describe("getToolbarOwnerId", () => {
  it("includes form factor segment", () => {
    const owner = getToolbarOwnerId();
    expect(owner).toMatch(/:ff:(mobile|desktop)$/);
  });
});

describe("toolbarStorageKey migration", () => {
  it("migrates from device-scoped legacy key on first read", () => {
    // Simulate a legacy pre-login value written under the device id.
    localStorage.setItem("neobilling:device-id", "dev-abc");
    localStorage.setItem(
      "neobilling:toolbar-order:v2:dev-abc:my-screen",
      JSON.stringify(["a", "b"]),
    );
    const k = toolbarStorageKey("neobilling:toolbar-order:v2", "my-screen");
    expect(localStorage.getItem(k)).toBe(JSON.stringify(["a", "b"]));
  });

  it("does NOT overwrite an existing new-key value", () => {
    const k1 = toolbarStorageKey("neobilling:toolbar-order:v2", "x");
    localStorage.setItem(k1, JSON.stringify(["new"]));
    const k2 = toolbarStorageKey("neobilling:toolbar-order:v2", "x");
    expect(k1).toBe(k2);
    expect(localStorage.getItem(k2)).toBe(JSON.stringify(["new"]));
  });
});
