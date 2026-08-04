/**
 * الأعمدة الرقمية في جدول البنود تُكتب مباشرةً — بلا وضع تعديل وبلا مسطرة محجوزة.
 *
 * ## العطل كما بلّغ عنه صاحب المستودع
 * جدول البنود كان ذا وضعين: الخلية التي تصل إليها بالكيبورد ترفض الحروف حتى
 * تضغط Shift أو تنقر بالماوس، والمسطرة فيها محجوزة لتحديد الصف وحذفه. وهذا
 * يصلح لعمود المنتج — اسمٌ نصّي، والمسطرة فيه أداة حذف — ولا يصلح للأرقام:
 * «التنقّل في الكمية والسعر والسعر الأجنبي والإجمالي… تغيّر الرقم على طول…
 * لسرعة الحركة».
 *
 * فأن تنتقل إلى الكمية ثم تضغط Shift ثم تكتب = ثلاث حركاتٍ مكان واحدة، في
 * شاشةٍ يُدخَل فيها مئة بند.
 *
 * ## ما يحرسه هذا الملف
 * أن الحرف يصل الخانة الرقمية، وأن المسطرة تكتب فيها ولا تحذف صفاً، وأن
 * عمود المنتج بقي على سلوكه — فالحذف بالمسطرة لم يُفقد، انتقل إلى موضعه.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { attachSpaceColumnNav, detachSpaceColumnNav } from "@/utils/spaceColumnNav";
import { useSpaceToDelete } from "@/hooks/useSpaceToDelete";
import { isFreeTypingCol, selectIfFreeTyping, FREE_TYPING_COLS } from "@/utils/itemTableColumns";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

/** صفٌّ من جدول البنود كما تركّبه شاشات الإدخال. */
function mountRow(uid = "u1") {
  const table = document.createElement("table");
  const row = document.createElement("tr");
  row.setAttribute("data-row-uid", uid);
  document.body.appendChild(table);
  table.appendChild(row);

  const cells: Record<string, HTMLInputElement> = {};
  for (const col of ["product", "quantity", "unit_price", "foreign_price", "total"]) {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = col === "product" ? "text" : "text"; // jsdom لا يحدّد في number
    input.value = col === "product" ? "بطارية" : "12";
    input.setAttribute("data-nav-table", "invoice-items");
    input.setAttribute("data-nav-row", "0");
    input.setAttribute("data-nav-col", col);
    td.appendChild(input);
    row.appendChild(td);
    cells[col] = input;
  }
  return cells;
}

