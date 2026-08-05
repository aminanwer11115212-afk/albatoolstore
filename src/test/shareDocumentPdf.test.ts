/**
 * مشاركة PDF عبر واتساب — اسم الملف واحد على كل أنواع الأجهزة.
 *
 * الخطر الذي تحرسه هذه الاختبارات: أن يُبنى اسم الملف في كل فرع على حدة،
 * فيستقبل العميل ملفاً باسم مختلف حسب هاتف المُرسِل. الاسم يُبنى مرّة ويُمرَّر
 * إلى `File.name` و`a.download` معاً، والاختبارات تقارن الفروع الثلاثة فعلياً.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pdfNameFor, shareDocumentPdf, downloadBlob } from "@/utils/shareDocumentPdf";

const DOC = {
  html: "<html><body><div>مستند</div></body></html>",
  docLabel: "فاتورة مبيعات",
  customerName: "ايهاب الدين امدرمان",
  docNumber: "INV-61463",
  total: 350000,
  message: "تفضّل فاتورتك",
  phone: "0900000000",
};
/**
 * الاسم المطلوب: **اسم العميل والمبلغ فقط**.
 *
 * طلبه صاحب المستودع: «أيّ PDF ينزل أو يُشارَك الفاتورة من أيّ مكان يظهر
 * بإسم العميل ومبلغ الفاتورة فقط». والنوع والرقم يبقيان في الورقة نفسها.
 */
const EXPECTED = "ايهاب الدين امدرمان - 350,000.pdf";

// html2pdf غير قابل للتشغيل في jsdom — نستبدله بـblob ثابت
vi.mock("html2pdf.js", () => ({
  default: () => ({
    set: () => ({
      from: () => ({ outputPdf: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }) }),
    }),
  }),
}));

let sharedFiles: File[] = [];
let downloadedNames: string[] = [];
let opened: string[] = [];

beforeEach(() => {
  sharedFiles = [];
  downloadedNames = [];
  opened = [];
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:mock",
    revokeObjectURL: () => {},
  });
  vi.stubGlobal("open", (u: string) => { opened.push(u); return null; });
  // التقاط اسم التنزيل من نقرة الرابط
  const origClick = HTMLAnchorElement.prototype.click;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    if (this.download) downloadedNames.push(this.download);
  });
  void origClick;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // تنظيف ما ثبّتناه على navigator
  delete (navigator as any).canShare;
  delete (navigator as any).share;
});

/** جوال يدعم مشاركة الملفات */
function mobileWithFileShare() {
  (navigator as any).canShare = (d: any) => Array.isArray(d?.files) && d.files.length > 0;
  (navigator as any).share = async (d: any) => { sharedFiles = d.files; };
}
/** جوال بمشاركة نصّية فقط — لا يدعم الملفات */
function mobileWithoutFileShare() {
  (navigator as any).canShare = () => false;
  (navigator as any).share = async () => {};
}
/** سطح مكتب — لا مشاركة إطلاقاً */
function desktop() {
  (navigator as any).canShare = undefined;
  (navigator as any).share = undefined;
}

describe("اسم الملف قبل أي مشاركة", () => {
  it("يطابق الصيغة الموحّدة", () => {
    expect(pdfNameFor(DOC)).toBe(EXPECTED);
  });

  it("ونوع المستند لا يغيّره — العميل والمبلغ لا غير", () => {
    expect(pdfNameFor({ ...DOC, docLabel: "عرض سعر", docNumber: "QT-12" })).toBe(EXPECTED);
  });

  it("مستند بلا مبلغ: اسم العميل وحده بلا فاصلة معلّقة", () => {
    expect(pdfNameFor({ ...DOC, docNumber: null, total: 0 }))
      .toBe("ايهاب الدين امدرمان.pdf");
  });

  it("وبلا عميلٍ ولا مبلغ يسقط إلى نوع المستند — لا «مستند» مجرّدة", () => {
    expect(pdfNameFor({ ...DOC, customerName: "", total: 0 })).toBe("فاتورة مبيعات.pdf");
  });
});

