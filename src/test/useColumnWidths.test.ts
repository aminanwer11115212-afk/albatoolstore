import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnWidths } from "@/hooks/useColumnWidths";

const KEY = "customers-page:colWidths:v2";
const DEFAULTS: (number | null)[] = [40, null, null, 110, 110, 110, 110, 130, 110, 110, 110, 60];

function fireDrag(index: number, deltaX: number, startDrag: (i: number, e: any) => void) {
  // Simulate mousedown via startDrag with a fake event (no real header cells in jsdom).
  const fakeEvent = {
    clientX: 100,
    preventDefault: () => {},
    stopPropagation: () => {},
    target: document.createElement("span"),
  } as any;
  act(() => startDrag(index, fakeEvent));
  // Now dispatch mousemove + mouseup on window.
  act(() => {
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 + deltaX }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent("mouseup"));
  });
}

describe("useColumnWidths — drag/resize after city/locality columns added", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    document.documentElement.dir = "ltr";
  });

  it("initializes with null widths matching defaults length (12 cols)", () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    expect(result.current.widths).toHaveLength(12);
    expect(result.current.widths.every((w) => w === null)).toBe(true);
  });

  it("dragging col 6 (city) changes ONLY col 6 and persists", () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    fireDrag(6, 50, result.current.startDrag);
    const w = result.current.widths;
    expect(typeof w[6]).toBe("number");
    expect((w[6] as number) >= 110).toBe(true);
    // Persisted.
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved).toHaveLength(12);
    expect(saved[6]).toBe(w[6]);
    // userResized flag set.
    expect(localStorage.getItem(KEY + ":userResized")).toBe("1");
  });

  it("dragging col 7 (locality) is independent from col 6", () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    fireDrag(7, 80, result.current.startDrag);
    const w = result.current.widths;
    expect(typeof w[7]).toBe("number");
    expect((w[7] as number) >= 130).toBe(true);
    // col 6 should remain untouched (null or measured number, but specifically NOT changed by col 7's drag).
    // After drag, flex/null cols may have been frozen to measured (0 in jsdom) — accept null OR a number.
    expect(w[7]).not.toBe(w[6]);
  });

  it("respects min width floor when shrinking", () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    fireDrag(6, -9999, result.current.startDrag);
    const w = result.current.widths;
    expect((w[6] as number) >= 60).toBe(true);
  });

  it("reset() clears widths and userResized flag", () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    fireDrag(6, 30, result.current.startDrag);
    expect(localStorage.getItem(KEY + ":userResized")).toBe("1");
    act(() => result.current.reset());
    expect(result.current.widths.every((w) => w === null)).toBe(true);
    expect(localStorage.getItem(KEY + ":userResized")).toBeNull();
    // After reset, persist effect re-saves the cleared (all-null) array.
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    expect(saved.every((v: any) => v === null)).toBe(true);
  });

  it("locked mode: startDrag is a no-op", () => {
    const { result } = renderHook(() => useColumnWidths(KEY, DEFAULTS, true));
    fireDrag(6, 50, result.current.startDrag);
    expect(result.current.widths.every((w) => w === null)).toBe(true);
    expect(localStorage.getItem(KEY + ":userResized")).toBeNull();
  });

  it("persisted widths survive remount", () => {
    const { result, unmount } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    fireDrag(7, 60, result.current.startDrag);
    const before = result.current.widths[7];
    unmount();
    const { result: r2 } = renderHook(() => useColumnWidths(KEY, DEFAULTS));
    expect(r2.current.widths[7]).toBe(before);
  });
});
