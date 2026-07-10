import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { fetchImageAsFile } from "@/utils/fetchImageAsFile";
import { useRecropImage } from "@/hooks/useRecropImage";

const originalFetch = globalThis.fetch;

describe("fetchImageAsFile", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      const isPng = u.endsWith(".png");
      const type = isPng ? "image/png" : "image/jpeg";
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type });
      return {
        ok: true,
        status: 200,
        blob: async () => blob,
      } as any;
    });
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("يستنتج mime وname من رابط JPEG", async () => {
    const f = await fetchImageAsFile("https://example.com/path/photo.jpg?token=xyz");
    expect(f).toBeInstanceOf(File);
    expect(f.type).toBe("image/jpeg");
    expect(f.name).toBe("photo.jpg");
    expect(f.size).toBe(3);
  });

  it("يستنتج mime PNG من الامتداد", async () => {
    const f = await fetchImageAsFile("https://example.com/x/logo.png");
    expect(f.type).toBe("image/png");
    expect(f.name).toBe("logo.png");
  });

  it("يستخدم fallbackName عندما لا يمكن استخراج الاسم", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      blob: async () => new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
    } as any));
    const f = await fetchImageAsFile("not a url", "fallback.jpg");
    expect(f.name).toBe("fallback.jpg");
  });

  it("يرمي خطأ عند فشل التنزيل", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 } as any));
    await expect(fetchImageAsFile("https://x/y.jpg")).rejects.toThrow(/404/);
  });
});

describe("useRecropImage", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200,
      blob: async () => new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }),
    } as any));
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("يفتح مع File جاهز واسم يحمل لاحقة -recropped، ثم يستدعي onCropped عند التأكيد", async () => {
    const onCropped = vi.fn();
    const { result } = renderHook(() => useRecropImage());

    await act(async () => {
      await result.current.start({
        url: "https://example.com/img/photo.jpg",
        onCropped,
      });
    });

    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.file?.name).toBe("photo-recropped.jpg");
    expect(result.current.file?.type).toBe("image/jpeg");

    const cropped = new File([new Uint8Array([1])], "photo-cropped.jpg", { type: "image/jpeg" });
    await act(async () => { await result.current.confirm(cropped); });

    expect(onCropped).toHaveBeenCalledOnce();
    expect(onCropped.mock.calls[0][0].name).toBe("photo-cropped.jpg");
    expect(result.current.open).toBe(false);
  });

  it("cancel يُغلق بدون استدعاء onCropped", async () => {
    const onCropped = vi.fn();
    const { result } = renderHook(() => useRecropImage());
    await act(async () => {
      await result.current.start({ url: "https://x/y.jpg", onCropped });
    });
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => { result.current.cancel(); });
    expect(result.current.open).toBe(false);
    expect(onCropped).not.toHaveBeenCalled();
  });
});