describe("الفروع الثلاثة تُنتج الاسم نفسه", () => {
  it("جوال يدعم مشاركة الملفات: الاسم في File.name", async () => {
    mobileWithFileShare();
    const out = await shareDocumentPdf(DOC);
    expect(out).toEqual({ via: "web-share", fileName: EXPECTED });
    expect(sharedFiles).toHaveLength(1);
    expect(sharedFiles[0].name).toBe(EXPECTED);
    expect(sharedFiles[0].type).toBe("application/pdf");
    expect(downloadedNames).toEqual([]); // لا تنزيل خلف ظهر المستخدم
  });

  it("جوال بلا مشاركة ملفات: الاسم في a.download ثم يُفتح واتساب", async () => {
    mobileWithoutFileShare();
    const out = await shareDocumentPdf(DOC);
    expect(out).toEqual({ via: "download", fileName: EXPECTED });
    expect(downloadedNames).toEqual([EXPECTED]);
    expect(opened).toHaveLength(1);
    // الرقم يُطبَّع لصيغة دولية (رمز الدولة الافتراضي) قبل فتح واتساب
    expect(opened[0]).toMatch(/^whatsapp:\/\/send\?phone=\d+/);
    expect(opened[0]).toContain("900000000");
  });

  it("سطح المكتب: تنزيل بالاسم نفسه", async () => {
    desktop();
    const out = await shareDocumentPdf(DOC);
    expect(out).toEqual({ via: "download", fileName: EXPECTED });
    expect(downloadedNames).toEqual([EXPECTED]);
  });

  it("الاسم متطابق حرفياً بين الفروع الثلاثة", async () => {
    mobileWithFileShare();
    const a = await shareDocumentPdf(DOC);
    mobileWithoutFileShare();
    const b = await shareDocumentPdf(DOC);
    desktop();
    const c = await shareDocumentPdf(DOC);
    expect(new Set([a.fileName, b.fileName, c.fileName]).size).toBe(1);
    expect(sharedFiles[0].name).toBe(downloadedNames[0]);
  });
});

describe("سلوك الإلغاء والفشل", () => {
  it("إلغاء المستخدم للمشاركة لا يُنزّل الملف خلف ظهره", async () => {
    (navigator as any).canShare = () => true;
    (navigator as any).share = async () => {
      const e = new Error("cancelled");
      e.name = "AbortError";
      throw e;
    };
    const out = await shareDocumentPdf(DOC);
    expect(out.via).toBe("web-share");
    expect(downloadedNames).toEqual([]);
    expect(opened).toEqual([]);
  });

  it("فشل المشاركة لسبب آخر يسقط للتنزيل بالاسم نفسه", async () => {
    (navigator as any).canShare = () => true;
    (navigator as any).share = async () => { throw new Error("not allowed"); };
    const out = await shareDocumentPdf(DOC);
    expect(out).toEqual({ via: "download", fileName: EXPECTED });
    expect(downloadedNames).toEqual([EXPECTED]);
  });

  it("canShare الذي يرمي استثناءً يُعامَل كغير مدعوم", async () => {
    (navigator as any).canShare = () => { throw new Error("boom"); };
    (navigator as any).share = async () => {};
    const out = await shareDocumentPdf(DOC);
    expect(out.via).toBe("download");
    expect(downloadedNames).toEqual([EXPECTED]);
  });
});

describe("downloadBlob", () => {
  it("يمرّر الاسم كما هو بلا تعديل", () => {
    downloadBlob(new Blob(["x"]), "اسم عربي - 100.pdf");
    expect(downloadedNames).toEqual(["اسم عربي - 100.pdf"]);
  });
});

describe("بلا رقم هاتف", () => {
  it("يُفتح واتساب بلا مُرسَل بدل أن يفشل", async () => {
    desktop();
    const out = await shareDocumentPdf({ ...DOC, phone: null });
    expect(out.via).toBe("download");
    expect(opened).toHaveLength(1);
  });
});
