import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";

/**
 * يضمن هذا الاختبار السلوك المطلوب في جداول البنود بكل الصفحات:
 * - فواتير عادية (InvoiceCreatePage)
 * - فواتير كاش (نفس المكوّن)
 * - عروض أسعار (QuoteCreatePage)
 * - عروض جانبية (SideQuote — نفس المكوّن)
 * - مشتريات (PurchaseCreatePage)
 * - مرتجعات مخزون (StockReturnCreatePage)
 *
 * كلها تستخدم useSpaceToDelete، فاختبار الهوك يغطّي كل الصفحات.
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

describe("useSpaceToDelete — Space inside text inputs", () => {
  const textTypes = ["text", "search", "email", "tel", "url", "password"];

  it.each(textTypes)(
    "لا يُفعّل التحديد ولا يمنع الافتراضي عند Space داخل <input type='%s'>",
    (type) => {
      const onDelete = vi.fn();
      const { result } = renderHook(() => useSpaceToDelete(onDelete));

      const input = document.createElement("input");
      input.type = type;
      const ev = makeKeyEvent(input);

      act(() => {
        result.current.handleRowKeyDown("uid-1", ev);
      });

      expect((ev as any).defaultPrevented).toBe(false);
      expect(result.current.pendingUids.size).toBe(0);
      expect(onDelete).not.toHaveBeenCalled();
    },
  );

  it("لا يُفعّل التحديد عند Space داخل <textarea>", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const ta = document.createElement("textarea");
    const ev = makeKeyEvent(ta);

    act(() => {
      result.current.handleRowKeyDown("uid-1", ev);
    });

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("لا يُفعّل التحديد عند Space داخل عنصر contentEditable", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const div = document.createElement("div");
    div.contentEditable = "true";
    const ev = makeKeyEvent(div);

    act(() => {
      result.current.handleRowKeyDown("uid-1", ev);
    });

    expect((ev as any).defaultPrevented).toBe(false);
    expect(result.current.pendingUids.size).toBe(0);
  });

  it("يُفعّل التحديد ويمنع الافتراضي عند Space داخل <input type='number'>", () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = document.createElement("input");
    input.type = "number";
    const ev = makeKeyEvent(input);

    act(() => {
      result.current.handleRowKeyDown("uid-num", ev);
    });

    expect((ev as any).defaultPrevented).toBe(true);
    expect(result.current.pendingUids.has("uid-num")).toBe(true);
  });

  it("ضغطتان متتاليتان على حقل رقمي يحذفان الصف", async () => {
    const onDelete = vi.fn();
    const { result } = renderHook(() => useSpaceToDelete(onDelete));

    const input = document.createElement("input");
    input.type = "number";

    act(() => {
      result.current.handleRowKeyDown("uid-x", makeKeyEvent(input));
    });
    act(() => {
      result.current.handleRowKeyDown("uid-x", makeKeyEvent(input));
    });

    // انتظر microtask للـ Promise chain داخل الهوك
    await new Promise((r) => setTimeout(r, 0));
    expect(onDelete).toHaveBeenCalledWith("uid-x");
  });
});
