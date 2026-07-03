import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * منطق Space في جدول البنود:
 *
 * وضع التنقّل (افتراضي بعد Focus، حتى على الحقول النصية المملوءة):
 *   Space يُحدِّد الصف، ضغطتان متتاليتان يحذفانه.
 * وضع التحرير: يُفعَّل بعد Enter داخل الحقل أو نقر بالماوس →
 *   Space يكتب مسافة عادية ولا يُحدِّد الصف.
 * الخروج من التحرير: Tab / Arrow / Escape / blur → يعود لوضع التنقّل.
 */

function fireKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, ...opts });
  Object.defineProperty(ev, "target", { value: target, writable: false });
  target.dispatchEvent(ev);
}

function fireMouseDown(target: EventTarget) {
  const ev = new MouseEvent("mousedown", { bubbles: true });
  Object.defineProperty(ev, "target", { value: target, writable: false });
  target.dispatchEvent(ev);
}

function makeReactKeyEvent(target: HTMLElement) {
  let defaultPrevented = false;
  return {
    key: " ",
    code: "Space",
    target,
    preventDefault: () => {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  } as unknown as React.KeyboardEvent & { defaultPrevented: boolean };
}

function mountTextInput(value = "مسمار") {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  document.body.appendChild(input);
  return input;
}

function mountNumberInput(value = "") {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value;
  document.body.appendChild(input);
  return input;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("useSpaceToDelete — تنقّل = تحديد، تحرير (Enter/نقر) = مسافة", () => {
  it("حقل نصّي فارغ في وضع التنقّل → Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("");
    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-1", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-1")).toBe(true);
  });

  it("حقل نصّي مملوء في وضع التنقّل → Space يُحدِّد الصف (لا كتابة)", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("مسمار قديم");
    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-2", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-2")).toBe(true);
  });

  it("بعد Enter داخل حقل نصّي → Space يكتب مسافة ولا يُحدِّد", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireKey(input, "Enter");

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-3", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("بعد نقر بالماوس داخل حقل نصّي → Space يكتب مسافة", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireMouseDown(input);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-4", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("Escape بعد التحرير يعود للتنقّل → Space يُحدِّد الصف مجدداً", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("قماش");
    fireKey(input, "Enter");
    fireKey(input, "Escape");

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-5", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-5")).toBe(true);
  });

  it("Tab بعد التحرير يعود للتنقّل → Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("لوح");
    fireKey(input, "Enter");
    fireKey(input, "Tab");

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-6", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-6")).toBe(true);
  });

  it("blur يُنهي وضع التحرير → Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("لوح");
    fireKey(input, "Enter");
    const blurEv = new FocusEvent("blur");
    Object.defineProperty(blurEv, "target", { value: input, writable: false });
    input.dispatchEvent(blurEv);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-7", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-7")).toBe(true);
  });

  it("<input type='number'> → Space يُحدِّد دائماً", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountNumberInput("12");
    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-num", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-num")).toBe(true);
  });

  it("ضغطتان متتاليتان على حقل نصّي مملوء → تحذف الصف", async () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("قماش");

    act(() => result.current.handleRowKeyDown("uid-d1", makeReactKeyEvent(input)));
    act(() => result.current.handleRowKeyDown("uid-d1", makeReactKeyEvent(input)));

    await new Promise((r) => setTimeout(r, 0));
    expect(onDelete).toHaveBeenCalledWith("uid-d1");
  });

  it("ضغطتان متتاليتان على حقل رقمي → تحذف الصف", async () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountNumberInput("3");

    act(() => result.current.handleRowKeyDown("uid-d2", makeReactKeyEvent(input)));
    act(() => result.current.handleRowKeyDown("uid-d2", makeReactKeyEvent(input)));

    await new Promise((r) => setTimeout(r, 0));
    expect(onDelete).toHaveBeenCalledWith("uid-d2");
  });

  it("SELECT → Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const sel = document.createElement("select");
    const opt = document.createElement("option");
    opt.value = "a"; opt.textContent = "A";
    sel.appendChild(opt);
    sel.value = "a";
    document.body.appendChild(sel);

    const ev = makeReactKeyEvent(sel);
    act(() => result.current.handleRowKeyDown("uid-sel", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-sel")).toBe(true);
  });

  it("Enter → نقر خارج → blur يعود للتنقّل: Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("مسمار");
    fireKey(input, "Enter");

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    fireMouseDown(outside);

    const blurEv = new FocusEvent("blur");
    Object.defineProperty(blurEv, "target", { value: input, writable: false });
    input.dispatchEvent(blurEv);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-back", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-back")).toBe(true);
  });
});