const press = (el: HTMLElement, key: string) => {
  const ev = new KeyboardEvent("keydown", { key, code: key === " " ? "Space" : `Key${key}`, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

describe("المصدر الواحد لأعمدة الكتابة المباشرة", () => {
  it("الأعمدة الأربعة التي سمّاها المستخدم داخل القائمة", () => {
    for (const col of ["quantity", "unit_price", "foreign_price", "total"]) {
      expect(FREE_TYPING_COLS as readonly string[]).toContain(col);
    }
  });

  it("وعمود المنتج خارجها — المسطرة فيه أداة حذف لا حرف", () => {
    expect(FREE_TYPING_COLS as readonly string[]).not.toContain("product");
  });

  it("`isFreeTypingCol` يقرأ من الخلية لا من اسمٍ يُمرَّر", () => {
    const el = document.createElement("input");
    el.setAttribute("data-nav-col", "quantity");
    expect(isFreeTypingCol(el)).toBe(true);
    el.setAttribute("data-nav-col", "product");
    expect(isFreeTypingCol(el)).toBe(false);
    expect(isFreeTypingCol(null)).toBe(false);
  });

  it("`selectIfFreeTyping` يحدّد الرقمية وحدها", () => {
    const cells = mountRow();
    const selQty = vi.spyOn(cells.quantity, "select");
    const selProd = vi.spyOn(cells.product, "select");
    selectIfFreeTyping(cells.quantity);
    selectIfFreeTyping(cells.product);
    expect(selQty).toHaveBeenCalled();
    expect(selProd).not.toHaveBeenCalled();
  });
});

describe("spaceColumnNav — لا وضعَ تعديل في الخانات الرقمية", () => {
  beforeEach(() => { document.body.innerHTML = ""; attachSpaceColumnNav(); });
  afterEach(() => { detachSpaceColumnNav(); document.body.innerHTML = ""; });

  it.each(["quantity", "unit_price", "foreign_price", "total"])(
    "الحرف يصل خانة «%s» بلا Shift ولا نقرة",
    (col) => {
      const cells = mountRow();
      cells[col].focus();
      expect(press(cells[col], "5").defaultPrevented).toBe(false);
    },
  );

  it("والمسطرة تكتب فيها مسافةً عادية", () => {
    const cells = mountRow();
    cells.quantity.focus();
    expect(press(cells.quantity, " ").defaultPrevented).toBe(false);
  });

  it("وBackspace يمسح — لا يُبتلع", () => {
    const cells = mountRow();
    cells.quantity.focus();
    expect(press(cells.quantity, "Backspace").defaultPrevented).toBe(false);
  });

  it("عمود المنتج بقي على وضعيه: الحرف مرفوض قبل التعديل", () => {
    const cells = mountRow();
    cells.product.focus();
    expect(press(cells.product, "5").defaultPrevented).toBe(true);
  });

  it("والمسطرة فيه محجوزة للتحديد لا للكتابة", () => {
    const cells = mountRow();
    cells.product.focus();
    expect(press(cells.product, " ").defaultPrevented).toBe(true);
  });

  it("الخانة الرقمية تُعلَّم `data-edit-mode` عند التركيز — فيظهر مؤشّر الكتابة", () => {
    const cells = mountRow();
    cells.quantity.focus();
    expect(cells.quantity.getAttribute("data-edit-mode")).toBe("true");
  });

  it("وخانة المنتج لا تُعلَّم — تصل في وضع التنقّل", () => {
    const cells = mountRow();
    cells.product.focus();
    expect(cells.product.getAttribute("data-edit-mode")).not.toBe("true");
  });
});

describe("useSpaceToDelete — المسطرة لا تحذف من خانة رقمية", () => {
  beforeEach(() => { document.body.innerHTML = ""; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  const tapSpace = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space" }));
  };

  it("المسطرة في «الكمية» لا تُحدِّد الصف", () => {
    const { result } = renderHook(() => useSpaceToDelete(vi.fn()));
    const cells = mountRow("u1");
    cells.quantity.focus();
    act(() => { tapSpace(); });
    expect(result.current.isPending("u1")).toBe(false);
  });

  it("ولا تحذفه بضغطتين", () => {
    const onDelete = vi.fn();
    renderHook(() => useSpaceToDelete(onDelete));
    const cells = mountRow("u1");
    cells.quantity.focus();
    act(() => { tapSpace(); tapSpace(); });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("والحذف حيٌّ من عمود المنتج — لم يُفقد بل انتقل إلى موضعه", () => {
    const { result } = renderHook(() => useSpaceToDelete(vi.fn()));
    const cells = mountRow("u1");
    cells.product.focus();
    act(() => { tapSpace(); });
    expect(result.current.isPending("u1")).toBe(true);
  });
});

/**
 * حراسة بنيوية: القائمة مصدرٌ واحد.
 *
 * ثلاثة ملفات تحتاج القائمة نفسها. ونسخُها في كلٍّ منها هو النمط الذي كرّر
 * أعطال هذا المشروع — عُدِّل موضعٌ وبقي الآخران.
 */
describe("قائمة الأعمدة مصدرٌ واحد لا نسخ", () => {
  it.each([
    "src/utils/spaceColumnNav.ts",
    "src/hooks/useSpaceToDelete.ts",
    "src/hooks/document/useInvoiceKeyboardNav.ts",
  ])("%s يستوردها ولا يكتبها", (file) => {
    const src = read(file);
    expect(src).toMatch(/from "(\.\/|@\/utils\/)itemTableColumns"/);
    // ولا يحمل قائمةً خاصّة به
    expect(src).not.toMatch(/\["quantity",\s*"unit_price"/);
  });

  it("تنقّل شاشة الفاتورة يحدّد الرقم عند الوصول — ضغطةٌ واحدة تبدّله", () => {
    const src = read("src/hooks/document/useInvoiceKeyboardNav.ts");
    const focusCalls = src.match(/\.focus\(\);/g) || [];
    const selectCalls = src.match(/selectIfFreeTyping\(/g) || [];
    expect(focusCalls.length).toBeGreaterThanOrEqual(3);
    expect(selectCalls.length).toBe(focusCalls.length);
  });
});
