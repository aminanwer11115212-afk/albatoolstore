import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  SHARED_COLS_WIDTHS_KEY,
  SHARED_COLS_LOCKED_KEY,
  migrateLegacyColWidths,
} from "@/hooks/useColumnWidths";

/**
 * يضمن أن مفتاح SHARED_COLS_WIDTHS_KEY ومصفوفة defaults متطابقة
 * في الصفحات الأربع، وأن آلية الترحيل والمزامنة عبر localStorage تعمل.
 */

const PAGES = [
  "src/pages/QuoteCreatePage.tsx",
  "src/pages/InvoiceCreatePage.tsx",
  "src/pages/PurchaseCreatePage.tsx",
  "src/pages/StockReturnCreatePage.tsx",
];

const EXPECTED_DEFAULTS = "[36, null, 80, 100, 100, 100, 36, 40]";
const EXPECTED_LEN = 8;

function readPage(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** Extracts the first arg (key) and second arg (defaults array literal) of useColumnWidths(...). */
function extractUseColumnWidthsArgs(src: string): { key: string; defaults: string } {
  const idx = src.indexOf("useColumnWidths(");
  if (idx < 0) throw new Error("useColumnWidths call not found");
  // find a useColumnWidths call (not the import). Look for one followed by newline then key.
  // Simplest: find "useColumnWidths(\n    KEY," pattern.
  const m = src.match(/useColumnWidths\(\s*([A-Z_][A-Z0-9_]*)\s*,\s*(\[[^\]]*\])/);
  if (!m) throw new Error("useColumnWidths(args) not parseable");
  return { key: m[1], defaults: m[2].replace(/\s+/g, " ").trim() };
}

describe("مزامنة عرض الأعمدة بين الصفحات الأربع — SHARED_COLS_WIDTHS_KEY", () => {
  describe("فحص ثوابت المصدر", () => {
    for (const page of PAGES) {
      it(`${page}: يستخدم SHARED_COLS_WIDTHS_KEY و defaults المتفقة`, () => {
        const src = readPage(page);
        const { key, defaults } = extractUseColumnWidthsArgs(src);
        expect(key).toBe("SHARED_COLS_WIDTHS_KEY");
        // Normalize whitespace inside expected for comparison.
        expect(defaults.replace(/\s+/g, " ")).toBe(EXPECTED_DEFAULTS.replace(/\s+/g, " "));
      });

      it(`${page}: يستخدم useSharedColsLocked() (لا state محلي للقفل)`, () => {
        const src = readPage(page);
        expect(/const\s*\[\s*colsLocked\s*,\s*setColsLocked\s*\]\s*=\s*useSharedColsLocked\(\)/.test(src)).toBe(true);
      });

      it(`${page}: يستدعي migrateLegacyColWidths()`, () => {
        const src = readPage(page);
        expect(/migrateLegacyColWidths\(\)/.test(src)).toBe(true);
      });

      it(`${page}: لا يستخدم مفاتيح localStorage القديمة الخاصة بالصفحة`, () => {
        const src = readPage(page);
        expect(/localStorage\.setItem\(\s*["'][a-z-]+-create:colWidths:v3/.test(src)).toBe(false);
        expect(/localStorage\.setItem\(\s*["'][a-z-]+-create:colsLocked:v1/.test(src)).toBe(false);
      });
    }

    it("الصفحات الأربع تستخدم نفس defaults حرفياً (مرجع موحَّد)", () => {
      const allDefaults = PAGES.map((p) => extractUseColumnWidthsArgs(readPage(p)).defaults.replace(/\s+/g, " "));
      const first = allDefaults[0];
      for (const d of allDefaults) expect(d).toBe(first);
    });

    it("ثابت SHARED_COLS_WIDTHS_KEY له القيمة المتوقعة", () => {
      expect(SHARED_COLS_WIDTHS_KEY).toBe("shared:itemsTable:colWidths:v1");
    });
  });

  describe("سلوك localStorage (jsdom)", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("الكتابة في SHARED_COLS_WIDTHS_KEY تُقرأ بنفس الترتيب والطول", () => {
      const widths: (number | null)[] = [36, null, 80, 120, 100, 100, 36, 40];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(widths));
      const raw = localStorage.getItem(SHARED_COLS_WIDTHS_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as (number | null)[];
      expect(parsed).toHaveLength(EXPECTED_LEN);
      expect(parsed).toEqual(widths);
    });

    it("migrateLegacyColWidths ينقل قيمة legacy (invoice أولاً) إلى المفتاح المشترك", () => {
      const legacy = [40, null, 90, 110, 110, 110, 40, 44];
      localStorage.setItem("invoice-create:colWidths:v3", JSON.stringify(legacy));
      expect(localStorage.getItem(SHARED_COLS_WIDTHS_KEY)).toBeNull();
      migrateLegacyColWidths();
      const raw = localStorage.getItem(SHARED_COLS_WIDTHS_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(legacy);
    });

    it("migrateLegacyColWidths لا يكتب فوق قيمة موجودة في المفتاح المشترك", () => {
      const existing = [36, null, 80, 100, 100, 100, 36, 40];
      const legacy = [99, null, 99, 99, 99, 99, 99, 99];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(existing));
      localStorage.setItem("invoice-create:colWidths:v3", JSON.stringify(legacy));
      migrateLegacyColWidths();
      expect(JSON.parse(localStorage.getItem(SHARED_COLS_WIDTHS_KEY)!)).toEqual(existing);
    });

    it("migrateLegacyColWidths ينقل lock flag من legacy", () => {
      localStorage.setItem("quote-create:colsLocked:v1", "true");
      migrateLegacyColWidths();
      expect(localStorage.getItem(SHARED_COLS_LOCKED_KEY)).toBe("true");
    });

    it("أولوية الترحيل: invoice → quote → purchase → stock-return", () => {
      localStorage.setItem("quote-create:colWidths:v3", JSON.stringify([1, 1, 1, 1, 1, 1, 1, 1]));
      localStorage.setItem("invoice-create:colWidths:v3", JSON.stringify([2, 2, 2, 2, 2, 2, 2, 2]));
      localStorage.setItem("purchase-create:colWidths:v3", JSON.stringify([3, 3, 3, 3, 3, 3, 3, 3]));
      migrateLegacyColWidths();
      expect(JSON.parse(localStorage.getItem(SHARED_COLS_WIDTHS_KEY)!)).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    });
  });
});
