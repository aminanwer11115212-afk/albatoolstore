import { describe, it, expect } from "vitest";
import { buildCroppedFile, isImageFile } from "@/utils/cropImage";

function fakeBlob(mime: string) {
  return new Blob([new Uint8Array([1, 2, 3, 4])], { type: mime });
}

describe("buildCroppedFile", () => {
  it("يُنتج JPEG صالحًا من مصدر JPEG", () => {
    const source = new File([new Uint8Array([9])], "photo.jpg", { type: "image/jpeg" });
    const out = buildCroppedFile(fakeBlob("image/jpeg"), source);
    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo-cropped.jpg");
    expect(out.size).toBeGreaterThan(0);
  });

  it("يحافظ على PNG عندما يكون المصدر PNG", () => {
    const source = new File([new Uint8Array([9])], "logo.png", { type: "image/png" });
    const out = buildCroppedFile(fakeBlob("image/png"), source);
    expect(out.type).toBe("image/png");
    expect(out.name).toBe("logo-cropped.png");
  });

  it("يحوّل WebP/HEIC إلى JPEG (fallback آمن)", () => {
    const source = new File([new Uint8Array([9])], "photo.webp", { type: "image/webp" });
    const out = buildCroppedFile(fakeBlob("image/webp"), source);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo-cropped.jpg");
  });

  it("يدعم اسمًا بدون امتداد", () => {
    const source = new File([new Uint8Array([9])], "noext", { type: "image/jpeg" });
    const out = buildCroppedFile(fakeBlob("image/jpeg"), source);
    expect(out.name).toBe("noext-cropped.jpg");
  });

  it("يُطبّق suffix مُخصّص إن طُلب", () => {
    const source = new File([new Uint8Array([9])], "a.jpg", { type: "image/jpeg" });
    const out = buildCroppedFile(fakeBlob("image/jpeg"), source, { suffix: "-v2" });
    expect(out.name).toBe("a-v2.jpg");
  });
});

describe("isImageFile", () => {
  it("يميّز الصور من الملفات الأخرى", () => {
    expect(isImageFile(new File([""], "a.jpg", { type: "image/jpeg" }))).toBe(true);
    expect(isImageFile(new File([""], "a.png", { type: "image/png" }))).toBe(true);
    expect(isImageFile(new File([""], "a.pdf", { type: "application/pdf" }))).toBe(false);
    expect(isImageFile(new File([""], "a", { type: "" }))).toBe(false);
  });
});

