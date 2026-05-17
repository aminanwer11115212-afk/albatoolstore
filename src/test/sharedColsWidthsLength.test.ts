import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useColumnWidths,
  SHARED_COLS_WIDTHS_KEY,
} from "@/hooks/useColumnWidths";

/**
 * يتحقق أن مصفوفة widths من useColumnWidths تبقى دائماً بطول defaults.length (= 8)
 * وأن قيم null تُحفظ كما هي دون فقد عمود، عبر الصفحات الأربع المشتركة.
 *
 * defaults للصفحات الأربع: [36, null, 80, 100, 100, 100, 36, 40]
 * - الفهرس 0: floor = 36
 * - الفهرس 1: مرن (null)
 * - الفهارس 2..5: floor = 60 (الافتراضي للأعمدة الثابتة)
 * - الفهرس 6: floor = 36
 * - الفهرس 7: floor = 40
 *
 * أي قيمة < floor تُعتبر غير صالحة وتُعاد كـ null.
 */

const DEFAULTS: (number | null)[] = [36, null, 80, 100, 100, 100, 36, 40];
const LEN = 8;

beforeEach(() => {
  localStorage.clear();
});

describe("useColumnWidths — طول المصفوفة دائماً 8 وnull آمنة", () => {
  describe("القراءة من localStorage (readFromStorage)", () => {
    it("1) مخزَّن فارغ → [null×8] بطول 8", () => {
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths.every((v) => v === null)).toBe(true);
    });

    it("2) مخزَّن JSON تالف → [null×8]", () => {
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, "{not-json");
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths.every((v) => v === null)).toBe(true);
    });

    it("3) مخزَّن أقصر [120, 100] → يُمدَّد إلى 8، الفهارس 2..7 = null", () => {
      // الفهرس 0 floor=36، 120 صالح. الفهرس 1 مرن، 100 رقم لكن floor=60 → صالح.
      localStorage.setItem(
        SHARED_COLS_WIDTHS_KEY,
        JSON.stringify([120, 100])
      );
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths[0]).toBe(120);
      expect(result.current.widths[1]).toBe(100);
      for (let i = 2; i < LEN; i++) {
        expect(result.current.widths[i]).toBeNull();
      }
    });

    it("4) مخزَّن أطول (10 عناصر صالحة) → يُقصَّر إلى 8 عند العرض", () => {
      const stored = [80, 90, 100, 110, 120, 130, 80, 80, 200, 210];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(stored));
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths).toEqual(stored.slice(0, LEN));
    });

    it("5) مخزَّن يحوي قيماً غير صالحة → تُحوَّل إلى null والطول 8", () => {
      // قيم غير صالحة لكل فهرس بحسب floor الخاص به.
      const bad: any[] = ["abc", NaN, -5, null, 10 /* <60 */, 0, 20 /* <36 */, 30 /* <40 */];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(bad));
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths.every((v) => v === null)).toBe(true);
    });

    it("6) مخزَّن صحيح بطول 8 وفيه null على الفهرس 1 → يُعاد كما هو", () => {
      const valid: (number | null)[] = [40, null, 80, 100, 100, 100, 40, 50];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(valid));
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths).toEqual(valid);
      // null في الفهرس 1 لم تُستبدل برقم.
      expect(result.current.widths[1]).toBeNull();
    });
  });

  describe("الكتابة إلى localStorage", () => {
    it("7) كتابة من صفحة بطول 8 فوق مخزَّن بطول 10 → يُحفظ بطول 10 (دمج آخر عنصرين)", () => {
      const longExisting = [70, 80, 90, 100, 110, 120, 70, 70, 555, 666];
      localStorage.setItem(
        SHARED_COLS_WIDTHS_KEY,
        JSON.stringify(longExisting)
      );
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      // تحريك عمود ليُشغّل effect الحفظ بقيمة جديدة.
      act(() => {
        result.current.startDrag(0, {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: 0,
        } as any);
        // إنهاء السحب فوراً بدون تحريك (يعتمد effect على state؛ نحدّث setState عبر إعادة كتابة widths)
      });
      // القراءة الحالية بطول 8 سليمة.
      expect(result.current.widths).toHaveLength(LEN);
      // المخزَّن يجب أن يبقى بطول 10 (آخر عنصرين محفوظَيْن من القديم).
      const saved = JSON.parse(
        localStorage.getItem(SHARED_COLS_WIDTHS_KEY)!
      ) as (number | null)[];
      expect(saved).toHaveLength(10);
      expect(saved.slice(8)).toEqual([555, 666]);
      // أول 8 = الـ widths الحالية للـ hook.
      expect(saved.slice(0, 8)).toEqual(result.current.widths);
    });

    it("8) كتابة من صفحة بطول 8 فوق مخزَّن بطول 8 → يبقى بطول 8", () => {
      const existing: (number | null)[] = [40, null, 80, 100, 100, 100, 40, 50];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(existing));
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      // القراءة بطول 8.
      expect(result.current.widths).toHaveLength(LEN);
      const saved = JSON.parse(
        localStorage.getItem(SHARED_COLS_WIDTHS_KEY)!
      ) as (number | null)[];
      expect(saved).toHaveLength(LEN);
    });

    it("9) reset() يُبقي الطول 8 ولا يفقد فهرساً", () => {
      const existing = [120, 110, 100, 100, 100, 100, 50, 60];
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(existing));
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      act(() => {
        result.current.reset();
      });
      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths.every((v) => v === null)).toBe(true);
    });
  });

  describe("التنقل بين الصفحات الأربع (نفس المفتاح، نفس defaults)", () => {
    it("10) القيم المحفوظة من صفحة تُقرأ بطول 8 سليم في صفحة أخرى", () => {
      const valid: (number | null)[] = [50, null, 80, 100, 100, 100, 40, 50];
      // صفحة 1: تكتب.
      const h1 = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      // اضبط القيمة المخزَّنة مباشرة (محاكاة لما بعد سحب وحفظ).
      localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(valid));
      h1.unmount();

      // صفحة 2: تقرأ.
      const h2 = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(h2.result.current.widths).toHaveLength(LEN);
      expect(h2.result.current.widths).toEqual(valid);
      expect(h2.result.current.widths[1]).toBeNull();
      h2.unmount();
    });

    it("11) حدث storage خارجي بقيمة بطول 8 فيها null → الـ hook يحدّث بطول 8", () => {
      const { result } = renderHook(() =>
        useColumnWidths(SHARED_COLS_WIDTHS_KEY, DEFAULTS)
      );
      expect(result.current.widths).toHaveLength(LEN);

      const next: (number | null)[] = [60, null, 90, 110, 110, 110, 50, 60];
      act(() => {
        localStorage.setItem(SHARED_COLS_WIDTHS_KEY, JSON.stringify(next));
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: SHARED_COLS_WIDTHS_KEY,
            newValue: JSON.stringify(next),
          })
        );
      });

      expect(result.current.widths).toHaveLength(LEN);
      expect(result.current.widths).toEqual(next);
      expect(result.current.widths[1]).toBeNull();
    });
  });
});
