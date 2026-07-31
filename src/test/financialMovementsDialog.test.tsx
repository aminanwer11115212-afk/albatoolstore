/**
 * نافذة «الحركات المالية».
 *
 * الغرض الأهم من هذه الاختبارات: **ألّا تقرّر النافذة شيئاً بنفسها**. كل زر
 * مفعّل أو مقفل يجب أن يطابق `movementCapabilities` — وهي المطابِقة لحرّاس
 * الـRPC. أي انحراف يعني زراً يفشل عند الضغط، أو فعلاً مسموحاً يُحجب بلا سبب.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FinancialMovementsDialog from "@/components/statement/FinancialMovementsDialog";
import { movementCapabilities, type LedgerTx } from "@/utils/ledgerEntryActions";

const tx = (o: Partial<LedgerTx>): LedgerTx => ({
  id: "x", customer_id: "c1", amount: 100, date: "2026-01-01", ...o,
});

const PAYMENT = tx({ id: "pay", category: "customer_payment", method: "cash", reference_id: "inv-1", amount: 300, date: "2026-03-01" });
const STANDALONE = tx({ id: "solo", category: "customer_payment", method: "cash", reference_id: null, amount: 150, date: "2026-02-01" });
const CHARGE = tx({ id: "chg", category: "customer_credit", amount: 500, allocation: { group_id: "g1" }, date: "2026-01-15" });
const CHARGE2 = tx({ id: "chg2", category: "customer_credit", amount: 500, allocation: { group_id: "g2" }, date: "2026-01-16" });
const CONSUME = tx({ id: "use", category: "customer_credit", amount: -80, reference_id: "inv-1", date: "2026-01-20" });
// الرصيد الدائن الصافي 920 يكفي لحذف أي شحنة منهما دون أن يصير سالباً
const ALL = [PAYMENT, STANDALONE, CHARGE, CHARGE2, CONSUME];

const invoiceNumbers = new Map([["inv-1", "INV-900"]]);

function renderDialog(over: Partial<React.ComponentProps<typeof FinancialMovementsDialog>> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <MemoryRouter>
      <FinancialMovementsDialog
        open
        transactions={ALL}
        invoiceNumberById={invoiceNumbers}
        accountLabel={(t) => (t.method === "credit_balance" ? "رصيد دائن" : "نقدًا")}
        onClose={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
        {...over}
      />
    </MemoryRouter>,
  );
  return { ...utils, onEdit, onDelete };
}

const rowOf = (id: string) => document.querySelector(`[data-movement-id="${id}"]`) as HTMLElement;
const btn = (id: string, name: RegExp) => within(rowOf(id)).getByRole("button", { name });

describe("الأزرار تطابق قدرات الحركة حرفياً", () => {
  it.each([["pay", PAYMENT], ["solo", STANDALONE], ["chg", CHARGE], ["chg2", CHARGE2], ["use", CONSUME]])(
    "%s — تعديل/حذف مفعّلان بقدر ما تسمح به القدرات",
    (id, movement) => {
      renderDialog();
      const caps = movementCapabilities(movement as LedgerTx, ALL);
      expect((btn(id, /^تعديل/) as HTMLButtonElement).disabled).toBe(!caps.canEdit);
      expect((btn(id, /^حذف/) as HTMLButtonElement).disabled).toBe(!caps.canDelete);
    },
  );

  it("الدفعة المرتبطة بفاتورة: الزران مفعّلان وتظهر بفاتورتها", () => {
    renderDialog();
    expect((btn("pay", /^تعديل/) as HTMLButtonElement).disabled).toBe(false);
    expect((btn("pay", /^حذف/) as HTMLButtonElement).disabled).toBe(false);
    expect(rowOf("pay").textContent).toContain("INV-900");
  });

  it("الدفعة المستقلة: الحذف مفعّل والتعديل مقفل", () => {
    renderDialog();
    expect((btn("solo", /^حذف/) as HTMLButtonElement).disabled).toBe(false);
    expect((btn("solo", /^تعديل/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("قيد الاستهلاك مقفل بالكامل ويظهر سببه مكتوباً لا مختفياً", () => {
    renderDialog();
    const row = rowOf("use");
    expect(row.getAttribute("data-locked")).toBe("true");
    expect(row.textContent).toContain("يُعكَس بحذف شحنته");
  });
});

describe("التمرير للأعلى", () => {
  it("الضغط على تعديل يمرّر الحركة نفسها", () => {
    const { onEdit } = renderDialog();
    fireEvent.click(btn("pay", /^تعديل/));
    expect(onEdit).toHaveBeenCalledWith(PAYMENT);
  });

  it("الضغط على حذف يمرّر الحركة نفسها", () => {
    const { onDelete } = renderDialog();
    fireEvent.click(btn("chg", /^حذف/));
    expect(onDelete).toHaveBeenCalledWith(CHARGE);
  });

  it("الأزرار المقفلة لا تُنادي شيئاً", () => {
    const { onEdit, onDelete } = renderDialog();
    fireEvent.click(btn("use", /^تعديل/));
    fireEvent.click(btn("use", /^حذف/));
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("العدّاد والتصفية والبحث", () => {
  it("العدّاد يحصي ما تسمح به القدرات لا رقماً مكتوباً يدوياً", () => {
    renderDialog();
    const caps = ALL.map((t) => movementCapabilities(t, ALL));
    const editable = caps.filter((c) => c.canEdit).length;   // الدفعة + شحنتان = 3
    const deletable = caps.filter((c) => c.canDelete).length; // + المستقلة = 4
    expect(editable).toBe(3);
    expect(deletable).toBe(4);
    const text = screen.getByTestId("movements-counts").textContent || "";
    expect(text).toContain(`${editable} قابلة للتعديل`);
    expect(text).toContain(`${deletable} قابلة للحذف`);
  });

  it("تصفية «المقفلة» تُبقي ما لا يُفعل به شيء", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "المقفلة" }));
    expect(rowOf("use")).toBeTruthy();
    expect(rowOf("pay")).toBeNull();
  });

  it("تصفية «شحنات الرصيد» تستبعد الدفعات", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "شحنات الرصيد" }));
    expect(rowOf("chg")).toBeTruthy();
    expect(rowOf("chg2")).toBeTruthy();
    expect(rowOf("pay")).toBeNull();
    expect(rowOf("solo")).toBeNull();
  });

  it("البحث برقم الفاتورة يُبقي حركاتها", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("بحث في الحركات"), { target: { value: "INV-900" } });
    expect(rowOf("pay")).toBeTruthy();
    expect(rowOf("chg")).toBeNull();
  });

  it("بحث بلا نتائج يعرض رسالة بدل قائمة فارغة", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("بحث في الحركات"), { target: { value: "لا يوجد" } });
    expect(screen.getByText("لا توجد حركات مطابقة")).toBeTruthy();
  });
});

describe("حالات الحافة", () => {
  it("بلا حركات إطلاقاً", () => {
    renderDialog({ transactions: [] });
    expect(screen.getByText("لا توجد حركات مطابقة")).toBeTruthy();
    expect(screen.getByText(/0 قابلة للتعديل · 0 قابلة للحذف/)).toBeTruthy();
  });

  it("الحركات غير المتعلّقة بحساب العميل لا تُعرض إطلاقاً", () => {
    renderDialog({ transactions: [...ALL, tx({ id: "misc", category: "expense", amount: 40 })] });
    expect(rowOf("misc")).toBeNull();
  });
});
