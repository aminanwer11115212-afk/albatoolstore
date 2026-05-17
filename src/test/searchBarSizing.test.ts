import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * يتحقق أن شريط البحث "ابحث داخل المنتجات المضافة" في الصفحات الأربع:
 *  1) يطابق ارتفاع/خط/padding صفوف الجدول.
 *  2) يستخدم قيم px ثابتة (لا rem/em/% / vw)  → لا يتأثر بتغيير عرض الشاشة أو zoom.
 *  3) يستخدم flex:1 + minWidth:0 + textOverflow:ellipsis + textAlign:start + dir="auto"
 *     → آمن على الشاشات الصغيرة وفي اتجاهي RTL/LTR.
 */

const PAGES = [
  "src/pages/QuoteCreatePage.tsx",
  "src/pages/InvoiceCreatePage.tsx",
  "src/pages/PurchaseCreatePage.tsx",
  "src/pages/StockReturnCreatePage.tsx",
];

const EXPECTED = {
  height: 26,
  fontSize: 11,
  lineHeight: "20px",
  padding: "3px 8px",
};

const ROW_FORM_CONTROL_HEIGHT = 26;
const ROW_FONT_SIZE = 11;

function readPage(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function extractSearchInputBlock(src: string): string {
  // ابحث عن سطر placeholder، ثم خذ آخر "<input" قبله، وأول "/>" بعده.
  const phIdx = src.indexOf('placeholder="🔎 ابحث داخل المنتجات المضافة...');
  if (phIdx < 0) throw new Error("لم يتم العثور على placeholder");
  const start = src.lastIndexOf("<input", phIdx);
  const end = src.indexOf("/>", phIdx);
  if (start < 0 || end < 0) throw new Error("حدود <input/> غير مكتملة");
  return src.slice(start, end + 2);
}

function extractStyle(block: string): string {
  const m = block.match(/style=\{\{([^}]+)\}\}/);
  if (!m) throw new Error("لم يتم العثور على style");
  return m[1];
}

function getNumericProp(s: string, prop: string): number | null {
  const m = s.match(new RegExp(`${prop}\\s*:\\s*(\\d+)\\b`));
  return m ? Number(m[1]) : null;
}
function getStringProp(s: string, prop: string): string | null {
  const m = s.match(new RegExp(`${prop}\\s*:\\s*["']([^"']+)["']`));
  return m ? m[1] : null;
}
function hasBareProp(s: string, prop: string, value: string | number): boolean {
  return new RegExp(`${prop}\\s*:\\s*${value}\\b`).test(s);
}

describe("شريط البحث داخل المنتجات — مطابقة الحجم وثبات الأبعاد و RTL", () => {
  for (const page of PAGES) {
    describe(page, () => {
      const src = readPage(page);
      const block = extractSearchInputBlock(src);
      const style = extractStyle(block);

      it("الارتفاع 26px يطابق form-control داخل صف الجدول", () => {
        expect(getNumericProp(style, "height")).toBe(EXPECTED.height);
        expect(EXPECTED.height).toBe(ROW_FORM_CONTROL_HEIGHT);
      });

      it("حجم الخط 11px يطابق خط صفوف الجدول", () => {
        expect(getNumericProp(style, "fontSize")).toBe(EXPECTED.fontSize);
        expect(EXPECTED.fontSize).toBe(ROW_FONT_SIZE);
      });

      it("lineHeight = 20px (محاذاة عمودية)", () => {
        expect(getStringProp(style, "lineHeight")).toBe(EXPECTED.lineHeight);
      });

      it("padding = 3px 8px (متوازن عمودياً)", () => {
        expect(getStringProp(style, "padding")).toBe(EXPECTED.padding);
      });

      it("لا يستخدم وحدات نسبية (em/rem/%/vw/vh)", () => {
        for (const p of ["height", "fontSize", "padding", "lineHeight"]) {
          const re = new RegExp(`${p}\\s*:\\s*[^,}]*?(em|rem|%|vw|vh)\\b`);
          expect(re.test(style), `${p} يستخدم وحدة نسبية`).toBe(false);
        }
      });

      it("flex:1 + minWidth:0 + textOverflow:ellipsis (آمن على الشاشات الصغيرة)", () => {
        expect(hasBareProp(style, "flex", 1)).toBe(true);
        expect(hasBareProp(style, "minWidth", 0)).toBe(true);
        expect(getStringProp(style, "textOverflow")).toBe("ellipsis");
      });

      it('dir="auto" + textAlign:start (محاذاة صحيحة في RTL و LTR)', () => {
        expect(/dir="auto"/.test(block)).toBe(true);
        expect(getStringProp(style, "textAlign")).toBe("start");
      });

      it("verticalAlign:middle (الأيقونة 🔎 ممركزة عمودياً)", () => {
        expect(getStringProp(style, "verticalAlign")).toBe("middle");
      });

      it("CSS الصف ما يزال 26px / 11px (مرجع المطابقة سليم)", () => {
        expect(/\.neo-quote-scope \.form-control \{[^}]*height:\s*26px/.test(src)).toBe(true);
        expect(/\.neo-quote-scope \.excel-row td \{[^}]*font-size:\s*11px/.test(src)).toBe(true);
      });

      it("شريط البحث خارج عنصر zoom (itemsScrollRef) → لا يتأثر بـ itemsZoom", () => {
        const searchIdx = src.indexOf('placeholder="🔎 ابحث داخل المنتجات المضافة...');
        const scrollIdx = src.indexOf("ref={itemsScrollRef}");
        expect(searchIdx).toBeGreaterThan(0);
        expect(scrollIdx).toBeGreaterThan(0);
        expect(searchIdx).toBeLessThan(scrollIdx);
      });

      it("يحتوي على زرّي 'حفظ الأعمدة' و'تعديل' الشرطيين + state colsLocked (نصوص موحَّدة عبر ثوابت مشتركة)", () => {
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
        // لا نصوص مكتوبة بشكل مباشر (لتسهيل الترجمة)
        expect(/"تم حفظ وقفل عرض الأعمدة"/.test(src)).toBe(false);
        expect(/"وضع التعديل مفعّل/.test(src)).toBe(false);
      });

      it("يستخدم المفتاح المشترك SHARED_COLS_WIDTHS_KEY + useSharedColsLocked + migrateLegacyColWidths (مزامنة بين الصفحات الأربع)", () => {
        expect(/SHARED_COLS_WIDTHS_KEY/.test(src)).toBe(true);
        expect(/useSharedColsLocked\(\)/.test(src)).toBe(true);
        expect(/migrateLegacyColWidths\(\)/.test(src)).toBe(true);
        // لا يجب استخدام مفاتيح localStorage القديمة الخاصة بكل صفحة بعد الترحيل
        expect(/localStorage\.setItem\(["'][a-z-]+-create:colWidths:v3/.test(src)).toBe(false);
        expect(/localStorage\.setItem\(["'][a-z-]+-create:colsLocked:v1/.test(src)).toBe(false);
      });
    });
  }
});
