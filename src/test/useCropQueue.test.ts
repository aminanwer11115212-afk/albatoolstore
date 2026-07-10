import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCropQueue } from "@/hooks/useCropQueue";

function img(name: string) {
  return new File([new Uint8Array([1])], name, { type: "image/jpeg" });
}
function pdf(name: string) {
  return new File([new Uint8Array([1])], name, { type: "application/pdf" });
}

describe("useCropQueue", () => {
  it("يفتح حوار القصّ لكل صورة على حِدة ويجمع النتائج قبل الرفع", () => {
    const uploader = vi.fn();
    const { result } = renderHook(() => useCropQueue(uploader));

    act(() => { result.current.start([img("a.jpg"), img("b.jpg"), img("c.jpg")]); });
    expect(result.current.open).toBe(true);
    expect(result.current.current?.name).toBe("a.jpg");
    expect(result.current.remaining).toBe(2);

    const cropped = (n: string) => new File([""], n, { type: "image/jpeg" });
    act(() => { result.current.confirm(cropped("a-cropped.jpg")); });
    expect(result.current.current?.name).toBe("b.jpg");

    act(() => { result.current.confirm(cropped("b-cropped.jpg")); });
    expect(result.current.current?.name).toBe("c.jpg");

    act(() => { result.current.confirm(cropped("c-cropped.jpg")); });
    expect(result.current.open).toBe(false);

    expect(uploader).toHaveBeenCalledTimes(1);
    const uploaded = uploader.mock.calls[0][0] as File[];
    expect(uploaded.map((f) => f.name)).toEqual([
      "a-cropped.jpg",
      "b-cropped.jpg",
      "c-cropped.jpg",
    ]);
  });

  it("يرفع غير الصور فورًا ويتخطّى القصّ لها", () => {
    const uploader = vi.fn();
    const { result } = renderHook(() => useCropQueue(uploader));
    act(() => { result.current.start([pdf("doc.pdf"), img("a.jpg")]); });

    // أول استدعاء للـ uploader: الملفات غير الصورية
    expect(uploader).toHaveBeenCalledTimes(1);
    expect((uploader.mock.calls[0][0] as File[])[0].name).toBe("doc.pdf");
    expect(result.current.current?.name).toBe("a.jpg");
  });

  it("skip يحتفظ بالصورة الأصلية بدون قص", () => {
    const uploader = vi.fn();
    const { result } = renderHook(() => useCropQueue(uploader));
    act(() => { result.current.start([img("a.jpg")]); });
    act(() => { result.current.skip(); });
    expect(uploader).toHaveBeenCalledTimes(1);
    expect((uploader.mock.calls[0][0] as File[])[0].name).toBe("a.jpg");
  });
});
