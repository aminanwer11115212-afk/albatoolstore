/**
 * البند 6 — مشاركة المرفق: الصورة وحدها بلا اسم الملف.
 *
 * كل نداءات زرّ المشاركة كانت تمرّر `text={att.file_name}`، فيصل المستلم على
 * واتساب سطرٌ نصّي فيه `17857000106409110774407288145045-cropped.jpg` فوق
 * الصورة — اسمٌ آليّ لا يقرؤه أحد ولا يعني شيئاً للعميل.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { shareFileNative } from "@/utils/shareFileNative";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const ATTACHMENT_DIALOGS = [
  "src/components/invoice/InvoiceAttachmentsDialog.tsx",
  "src/components/quote/QuoteAttachmentsDialog.tsx",
  "src/components/purchase/PurchaseAttachmentsDialog.tsx",
];

describe("navigator.share يستقبل الملف وحده", () => {
  let share: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: () => true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/jpeg" }),
    }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("بلا نص: لا `text` ولا `title` في الحمولة", async () => {
    const out = await shareFileNative({
      url: "https://example.test/a.jpg",
      fileName: "17857000106409110774407288145045-cropped.jpg",
      mimeType: "image/jpeg",
    });
    expect(out).toBe("file");
    const payload = share.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(["files"]);
    expect(payload.files).toHaveLength(1);
  });

  it("النص يُرسل حين يُطلب صراحةً — الخيار باقٍ لمن يحتاجه", async () => {
    await shareFileNative({
      url: "https://example.test/a.jpg",
      fileName: "a.jpg",
      text: "إيصال الدفعة",
      title: "مشاركة",
    });
    const payload = share.mock.calls[0][0];
    expect(payload.text).toBe("إيصال الدفعة");
  });

  it("اسم الملف يبقى على الملف نفسه — المحذوف هو السطر النصّي فقط", async () => {
    await shareFileNative({ url: "https://example.test/a.jpg", fileName: "receipt.jpg" });
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe("receipt.jpg");
  });
});

describe("لا نداءَ متروكاً يمرّر اسم الملف نصّاً", () => {
  it.each(ATTACHMENT_DIALOGS)("%s", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/text=\{att\.file_name\}/);
  });
});
