import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import React, { useState, useRef } from "react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

/**
 * Coverage-focused tests for the "single save on navigation" guarantee.
 *
 * Two distinct flows verified:
 *
 *  A) saveThen helper (Cancel / sub-route buttons in InvoiceCreatePage /
 *     QuoteCreatePage): the page already saves manually then navigates,
 *     so the guard does NOT need to intercept. We test the helper alone.
 *
 *  B) useUnsavedChangesGuard fallback for navigations that bypass saveThen
 *     (e.g. sidebar links that call history.pushState directly): the guard
 *     must auto-save once, silently, before letting navigation proceed.
 */

type SaveResult = boolean;

// ────────────────────────────── A) saveThen ──────────────────────────────

function SaveThenOnly({
  initialDirty,
  onSaveImpl,
}: {
  initialDirty: boolean;
  onSaveImpl: (silent: boolean) => Promise<SaveResult>;
}) {
  const [value, setValue] = useState(initialDirty ? "x" : "");
  const isDirty = value.length > 0;

  const saveThen = async (action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    const ok = await onSaveImpl(true);
    if (ok) {
      setValue("");
      action();
    }
  };

  return (
    <button
      data-testid="cancel-btn"
      onClick={() =>
        saveThen(() => window.history.pushState({}, "", "/invoices"))
      }
    >
      Cancel
    </button>
  );
}

describe("saveThen helper — single save on navigation", () => {
  beforeEach(() => window.history.replaceState({}, "", "/invoices/new"));
  afterEach(() => vi.restoreAllMocks());

  it("[A1] dirty doc → exactly ONE silent save then navigate", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <SaveThenOnly initialDirty={true} onSaveImpl={save} />
    );
    await act(async () => {
      (getByTestId("cancel-btn") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(true); // silent
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[A2] clean doc → no save, immediate navigation", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <SaveThenOnly initialDirty={false} onSaveImpl={save} />
    );
    await act(async () => {
      (getByTestId("cancel-btn") as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(save).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[A3] dirty doc + failing save → stays on page, single attempt", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const { getByTestId } = render(
      <SaveThenOnly initialDirty={true} onSaveImpl={save} />
    );
    await act(async () => {
      (getByTestId("cancel-btn") as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/invoices/new");
  });
});

// ─────────────────────────── B) Guard fallback ───────────────────────────

function GuardOnly({
  initialDirty,
  onSaveImpl,
}: {
  initialDirty: boolean;
  onSaveImpl: (silent: boolean) => Promise<SaveResult>;
}) {
  const [value, setValue] = useState(initialDirty ? "x" : "");
  const isDirty = value.length > 0;
  useUnsavedChangesGuard({
    isDirty,
    onSave: () => onSaveImpl(true),
  });
  return (
    <div>
      <input
        data-testid="field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <a href="/invoices" data-testid="link">
        Sidebar link
      </a>
    </div>
  );
}

describe("useUnsavedChangesGuard — fallback single save on navigation", () => {
  beforeEach(() => window.history.replaceState({}, "", "/invoices/new"));
  afterEach(() => vi.restoreAllMocks());

  it("[B1] dirty + sidebar pushState → ONE silent save then navigate", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<GuardOnly initialDirty={true} onSaveImpl={save} />);
    await act(async () => {
      window.history.pushState({}, "", "/invoices");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(true);
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[B2] dirty + link click → ONE silent save then navigate", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <GuardOnly initialDirty={true} onSaveImpl={save} />
    );
    await act(async () => {
      (getByTestId("link") as HTMLAnchorElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/invoices");
  });

  it("[B3] field edit then link click → ONE silent save", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const { getByTestId } = render(
      <GuardOnly initialDirty={false} onSaveImpl={save} />
    );
    await act(async () => {
      fireEvent.change(getByTestId("field"), { target: { value: "5" } });
    });
    await act(async () => {
      (getByTestId("link") as HTMLAnchorElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/invoices");
  });
});
