import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useColumnWidths,
  SHARED_COLS_WIDTHS_KEY,
} from "@/hooks/useColumnWidths";

/**
 * يتحقق أن ترتيب الأعمدة (widths) متطابق نصياً بين الصفحات الثلاث:
 * /quote/create, /purchase/create, /stock-return/create
 * عند استخدام نفس SHARED_COLS_WIDTHS_KEY ونفس DEFAULTS.
 */

const DEFAULTS: (number | null)[] = [36, null, 80, 100, 100, 100, 36, 40];
const LEN = 8;

beforeEach(() => {
  localStorage.clear();
});

const renderThree = () => {
  const hQuote = renderHook(() =>
    useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
  );
  const hPurchase = renderHook(() =>
    useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
  );
  const hStockReturn = renderHook(() =>
    useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
  );
  return { hQuote, hPurchase, hStockReturn };
};

describe("sharedColsOrder — ترتيب widths متطابق نصياً بين الصفحات الثلاث", () => {
  describe("أ) تطابق الترتيب عند مصفوفات widths متطابقة", () => {
    it("1) مخزَّن فارغ → الثلاث تنتج [null×8] متطابقة نصياً", () => {
      const { hQuote, hPurchase, hStockReturn } = renderThree();

      const sQ = JSON.stringify(hQuote.result.current.widths);
      const sP = JSON.stringify(hPurchase.result.current.widths);
      const sS = JSON.stringify(hStockReturn.result.current.widths);

      expect(hQuote.result.current.widths).toHaveLength(LEN);
      expect(sQ).toBe(sP);
      expect(sP).toBe(sS);
      expect(sQ).toBe(JSON.stringify(Array(LEN).fill(null)));
    });

    it("2) مخزَّن صحيح بطول 8 فيه null على الفهرس 1 → تطابق نصي بين الثلاث", () => {
      const valid: (number | null)[] = [40, null, 80, 100, 100, 100, 40, 50];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(valid));

      const { hQuote, hPurchase, hStockReturn } = renderThree();

      const sQ = JSON.stringify(hQuote.result.current.widths);
      const sP = JSON.stringify(hPurchase.result.current.widths);
      const sS = JSON.stringify(hStockReturn.result.current.widths);

      expect(sQ).toBe(JSON.stringify(valid));
      expect(sQ).toBe(sP);
      expect(sP).toBe(sS);
      expect(hQuote.result.current.widths[1]).toBeNull();
      expect(hPurchase.result.current.widths[1]).toBeNull();
      expect(hStockReturn.result.current.widths[1]).toBeNull();
    });

    it("3) مخزَّن بقيم متنوعة صالحة → تطابق نصي بين الثلاث", () => {
      const valid: (number | null)[] = [40, 200, 80, 100, 100, 100, 40, 50];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(valid));

      const { hQuote, hPurchase, hStockReturn } = renderThree();

      const sQ = JSON.stringify(hQuote.result.current.widths);
      const sP = JSON.stringify(hPurchase.result.current.widths);
      const sS = JSON.stringify(hStockReturn.result.current.widths);

      expect(sQ).toBe(JSON.stringify(valid));
      expect(sQ).toBe(sP);
      expect(sP).toBe(sS);
    });
  });

  describe("ب) تطابق الترتيب بعد التحديثات", () => {
    it("4) تحديث خارجي عبر storage event → الثلاث تقرأ نفس الترتيب الجديد", () => {
      const { hQuote, hPurchase, hStockReturn } = renderThree();

      const next: (number | null)[] = [50, null, 90, 110, 110, 110, 50, 60];
      act(() => {
        localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(next));
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: SHARED_COLS_WIDTHS_KEY,
            newValue: JSON.stringify(next),
          })
        );
      });

      const sQ = JSON.stringify(hQuote.result.current.widths);
      const sP = JSON.stringify(hPurchase.result.current.widths);
      const sS = JSON.stringify(hStockReturn.result.current.widths);

      expect(sQ).toBe(JSON.stringify(next));
      expect(sQ).toBe(sP);
      expect(sP).toBe(sS);
    });

    it("5) reset() من صفحة → بثّ يعيد الثلاث إلى [null×8] متطابقة", () => {
      const existing: (number | null)[] = [60, 200, 90, 110, 110, 110, 50, 60];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(existing));

      const { hQuote, hPurchase, hStockReturn } = renderThree();

      // تأكيد الحالة الابتدائية متطابقة.
      expect(JSON.stringify(hQuote.result.current.widths)).toBe(
        JSON.stringify(hPurchase.result.current.widths)
      );

      act(() => {
        hQuote.result.current.reset();
        // محاكاة بثّ التحديث للنوافذ الأخرى (الصفحات الأخرى).
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: SHARED_COLS_WIDTHS_KEY,
            newValue: null,
          })
        );
      });

      const sQ = JSON.stringify(hQuote.result.current.widths);
      const sP = JSON.stringify(hPurchase.result.current.widths);
      const sS = JSON.stringify(hStockReturn.result.current.widths);

      expect(sQ).toBe(JSON.stringify(Array(LEN).fill(null)));
      expect(sQ).toBe(sP);
      expect(sP).toBe(sS);
    });
  });

  describe("ج) ثبات الترتيب نسبةً إلى DEFAULTS", () => {
    it("6) كل صفحة: widths.length = DEFAULTS.length والفهرس 1 مرن (null افتراضاً)", () => {
      const { hQuote, hPurchase, hStockReturn } = renderThree();

      for (const h of [hQuote, hPurchase, hStockReturn]) {
        expect(h.result.current.widths).toHaveLength(DEFAULTS.length);
        // افتراضياً (مخزَّن فارغ) كل القيم null — بما فيها الفهرس 1 المرن.
        expect(h.result.current.widths[1]).toBeNull();
      }
    });

    it("7) مقارنة نصية شاملة: stringify الثلاث متطابق في كل السيناريوهات السابقة", () => {
      // سيناريو مجمَّع للتأكيد النهائي.
      const cases: ((number | null)[] | null)[] = [
        null, // فارغ
        [36, null, 80, 100, 100, 100, 36, 40], // = DEFAULTS
        [40, null, 80, 100, 100, 100, 40, 50], // null في 1
        [40, 200, 80, 100, 100, 100, 40, 50], // كله أرقام
      ];

      for (const c of cases) {
        localStorage.clear();
        if (c) localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(c));

        const { hQuote, hPurchase, hStockReturn } = renderThree();

        // تأكيد الطول قبل أي مقارنة نصية: يجب أن يساوي DEFAULTS.length (=8) للثلاث.
        expect(hQuote.result.current.widths).toHaveLength(DEFAULTS.length);
        expect(hPurchase.result.current.widths).toHaveLength(DEFAULTS.length);
        expect(hStockReturn.result.current.widths).toHaveLength(DEFAULTS.length);
        expect(DEFAULTS.length).toBe(LEN);

        const sQ = JSON.stringify(hQuote.result.current.widths);
        const sP = JSON.stringify(hPurchase.result.current.widths);
        const sS = JSON.stringify(hStockReturn.result.current.widths);

        expect(sQ).toBe(sP);
        expect(sP).toBe(sS);
        expect(hQuote.result.current.widths).toHaveLength(LEN);

        hQuote.unmount();
        hPurchase.unmount();
        hStockReturn.unmount();
      }
    });

    it("8) تأكيد صريح: widths.length === DEFAULTS.length للصفحات الثلاث قبل أي مقارنة نصية", () => {
      const scenarios: ((number | null)[] | null)[] = [
        null,
        [36, null, 80, 100, 100, 100, 36, 40],
        [40, 200, 80, 100, 100, 100, 40, 50],
        [40, null, 80, 100, 100, 100, 40, 50],
      ];

      for (const sc of scenarios) {
        localStorage.clear();
        if (sc) localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(sc));

        const { hQuote, hPurchase, hStockReturn } = renderThree();

        // الخطوة (1): تحقق الطول أولاً — قبل أي stringify/مقارنة.
        expect(hQuote.result.current.widths.length).toBe(DEFAULTS.length);
        expect(hPurchase.result.current.widths.length).toBe(DEFAULTS.length);
        expect(hStockReturn.result.current.widths.length).toBe(DEFAULTS.length);
        expect(DEFAULTS.length).toBe(8);

        // الخطوة (2): الآن المقارنة النصية بعد ضمان الطول.
        const sQ = JSON.stringify(hQuote.result.current.widths);
        const sP = JSON.stringify(hPurchase.result.current.widths);
        const sS = JSON.stringify(hStockReturn.result.current.widths);
        expect(sQ).toBe(sP);
        expect(sP).toBe(sS);

        hQuote.unmount();
        hPurchase.unmount();
        hStockReturn.unmount();
      }
    });
  });
});
