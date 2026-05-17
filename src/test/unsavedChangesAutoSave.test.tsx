import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import React, { useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";

/**
 * Verifies the auto-save behavior of useUnsavedChangesGuard:
 * - When the page is dirty and the user clicks an internal link
 *   (e.g. "آخر الفواتير"), onSave runs silently and navigation proceeds.
 * - No Dialog is rendered (dialogProps.open stays false).
 * - If onSave fails, navigation is aborted (still no dialog).
 */

function TestHarness({
  isDirty,
  onSave,
  startPath = "/quotes/new",
}: {
  isDirty: boolean;
  onSave: () => Promise<boolean> | boolean;
  startPath?: string;
}) {
  // ensure starting URL
  if (typeof window !== "undefined" && window.location.pathname !== startPath) {
    window.history.replaceState({}, "", startPath);
  }
  const { dialogProps } = useUnsavedChangesGuard({ isDirty, onSave });
  return (
    <div>
      <a href="/invoices" data-testid="recent-invoices-link">
        آخر الفواتير
      </a>
      <span data-testid="dialog-open">{String(dialogProps.open)}</span>
    </div>
  );
}

describe("useUnsavedChangesGuard — auto-save on internal navigation", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/quotes/new");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-saves silently when clicking a link with unsaved changes (no dialog)", async () => {
    const onSave = vi.fn().mockResolvedValue(true);

    const { getByTestId } = render(<TestHarness isDirty={true} onSave={onSave} />);

    expect(getByTestId("dialog-open").textContent).toBe("false");

    const link = getByTestId("recent-invoices-link") as HTMLAnchorElement;

    await act(async () => {
      link.click();
      // allow microtasks for the async onSave to resolve
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    // Navigation proceeded
    expect(window.location.pathname).toBe("/invoices");
    // Dialog never opened
    expect(getByTestId("dialog-open").textContent).toBe("false");
  });

  it("does not call onSave or open a dialog when there are no unsaved changes", async () => {
    const onSave = vi.fn().mockResolvedValue(true);

    const { getByTestId } = render(<TestHarness isDirty={false} onSave={onSave} />);
    const link = getByTestId("recent-invoices-link") as HTMLAnchorElement;

    await act(async () => {
      link.click();
      await Promise.resolve();
    });

    // Guard does not intercept clean navigation: onSave never runs, no dialog.
    expect(onSave).not.toHaveBeenCalled();
    expect(getByTestId("dialog-open").textContent).toBe("false");
  });

  it("aborts navigation if onSave fails — still no dialog", async () => {
    const onSave = vi.fn().mockResolvedValue(false);

    const { getByTestId } = render(<TestHarness isDirty={true} onSave={onSave} />);
    const link = getByTestId("recent-invoices-link") as HTMLAnchorElement;

    await act(async () => {
      link.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    // Stays on original page
    expect(window.location.pathname).toBe("/quotes/new");
    // Still no dialog
    expect(getByTestId("dialog-open").textContent).toBe("false");
  });

  it("integration: editing a field then clicking a link triggers a single auto-save", async () => {
    const saveSpy = vi.fn().mockResolvedValue(true);

    function Page() {
      const [value, setValue] = useState("");
      const isDirty = value.length > 0;
      useUnsavedChangesGuard({
        isDirty,
        onSave: async () => {
          saveSpy(value);
          return true;
        },
      });
      return (
        <div>
          <input
            data-testid="qty-field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <a href="/invoices" data-testid="recent-invoices-link">
            آخر الفواتير
          </a>
        </div>
      );
    }

    window.history.replaceState({}, "", "/quotes/new");
    const { getByTestId } = render(<Page />);

    // Simulate user editing a field (becomes dirty)
    await act(async () => {
      fireEvent.change(getByTestId("qty-field"), { target: { value: "5" } });
    });

    // Click "آخر الفواتير"
    await act(async () => {
      (getByTestId("recent-invoices-link") as HTMLAnchorElement).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith("5");
    expect(window.location.pathname).toBe("/invoices");
  });
});
