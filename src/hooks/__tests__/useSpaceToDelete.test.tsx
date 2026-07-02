import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * منطق Space في جدول البنود (يغطّي فواتير كاش/عادية،
 * عروض عادية/جانبية، مشتريات، مرتجعات — كلها تستخدم نفس الهوك):
 *
 * وضع التنقّل (افتراضي بعد Focus): Space يُحدِّد/يحذف الصف.
 * وضع التحرير: يُفعَّل بعد Enter داخل الحقل أو نقر بالماوس → Space يكتب مسافة.
 * الخروج من التحرير: Tab / Arrow / Escape / blur.
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

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("useSpaceToDelete — وضع التنقّل ↔ وضع التحرير عبر Enter", () => {
  it("افتراضياً (وضع التنقّل) على حقل نصّي → Space لا يُحدِّد ولا يحذف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-1", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("بعد Enter داخل الحقل → Space يكتب مسافة ولا يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireKey(input, "Enter");

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-2", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("بعد نقر بالماوس داخل الحقل → Space يكتب مسافة", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireMouseDown(input);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-3", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("Tab بعد وضع التحرير يعود للتنقّل → Space لا يُحدِّد على حقل نصّي", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireKey(input, "Enter");
    fireKey(input, "Tab");

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-4", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("Escape بعد التحرير يعود للتنقّل → Space لا يُحدِّد على حقل نصّي", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireKey(input, "Enter");
    fireKey(input, "Escape");

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-5", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("blur يُنهي وضع التحرير → Space يعود لعدم التحديد على حقل نصّي", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput();
    fireKey(input, "Enter");
    const blurEv = new FocusEvent("blur");
    Object.defineProperty(blurEv, "target", { value: input, writable: false });
    input.dispatchEvent(blurEv);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-6", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("<input type='number'> → Space يُحدِّد دائماً (لا يتأثر بوضع التحرير)", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-num", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-num")).toBe(true);
  });

  it("ضغطتان سريعتان على حقل رقمي → تحذف الصف", async () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);

    act(() => result.current.handleRowKeyDown("uid-x", makeReactKeyEvent(input)));
    act(() => result.current.handleRowKeyDown("uid-x", makeReactKeyEvent(input)));

    await new Promise((r) => setTimeout(r, 0));
    expect(onDelete).toHaveBeenCalledWith("uid-x");
  });

  it("بيانات قديمة: حقل مملوء والمؤشر داخل النص (ليس تحديدًا كاملًا) → Space يكتب مسافة ولا يُحدِّد", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("مسمار قديم");
    // مؤشر في منتصف النص، بدون Enter/كليك
    input.setSelectionRange(3, 3);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-old-1", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("بيانات قديمة: تحديد جزئي داخل النص → Space يكتب مسافة ولا يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("مسمار قديم");
    input.setSelectionRange(1, 4); // تحديد جزء فقط

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-old-2", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("بيانات قديمة: بعد أول Space مع مؤشر داخل النص، يبقى الحقل في وضع التحرير للضغطات التالية", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("قماش");
    input.setSelectionRange(2, 2);

    act(() => result.current.handleRowKeyDown("uid-old-3", makeReactKeyEvent(input)));
    // حتى لو صار التحديد كاملًا لاحقًا، الحقل مُثبَّت في وضع التحرير
    input.setSelectionRange(0, input.value.length);
    const ev2 = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-old-3", ev2));

    expect((ev2 as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("بيانات قديمة: Tab بعد Space يُخرج الحقل من وضع التحرير → Space لاحقاً لا يُحدِّد لكن أيضاً لا يكتب اختصارًا", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput("لوح");
    input.setSelectionRange(1, 1);

    act(() => result.current.handleRowKeyDown("uid-old-4", makeReactKeyEvent(input)));
    fireKey(input, "Tab");
    // نص كامل محدَّد (كأنه focus جديد بـ Tab)
    input.setSelectionRange(0, input.value.length);

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-old-4", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("حقل فارغ في وضع التنقّل → Space لا يكتب ولا يُحدِّد (يجب Enter/كليك أولاً)", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = mountTextInput(""); // فارغ

    const ev = makeReactKeyEvent(input);
    act(() => result.current.handleRowKeyDown("uid-empty", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });
});
