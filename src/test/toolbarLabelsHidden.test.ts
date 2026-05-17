import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useToolbarLabels } from "@/components/toolbar/useToolbarLabels";
import { useToolbarHidden } from "@/components/toolbar/useToolbarHidden";

beforeEach(() => { localStorage.clear(); });

describe("useToolbarLabels — تخصيص نصوص بطاقات شريط المجموع", () => {
  it("يُرجع التسمية الافتراضية بلا تخصيص", () => {
    const { result } = renderHook(() => useToolbarLabels("invoice-create-toolbar"));
    expect(result.current.getLabel("sum-total", "المجموع")).toBe("المجموع");
  });

  it("يحفظ تسمية مخصّصة ويسترجعها", () => {
    const { result } = renderHook(() => useToolbarLabels("invoice-create-toolbar"));
    act(() => result.current.setLabel("sum-total", "الإجمالي النهائي"));
    expect(result.current.getLabel("sum-total", "المجموع")).toBe("الإجمالي النهائي");
  });

  it("يُزيل التسمية عند تمرير null أو فراغ", () => {
    const { result } = renderHook(() => useToolbarLabels("invoice-create-toolbar"));
    act(() => result.current.setLabel("sum-total", "X"));
    act(() => result.current.setLabel("sum-total", null));
    expect(result.current.getLabel("sum-total", "المجموع")).toBe("المجموع");
  });

  it("reset() يمسح كل التسميات", () => {
    const { result } = renderHook(() => useToolbarLabels("quote-create-toolbar"));
    act(() => result.current.setLabel("sum-count", "عدد البنود"));
    act(() => result.current.reset());
    expect(result.current.getLabel("sum-count", "عدد")).toBe("عدد");
  });

  it("التخزين معزول لكل screenKey", () => {
    const a = renderHook(() => useToolbarLabels("invoice-create-toolbar"));
    const b = renderHook(() => useToolbarLabels("quote-create-toolbar"));
    act(() => a.result.current.setLabel("sum-total", "AAA"));
    expect(b.result.current.getLabel("sum-total", "المجموع")).toBe("المجموع");
  });
});

describe("useToolbarHidden — إخفاء/إظهار بطاقات الملخّص", () => {
  it("يبدأ بقائمة فارغة", () => {
    const { result } = renderHook(() => useToolbarHidden("invoice-create-toolbar"));
    expect(result.current.hidden).toEqual([]);
    expect(result.current.isHidden("sum-tax")).toBe(false);
  });

  it("hide ثم show يعمل بشكل صحيح", () => {
    const { result } = renderHook(() => useToolbarHidden("invoice-create-toolbar"));
    act(() => result.current.hide("sum-tax"));
    expect(result.current.isHidden("sum-tax")).toBe(true);
    act(() => result.current.show("sum-tax"));
    expect(result.current.isHidden("sum-tax")).toBe(false);
  });

  it("hide لا يكرّر نفس المعرّف", () => {
    const { result } = renderHook(() => useToolbarHidden("invoice-create-toolbar"));
    act(() => { result.current.hide("x"); result.current.hide("x"); });
    expect(result.current.hidden).toEqual(["x"]);
  });

  it("reset() يفرغ القائمة", () => {
    const { result } = renderHook(() => useToolbarHidden("invoice-create-toolbar"));
    act(() => { result.current.hide("a"); });
    act(() => { result.current.hide("b"); });
    act(() => { result.current.reset(); });
    expect(result.current.hidden).toEqual([]);
  });
});
