import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * السلوك: في وضع التنقّل (data-nav-col بدون data-edit-mode)
 * Space مفردة = تبديل تحديد الصف. Space مزدوجة خلال 350ms = حذف المحدَّدين.
 * في وضع التعديل (data-edit-mode="true") لا يحدث شيء.
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

function tapSpace() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space" }));
}

beforeEach(() => { document.body.innerHTML = ""; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useSpaceToDelete — Space للتحديد، Space-Space للحذف", () => {
  it("Space مفردة تُبدِّل تحديد الصف الحالي", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u1");
    input.focus();

    act(() => { tapSpace(); });
    expect(result.current.isPending("u1")).toBe(true);

    act(() => { vi.advanceTimersByTime(500); tapSpace(); });
    expect(result.current.isPending("u1")).toBe(false);
  });

  it("Space على صفوف مختلفة يُحدِّد الجميع", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const a = mountRow("a");
    const b = mountRow("b");
    const c = mountRow("c");

    a.focus(); act(() => { tapSpace(); });
    act(() => { vi.advanceTimersByTime(500); });
    b.focus(); act(() => { tapSpace(); });
    act(() => { vi.advanceTimersByTime(500); });
    c.focus(); act(() => { tapSpace(); });

    expect(result.current.isPending("a")).toBe(true);
    expect(result.current.isPending("b")).toBe(true);
    expect(result.current.isPending("c")).toBe(true);
  });

  it("ضغطتان سريعتان على Space تحذف كل المحدَّدين", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const a = mountRow("a");
    const b = mountRow("b");

    a.focus(); act(() => { tapSpace(); });
    act(() => { vi.advanceTimersByTime(500); });
    b.focus(); act(() => { tapSpace(); });

    // ضغطة ثانية سريعة على نفس الصف → حذف
    act(() => { vi.advanceTimersByTime(100); tapSpace(); });
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(onDelete).toHaveBeenCalledWith("a");
    expect(onDelete).toHaveBeenCalledWith("b");
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("في وضع التعديل (data-edit-mode=true) Space لا يُحدِّد ولا يحذف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u2");
    input.setAttribute("data-edit-mode", "true");
    input.focus();

    act(() => { tapSpace(); tapSpace(); });
    expect(result.current.isPending("u2")).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Escape يمسح كل التحديدات", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow("u3");
    input.focus();

    act(() => { tapSpace(); });
    expect(result.current.isPending("u3")).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.isPending("u3")).toBe(false);
  });
});
