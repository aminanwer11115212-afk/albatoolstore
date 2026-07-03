import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * المفهوم الجديد: لا يوجد وضع تنقّل/تعديل.
 * - Space/Enter/Tab/الأسهم/الحروف/الأرقام: تعمل عادياً بدون أي حجب.
 * - Ctrl+Delete أو Ctrl+Backspace فقط: يحذف الصف الحالي.
 */

function makeEvent(target: HTMLElement, opts: Partial<KeyboardEventInit> & { key: string }) {
  let defaultPrevented = false;
  let propagationStopped = false;
  return {
    key: opts.key,
    ctrlKey: !!opts.ctrlKey,
    metaKey: !!opts.metaKey,
    shiftKey: !!opts.shiftKey,
    altKey: !!opts.altKey,
    target,
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => { propagationStopped = true; },
    get defaultPrevented() { return defaultPrevented; },
    get propagationStopped() { return propagationStopped; },
  } as unknown as React.KeyboardEvent & { defaultPrevented: boolean };
}

function mountRow() {
  const row = document.createElement("tr");
  row.setAttribute("data-nav-row", "0");
  row.setAttribute("data-nav-table", "items");
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("data-nav-col", "product");
  td.appendChild(input);
  row.appendChild(td);
  document.body.appendChild(row);
  return input;
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("useSpaceToDelete — اختصار Ctrl+Delete لحذف الصف", () => {
  it("Space وحده لا يحذف ولا يمنع الكتابة", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow();
    const ev = makeEvent(input, { key: " " });
    act(() => result.current.handleRowKeyDown("uid-1", ev));
    expect((ev as any).defaultPrevented).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Delete وحده (بدون Ctrl) لا يحذف الصف — يبقى محرّرًا للنص", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow();
    const ev = makeEvent(input, { key: "Delete" });
    act(() => result.current.handleRowKeyDown("uid-2", ev));
    expect((ev as any).defaultPrevented).toBe(false);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Ctrl+Delete يحذف الصف الحالي", async () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow();
    const ev = makeEvent(input, { key: "Delete", ctrlKey: true });
    act(() => result.current.handleRowKeyDown("uid-3", ev));
    expect((ev as any).defaultPrevented).toBe(true);
    expect(onDelete).toHaveBeenCalledWith("uid-3");
  });

  it("Ctrl+Backspace يحذف الصف الحالي أيضاً", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow();
    const ev = makeEvent(input, { key: "Backspace", ctrlKey: true });
    act(() => result.current.handleRowKeyDown("uid-4", ev));
    expect(onDelete).toHaveBeenCalledWith("uid-4");
  });

  it("Meta+Delete (macOS) يحذف الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow();
    const ev = makeEvent(input, { key: "Delete", metaKey: true });
    act(() => result.current.handleRowKeyDown("uid-5", ev));
    expect(onDelete).toHaveBeenCalledWith("uid-5");
  });

  it("Enter/Tab/الأسهم لا تحذف ولا تمنع الافتراضي", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    const input = mountRow();
    for (const key of ["Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      const ev = makeEvent(input, { key });
      act(() => result.current.handleRowKeyDown("uid-x", ev));
      expect((ev as any).defaultPrevented).toBe(false);
    }
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("isPending تُرجع false دائماً (لا يوجد تحديد معلّق)", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));
    expect(result.current.isPending("anything")).toBe(false);
  });
});
