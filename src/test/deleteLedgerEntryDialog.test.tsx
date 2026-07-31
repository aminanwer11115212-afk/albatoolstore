/**
 * البند 2 — النافذة التفصيلية للحذف: ملخّص قبل التنفيذ وتأكيد بعده.
 *
 * يفحص أنها ليست Alert نصياً: تعرض المبلغ والتاريخ والفاتورة المرتبطة وأثر
 * العملية على الرصيد (حالي ← بعد التنفيذ)، وتمنع حذف شحنة مستهلَكة برسالة
 * تطلب مراجعة الاستهلاك، وأنها RTL بتوكنات التصميم فقط.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DeleteLedgerEntryDialog, { type DeletableEntry } from "@/components/statement/DeleteLedgerEntryDialog";
import type { LedgerTx } from "@/utils/ledgerEntryActions";

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

const payment: DeletableEntry = {
  id: "p1",
  customer_id: "c1",
  category: "customer_payment",
  amount: 400,
  date: "2026-01-02",
  reference_id: "inv-1",
  invoiceNumber: "INV-1001",
  accountLabel: "نقدًا",
};

const charge: DeletableEntry = {
  id: "ch1",
  customer_id: "c1",
  category: "customer_credit",
  amount: 200,
  date: "2026-02-01",
  allocation: { group_id: "g1" },
};

const consumedCharge: LedgerTx = {
  id: "u1", customer_id: "c1", category: "customer_credit", amount: -120, date: "2026-02-05",
  allocation: { group_id: "g1" },
};

function renderDialog(entry: DeletableEntry, transactions: LedgerTx[], currentNet: number) {
  return render(
    <DeleteLedgerEntryDialog
      open
      entry={entry}
      transactions={transactions}
      currentNet={currentNet}
      onClose={() => {}}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ملخّص ما قبل التنفيذ", () => {
  it("يعرض المبلغ والتاريخ والفاتورة المرتبطة والحساب", () => {
    renderDialog(payment, [payment], 100);
    for (const label of ["المبلغ", "التاريخ", "الفاتورة المرتبطة", "الحساب / الطريقة"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("400")).toBeTruthy();
    expect(screen.getByText("2026-01-02")).toBeTruthy();
    expect(screen.getByText("INV-1001")).toBeTruthy();
    expect(screen.getByText("نقدًا")).toBeTruthy();
  });

  it("يعرض أثر العملية على الرصيد: حالي ← بعد التنفيذ", () => {
    renderDialog(payment, [payment], 100);
    expect(screen.getByText("أثر العملية على الرصيد")).toBeTruthy();
    expect(screen.getByText("عليه 100")).toBeTruthy();   // الرصيد الحالي
    expect(screen.getByText("عليه 500")).toBeTruthy();   // بعد حذف دفعة 400
    expect(screen.getByText("الرصيد الحالي ← الرصيد بعد التنفيذ")).toBeTruthy();
  });

  it("يعبّر عن الرصيد الدائن بـ«له» وعن الصفر بـ«خالص»", () => {
    renderDialog(charge, [charge], -200);
    expect(screen.getByText("له 200")).toBeTruthy();
    expect(screen.getByText("خالص")).toBeTruthy(); // −200 + 200 = 0
  });

  it("عنوان مختلف للدفعة وشحن الرصيد", () => {
    const { unmount } = renderDialog(payment, [payment], 0);
    expect(screen.getByText("حذف دفعة")).toBeTruthy();
    unmount();
    renderDialog(charge, [charge], 0);
    expect(screen.getByText("حذف شحن رصيد")).toBeTruthy();
  });

  it("يشرح أثر الحذف على الفاتورة قبل التأكيد", () => {
    renderDialog(payment, [payment], 100);
    expect(screen.getByText(/يُنقص المدفوع على الفاتورة/)).toBeTruthy();
  });
});

// الاستهلاك لم يعد مانعاً للحذف: `delete_customer_credit_entry` تعكسه على
// الفواتير أولاً ثم تحذف الشحنة. يبقى تحذيراً صريحاً لأن الحذف يُنقص
// `paid_amount` لفواتير أخرى — أثر يجب أن يراه المستخدم قبل التأكيد.
describe("الشحنة المستهلَكة: تحذير لا منع", () => {
  it("يظهر تحذير يشرح ما سيُعكَس قبل الحذف", () => {
    renderDialog(charge, [charge, consumedCharge], -80);
    expect(screen.getByTestId("delete-reverse-warning")).toBeTruthy();
    expect(screen.getByText("تنبيه: هذه الشحنة استُهلك منها")).toBeTruthy();
    expect(screen.getByText(/يُنقص المدفوع على الفواتير/)).toBeTruthy();
    expect(screen.getByText(/المستهلَك منها: 120/)).toBeTruthy();
  });

  it("زر التأكيد مفعّل رغم الاستهلاك", () => {
    renderDialog(charge, [charge, consumedCharge], -80);
    const btn = screen.getByRole("button", { name: "تأكيد الحذف" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("الشحنة السليمة تُتيح التأكيد بلا تحذير", () => {
    renderDialog(charge, [charge], -200);
    const btn = screen.getByRole("button", { name: "تأكيد الحذف" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(screen.queryByTestId("delete-reverse-warning")).toBeNull();
  });
});

describe("سلامة بصرية", () => {
  it("النافذة RTL", () => {
    renderDialog(payment, [payment], 100);
    expect(document.querySelector('[dir="rtl"]')).toBeTruthy();
  });

  it("توكنات التصميم فقط — لا ألوان مثبّتة", () => {
    const { container } = renderDialog(payment, [payment], 100);
    const html = container.parentElement?.innerHTML || "";
    expect(html).not.toMatch(/(?:bg|text|border)-(?:blue|green|red|yellow|gray|slate)-\d{2,3}/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("حقل سبب الحذف موجود للسجل", () => {
    renderDialog(payment, [payment], 100);
    expect(screen.getByText("سبب الحذف")).toBeTruthy();
    expect(screen.getByPlaceholderText("يُحفظ في سجل النشاط")).toBeTruthy();
  });
});
