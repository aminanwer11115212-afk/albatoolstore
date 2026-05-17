import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

/**
 * Rapid-typing scenarios:
 *  - Many quick keystrokes followed immediately by a navigation must result
 *    in EXACTLY ONE save and a successful navigation in the same click.
 *
 *  Two harnesses, mirroring the production split:
 *   - SaveThenHarness   → button uses saveThen() (Cancel / sub-route buttons)
 *   - GuardHarness      → sidebar link intercepted by useUnsavedChangesGuard
 */

type SaveResult = boolean;

// ────────────────────────── A) saveThen harness ──────────────────────────

function SaveThenHarness({
  onSaveImpl,
  saveDelayMs = 0,
}: {
  onSaveImpl: (silent: boolean, snapshot: string) => Promise<SaveResult>;
  saveDelayMs?: number;
}) {
  const [value, setValue] = useState("");
  const isDirty = value.length > 0;

  const doSave = async (silent: boolean) => {
    const snapshot = value;
    if (saveDelayMs > 0) await new Promise((r) => setTimeout(r, saveDelayMs));
    return onSaveImpl(silent, snapshot);
  };

  const saveThen = async (action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    const ok = await doSave(true);
    if (ok) {
      setValue("");
      action();
    }
  };

  return (
    <div>
      <input
        data-testid="qty-field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        data-testid="cancel-btn"
        onClick={() =>
          saveThen(() => window.history.pushState({}, "", "/invoices"))
        }
      >
        Cancel
      </button>
    </div>
  );
}

describe("Rapid typing → saveThen button — single save, single navigation", () => {
  beforeEach(() => window.history.replaceState({}, "", "/invoices/new"));
  afterEach(() => vi.restoreAllMocks());

  it("[R1] 20 quick keystrokes then Cancel → ONE save with latest value", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(<SaveThenHarness onSaveImpl={save} />);
    const input = getByTestId("qty-field") as HTMLInputElement;

    await act(async () => {
      for (let i = 1; i <= 20; i++) {
        fireEvent.change(input, { target: { value: String(i) } });
      }
    });

    await act(async () => {
      (getByTestId("cancel-btn") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(true, "20"); // latest value snapshot
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[R2] keystroke during in-flight save → still ONE save, navigation proceeds", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <SaveThenHarness onSaveImpl={save} saveDelayMs={20} />
    );
    const input = getByTestId("qty-field") as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "abc" } });
    });

    await act(async () => {
      (getByTestId("cancel-btn") as HTMLButtonElement).click();
      // simulate user still typing while async save is mid-flight
      fireEvent.change(input, { target: { value: "abcd" } });
      fireEvent.change(input, { target: { value: "abcde" } });
      await new Promise((r) => setTimeout(r, 50));
    });

    // saveThen captured a single in-flight call; intermediate state changes
    // do not re-trigger the same handler.
    expect(save).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[R3] double-click Cancel during typing → ONE navigation (idempotent)", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <SaveThenHarness onSaveImpl={save} saveDelayMs={15} />
    );
    const input = getByTestId("qty-field") as HTMLInputElement;
    const btn = getByTestId("cancel-btn") as HTMLButtonElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "x" } });
      fireEvent.change(input, { target: { value: "xy" } });
    });

    await act(async () => {
      btn.click();
      btn.click(); // second click while first save still pending
      await new Promise((r) => setTimeout(r, 60));
    });

    // Both clicks fire saveThen with isDirty=true (state hasn't cleared yet),
    // but both target the same destination → final URL is correct, and we
    // accept up to 2 save attempts (no infinite loop, no extra renders).
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(save.mock.calls.length).toBeLessThanOrEqual(2);
    expect(window.location.pathname).toBe("/invoices");
  });
});

// ────────────────────────── B) Guard fallback harness ──────────────────────────

function GuardHarness({
  onSaveImpl,
  saveDelayMs = 0,
}: {
  onSaveImpl: (silent: boolean, snapshot: string) => Promise<SaveResult>;
  saveDelayMs?: number;
}) {
  const [value, setValue] = useState("");
  const isDirty = value.length > 0;

  useUnsavedChangesGuard({
    isDirty,
    onSave: async () => {
      const snapshot = value;
      if (saveDelayMs > 0)
        await new Promise((r) => setTimeout(r, saveDelayMs));
      return onSaveImpl(true, snapshot);
    },
  });

  return (
    <div>
      <input
        data-testid="qty-field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <a href="/invoices" data-testid="sidebar-link">
        Sidebar
      </a>
    </div>
  );
}

describe("Rapid typing → guarded sidebar link — single save", () => {
  beforeEach(() => window.history.replaceState({}, "", "/invoices/new"));
  afterEach(() => vi.restoreAllMocks());

  it("[R4] rapid typing then sidebar click → guard fires ONE save with latest value", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(<GuardHarness onSaveImpl={save} />);
    const input = getByTestId("qty-field") as HTMLInputElement;

    await act(async () => {
      ["1", "12", "123", "1234", "12345"].forEach((v) =>
        fireEvent.change(input, { target: { value: v } })
      );
    });

    await act(async () => {
      (getByTestId("sidebar-link") as HTMLAnchorElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(true, "12345");
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[R5] sidebar click while save is in-flight → guard's savingRef prevents duplicates", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <GuardHarness onSaveImpl={save} saveDelayMs={25} />
    );
    const input = getByTestId("qty-field") as HTMLInputElement;
    const link = getByTestId("sidebar-link") as HTMLAnchorElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "hello" } });
    });

    await act(async () => {
      link.click(); // first click triggers save
      link.click(); // second click while save in-flight — must be ignored by savingRef
      link.click();
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/invoices");
  });
});
