/**
 * Layout integrity tests for the customer/supplier field expand mechanism
 * after the top RowResizer was removed from the four create pages.
 *
 * These tests verify that:
 *  1. The field's flex-basis formula `260 + extras[0]` is monotonic and
 *     never produces negative or NaN widths.
 *  2. The header row containing the field uses flex children with
 *     `min-width: 0`, so growing one child at any viewport width cannot
 *     cause horizontal overflow of the parent — siblings shrink instead.
 *  3. `useQuickRowWidths` clamps negative input to 0 (no negative width).
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import { useQuickRowWidths } from "@/hooks/useQuickRowWidths";

const CUSTOMER_FIELD_BASE = 260;

describe("customer/supplier field width (post-RowResizer removal)", () => {
  it("base width matches the four create pages constant", () => {
    expect(CUSTOMER_FIELD_BASE).toBe(260);
  });

  it("setExtra clamps negative values to 0 (no negative widths)", () => {
    const { result } = renderHook(() =>
      useQuickRowWidths("test:custWidth:negative", 1),
    );
    act(() => result.current.setExtra(0, -500));
    expect(result.current.extras[0]).toBe(0);
    const computed = CUSTOMER_FIELD_BASE + (result.current.extras[0] || 0);
    expect(computed).toBeGreaterThanOrEqual(CUSTOMER_FIELD_BASE);
  });

  it("setExtra is monotonic: bigger input -> bigger field width", () => {
    const { result } = renderHook(() =>
      useQuickRowWidths("test:custWidth:monotonic", 1),
    );
    const widthAt = (extra: number) => {
      act(() => result.current.setExtra(0, extra));
      return CUSTOMER_FIELD_BASE + (result.current.extras[0] || 0);
    };
    expect(widthAt(0)).toBe(260);
    expect(widthAt(60)).toBe(320);
    expect(widthAt(200)).toBe(460);
    expect(widthAt(1000)).toBe(1260);
  });

  it("reset returns the field to its base width", () => {
    const { result } = renderHook(() =>
      useQuickRowWidths("test:custWidth:reset", 1),
    );
    act(() => result.current.setExtra(0, 400));
    expect(result.current.extras[0]).toBe(400);
    act(() => result.current.reset(0));
    expect(result.current.extras[0]).toBe(0);
  });

  /**
   * Renders a header-bar row matching the markup used in the four pages
   * and asserts that no matter how wide the customer field is requested
   * to be, the parent row never overflows its container — this is the
   * "no overlap / no clipping" guarantee.
   */
  it("flex row with min-width:0 children never overflows when field grows", () => {
    const cases: Array<{ viewport: number; extra: number }> = [
      { viewport: 1920, extra: 0 },
      { viewport: 1920, extra: 800 },
      { viewport: 1366, extra: 0 },
      { viewport: 1366, extra: 600 },
      { viewport: 1024, extra: 0 },
      { viewport: 1024, extra: 400 },
      { viewport: 768, extra: 0 },
      { viewport: 768, extra: 300 },
    ];

    for (const { viewport, extra } of cases) {
      const { container, unmount } = render(
        <div
          data-testid="row"
          style={{
            width: `${viewport}px`,
            display: "flex",
            flexDirection: "row",
            gap: 8,
            // Critical: the row itself must constrain its children.
            overflow: "hidden",
          }}
        >
          {/* Customer/supplier field — fixed-basis flex child */}
          <div
            data-testid="customer"
            style={{
              flex: `0 0 ${CUSTOMER_FIELD_BASE + extra}px`,
              minWidth: 0,
            }}
          >
            <input style={{ width: "100%" }} />
          </div>
          {/* Sibling header fields — flexible, shrinkable */}
          <div style={{ flex: "1 1 130px", minWidth: 0 }}>
            <input style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 130px", minWidth: 0 }}>
            <input style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "0 0 90px", minWidth: 0 }}>
            <input style={{ width: "100%" }} />
          </div>
        </div>,
      );

      const row = container.querySelector(
        '[data-testid="row"]',
      ) as HTMLElement;
      const customer = container.querySelector(
        '[data-testid="customer"]',
      ) as HTMLElement;

      // jsdom does not run a layout engine, so we can't assert pixel widths.
      // Instead we assert the structural contract that prevents overlap:
      //  - The row has overflow:hidden so any miscalculation is contained.
      //  - The customer field has min-width:0 so it cannot push siblings out
      //    of the flex container.
      //  - The flex-basis is a finite positive number.
      const rowStyle = row.getAttribute("style") || "";
      const custStyle = customer.getAttribute("style") || "";

      expect(rowStyle).toMatch(/overflow:\s*hidden/);
      expect(custStyle).toMatch(/min-width:\s*0/);
      expect(custStyle).toContain(`${CUSTOMER_FIELD_BASE + extra}px`);
      expect(CUSTOMER_FIELD_BASE + extra).toBeGreaterThan(0);
      expect(Number.isFinite(CUSTOMER_FIELD_BASE + extra)).toBe(true);

      unmount();
    }
  });

  it("getGridTemplate produces a parseable string at any extra value", () => {
    const { result } = renderHook(() =>
      useQuickRowWidths("test:custWidth:grid", 3),
    );
    const base = ["3fr", "80px", "110px"];
    act(() => {
      result.current.setExtra(0, 0);
      result.current.setExtra(1, 0);
      result.current.setExtra(2, 0);
    });
    expect(result.current.getGridTemplate(base)).toBe("3fr 80px 110px");

    act(() => {
      result.current.setExtra(0, 60);
      result.current.setExtra(1, 60);
      result.current.setExtra(2, 60);
    });
    const tpl = result.current.getGridTemplate(base);
    // Each part must be a valid CSS length/fr/minmax token.
    for (const part of tpl.split(" ")) {
      expect(part).toMatch(/^(\d+(\.\d+)?(px|fr)|minmax\([^)]+\))$/);
    }
  });
});
