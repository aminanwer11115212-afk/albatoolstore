import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * السلوك الجديد: Shift مفردة = تبديل تحديد الصف. Shift مزدوجة = حذف المحدَّدين.
 */

function mountRow(uid: string) {
  const row = document.createElement("tr");
  row.setAttribute("data-row-uid", uid);
  row.setAttribute("data-nav-row", "0");
  row.setAttribute("data-nav-table", "items");
  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("data-nav-col", "product");
  row.appendChild(input);
  document.body.appendChild(row);
  return input;
}

function tapShift() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
}

beforeEach(() => { document.body.innerHTML = ""; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useSpaceToDelete — Shift للتحديد، Shift-Shift للحذف", () => {
  it("Shift مفردة تُبدِّل تحديد الصف الحالي", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u1");
    input.focus();

    act(() => { tapShift(); });
    expect(result.current.isPending("u1")).toBe(true);

    act(() => { vi.advanceTimersByTime(500); tapShift(); });
    expect(result.current.isPending("u1")).toBe(false);
  });

  it("Shift على صفوف مختلفة يُحدِّد الجميع", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const a = mountRow("a");
    const b = mountRow("b");
    const c = mountRow("c");

    a.focus(); act(() => { tapShift(); });
    act(() => { vi.advanceTimersByTime(500); });
    b.focus(); act(() => { tapShift(); });
    act(() => { vi.advanceTimersByTime(500); });
    c.focus(); act(() => { tapShift(); });

    expect(result.current.isPending("a")).toBe(true);
    expect(result.current.isPending("b")).toBe(true);
    expect(result.current.isPending("c")).toBe(true);
  });

  it("ضغطتان سريعتان على Shift تحذف كل المحدَّدين", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const a = mountRow("a");
    const b = mountRow("b");

    a.focus(); act(() => { tapShift(); });
    act(() => { vi.advanceTimersByTime(500); });
    b.focus(); act(() => { tapShift(); });

    // ضغطة ثانية سريعة → حذف
    act(() => { vi.advanceTimersByTime(100); tapShift(); });
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(onDelete).toHaveBeenCalledWith("a");
    expect(onDelete).toHaveBeenCalledWith("b");
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("Shift+حرف (كمُعدِّل) لا يُحدِّد شيئاً", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u2");
    input.focus();

    // محاكاة Shift+A: Shift down → A down → A up → Shift up
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "A", shiftKey: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "A", shiftKey: true }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });

    expect(result.current.isPending("u2")).toBe(false);
  });

  it("Escape يمسح كل التحديدات", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u3");
    input.focus();

    act(() => { tapShift(); });
    expect(result.current.isPending("u3")).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.isPending("u3")).toBe(false);
  });

  it("Space/Enter لا يُطلقان تحديدًا ولا حذفًا", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u4");
    input.focus();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    });

    expect(result.current.isPending("u4")).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
