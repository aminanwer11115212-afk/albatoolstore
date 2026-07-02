import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * منطق Space في حقول جدول البنود (يغطّي فواتير كاش/عادية،
 * عروض عادية/جانبية، مشتريات، مرتجعات — كلها تستخدم نفس الهوك):
 *
 *  - تنقّل بـ Tab/Arrow إلى حقل اسم الصنف (النص كله محدَّد افتراضياً) → Space يُحدِّد الصف.
 *  - نقر بالماوس داخل الحقل ووضع المؤشر → Space يكتب مسافة عادية.
 *  - textarea / contentEditable → Space يكتب دائماً.
 *  - حقول رقمية → Space يُحدِّد دائماً.
 */

function makeKeyEvent(target: HTMLElement) {
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

function makeTextInput(value: string, selStart: number, selEnd: number) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  // jsdom: setSelectionRange تعمل بعد الإضافة للـ DOM
  document.body.appendChild(input);
  input.setSelectionRange(selStart, selEnd);
  return input;
}

describe("useSpaceToDelete — سلوك Space في الحقول النصية", () => {
  it("النقر داخل النص (المؤشر في المنتصف) → Space يكتب مسافة، لا يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = makeTextInput("مسمار", 3, 3); // caret في المنتصف
    const ev = makeKeyEvent(input);

    act(() => result.current.handleRowKeyDown("uid-1", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Tab إلى الحقل (النص كله محدَّد) → Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = makeTextInput("مسمار", 0, "مسمار".length);
    const ev = makeKeyEvent(input);

    act(() => result.current.handleRowKeyDown("uid-2", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-2")).toBe(true);
  });

  it("حقل نصّي فارغ → Space يُحدِّد الصف", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = makeTextInput("", 0, 0);
    const ev = makeKeyEvent(input);

    act(() => result.current.handleRowKeyDown("uid-3", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-3")).toBe(true);
  });

  it("textarea → Space يكتب دائماً", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const ta = document.createElement("textarea");
    const ev = makeKeyEvent(ta);

    act(() => result.current.handleRowKeyDown("uid-4", ev));

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("<input type='number'> → Space يُحدِّد الصف دائماً", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = document.createElement("input");
    input.type = "number";
    const ev = makeKeyEvent(input);

    act(() => result.current.handleRowKeyDown("uid-num", ev));

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-num")).toBe(true);
  });

  it("ضغطتان سريعتان على حقل رقمي → تحذف الصف", async () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = document.createElement("input");
    input.type = "number";

    act(() => result.current.handleRowKeyDown("uid-x", makeKeyEvent(input)));
    act(() => result.current.handleRowKeyDown("uid-x", makeKeyEvent(input)));

    await new Promise((r) => setTimeout(r, 0));
    expect(onDelete).toHaveBeenCalledWith("uid-x");
  });
});
