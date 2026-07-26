import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * يتحقق من بحث المنتجات المضافة داخل رأس العمود في الصفحات الأربع بعد إعادة
 * التصميم (بحث مضمّن قابل للتبديل بدل شريط مستقل مُقاس):
 *  1) وجود مدخل البحث بالـ placeholder الموحّد و dir="auto" (سلامة RTL/LTR).
 *  2) أزرار «حفظ الأعمدة/تعديل» تستخدم ثوابت نصية مشتركة (لا نصوص حرفية) + hidden={colsLocked}.
 *  3) مفاتيح عرض الأعمدة لكل شاشة (screenColWidthsKey + useScreenColsLocked) بلا مفاتيح قديمة.
 *
 * ملاحظة: أُسقطت تأكيدات القياس/الموضع القديمة (height:26/padding/خارج الزوم) لأن
 * شريط البحث المستقل المُقاس استُبدل ببحث داخل رأس العمود.
 */

const PAGES = [
  "src/pages/QuoteCreatePage.tsx",
  "src/pages/InvoiceCreatePage.tsx",
  "src/pages/PurchaseCreatePage.tsx",
  "src/pages/StockReturnCreatePage.tsx",
];

const PLACEHOLDER = 'placeholder="🔎 ابحث...';

function readPage(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** يلتقط كتلة <input ...> الخاصة ببحث المنتجات (من آخر <input قبل الـ placeholder). */
function extractSearchInputBlock(src: string): string {
  const phIdx = src.indexOf(PLACEHOLDER);
  if (phIdx < 0) throw new Error("لم يتم العثور على placeholder");
  const start = src.lastIndexOf("<input", phIdx);
  if (start < 0) throw new Error("بداية <input غير موجودة");
  // نأخذ نافذة تشمل خصائص المدخل حتى بعد الـ placeholder.
  return src.slice(start, phIdx + PLACEHOLDER.length);
}

describe("بحث المنتجات المضافة (رأس العمود) — RTL وثوابت الأعمدة الموحّدة", () => {
  for (const page of PAGES) {
    describe(page, () => {
      const src = readPage(page);
      const block = extractSearchInputBlock(src);

      it("يحتوي مدخل بحث بالـ placeholder الموحّد", () => {
        expect(src.includes(PLACEHOLDER)).toBe(true);
      });

      it('dir="auto" (محاذاة صحيحة في RTL و LTR)', () => {
        expect(/dir="auto"/.test(block)).toBe(true);
      });

      it("أزرار الأعمدة تستخدم ثوابت نصية مشتركة + hidden={colsLocked} (لا نصوص حرفية)", () => {
        expect(/colsLocked/.test(src)).toBe(true);
        expect(/setColsLocked/.test(src)).toBe(true);
        expect(/COLS_BTN_SAVE_LABEL/.test(src)).toBe(true);
        expect(/COLS_BTN_EDIT_LABEL/.test(src)).toBe(true);
        expect(/COLS_TOAST_SAVED/.test(src)).toBe(true);
        expect(/COLS_TOAST_EDIT_MODE/.test(src)).toBe(true);
        expect(/COLS_TOAST_SAVE_FAILED/.test(src)).toBe(true);
        expect(/COLS_BTN_SAVE_TITLE/.test(src)).toBe(true);
        expect(/COLS_BTN_EDIT_TITLE/.test(src)).toBe(true);
        expect(/hidden=\{colsLocked\}/.test(src)).toBe(true);
        // لا نصوص مكتوبة مباشرة (تُدار عبر الثوابت المشتركة)
        expect(/"تم حفظ وقفل عرض الأعمدة"/.test(src)).toBe(false);
        expect(/"وضع التعديل مفعّل/.test(src)).toBe(false);
      });

      it("مفاتيح عرض الأعمدة لكل شاشة (screenColWidthsKey + useScreenColsLocked) بلا مفاتيح قديمة", () => {
        expect(/useColumnWidths\(\s*screenColWidthsKey\(/.test(src)).toBe(true);
        expect(/useScreenColsLocked\(/.test(src)).toBe(true);
        expect(/const\s+colsScreenId\s*=/.test(src)).toBe(true);
        expect(/localStorage\.setItem\(\s*["'][a-z-]+-create:colWidths:v3/.test(src)).toBe(false);
        expect(/localStorage\.setItem\(\s*["'][a-z-]+-create:colsLocked:v1/.test(src)).toBe(false);
      });
    });
  }
});
