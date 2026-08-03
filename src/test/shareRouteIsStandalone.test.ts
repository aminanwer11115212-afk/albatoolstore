/**
 * أيّ صفحةٍ تفتح رابط العميل فعلاً؟
 *
 * ## العطل الذي كشفَته لقطتا المستخدم
 * ورقة الرابط بقيت مختلفة عن المعاينة بعد إصلاح `PublicDocumentSharePage`:
 * لا ملخّص حساب، ولا صندوقَي تغليف وترحيل، ولا تواقيع.
 *
 * والسبب أن `main.tsx` **يعترض** `/share/document/:token` قبل الراوتر ويركّب
 * `StandaloneShareDocument` — فمسار `PublicDocumentSharePage` في `App.tsx` لا
 * يُبلَغ لهذا العنوان أبداً. أي أن الإصلاح كان في صفحةٍ لا يفتحها أحد.
 *
 * هذا الاختبار يمنع تكرارها: **كل** صفحةٍ قد تخدم هذا المسار يجب أن تبني
 * الورقة بقالب الطباعة، لا أن تطلب HTML جاهزاً من دالّة الحافة.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

const MAIN = "src/main.tsx";
const STANDALONE = "src/pages/StandaloneShareDocument.tsx";
const ROUTED = "src/pages/PublicDocumentSharePage.tsx";

describe("اعتراض المسار في main.tsx", () => {
  const src = read(MAIN);

  it("`/share/document/` يُعترض قبل الراوتر", () => {
    expect(src).toMatch(/\/\^\\\/share\\\/document\\\//);
    expect(src).toContain("StandaloneShareDocument");
  });

  it("فالصفحة المستقلّة هي التي يراها العميل — لا المسار في App", () => {
    // الاعتراض يسبق تركيب <App/>، فترتيب الشرط جزءٌ من العقد
    const interceptAt = src.indexOf("StandaloneShareDocument");
    const appAt = src.indexOf("<App />");
    expect(interceptAt).toBeGreaterThan(-1);
    expect(appAt).toBeGreaterThan(interceptAt);
  });
});

describe("كلتا الصفحتين تبنيان الورقة بقالب الطباعة", () => {
  it.each([STANDALONE, ROUTED])("%s تنادي `fetchSharedDocumentHTML`", (file) => {
    expect(read(file)).toContain("fetchSharedDocumentHTML");
  });

  it.each([STANDALONE, ROUTED])("%s لا تكتفي بـHTML دالّة الحافة", (file) => {
    const src = read(file);
    // الدالّة تبقى مسار سقوطٍ مسمّى صراحةً — لا مصدراً وحيداً
    expect(src).toMatch(/fallback|السقوط|شبكةَ أمان/i);
  });

  it.each([STANDALONE, ROUTED])("%s تُظهر رفض التوكن بلغة العميل لا تُخفيه", (file) => {
    const src = read(file);
    expect(src).toContain('"expired"');
    expect(src).toContain('"not_found"');
  });
});

/**
 * الكاتب يُبطل ذاكرة القارئ.
 *
 * `printExtras` تحفظ القراءة دقيقةً. فمن أدخل تغليفاً ثم طبع فوراً كان يقرأ
 * «لا توجد بيانات تغليف» — قراءةً محفوظة من **قبل** إدخاله.
 */
describe("نوافذ التغليف والترحيل تُبطل ذاكرة الطباعة", () => {
  it.each([
    "src/components/packaging/PackagingDialog.tsx",
    "src/components/transport/TransportDialog.tsx",
  ])("%s", (file) => {
    const src = read(file);
    expect(src).toContain("clearPrintExtrasCache");
    expect(src).toContain("clearPrintExtrasCache(parentType, parentId)");
  });
});
