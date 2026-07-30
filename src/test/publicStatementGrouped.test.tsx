/**
 * البند 3 — فحص العرض الفعلي لصفحة كشف حساب العميل العامة.
 *
 * يتحقّق أن السجل المسطّح اختفى، وأن كل فاتورة سطر مستقل تتبعه تسوياتها،
 * وأن الرصيد النهائي المعروض يطابق net_balance، وأن الصفحة RTL عربية.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicCustomerStatementPage from "@/pages/PublicCustomerStatementPage";

const customer = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "عميل تجريبي",
  phone: "0900000000",
  balance: 0,
  credit_balance: 100,
  net_balance: -100,
};

// فاتورة 500 — دفع 400 — المتبقي 100 غُطّي من شحن رصيد 200، والفائض 100 دائن.
const payload = {
  customer,
  company: { company_name: "شركة الاختبار", currency: "SYP" },
  invoices: [
    { id: "inv-1", invoice_number: "INV-1001", date: "2026-01-01", total: 500, paid_amount: 500, due_amount: 0, status: "paid" },
  ],
  quotes: [],
  returns: [],
  transactions: [
    { id: "p1", date: "2026-01-02", amount: 400, type: "income", category: "customer_payment", reference_id: "inv-1", method: "cash" },
    { id: "c1", date: "2026-02-01", amount: 200, type: "income", category: "customer_credit", reference_no: "OP-1", allocation: { group_id: "g1", kind: "surplus" } },
    { id: "u1", date: "2026-02-02", amount: -100, type: "income", category: "customer_credit", reference_id: "inv-1", allocation: { group_id: "g1", kind: "invoice_alloc" } },
    { id: "p2", date: "2026-02-02", amount: 100, type: "income", category: "customer_payment", reference_id: "inv-1", method: "credit_balance" },
  ],
  accounts: [],
};

/**
 * الاستعلامات مُقيَّدة بـ `.ps-page` (جسم المستند) لأن شريط تخصيص الطباعة
 * يعرض أسماء الأقسام نفسها كأزرار، فالبحث العام يلتقط تطابقين.
 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/share/customer/t/tok-1"]}>
      <Routes>
        <Route path="/share/customer/t/:token" element={<PublicCustomerStatementPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => payload })) as any,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PublicCustomerStatementPage — عرض مجمّع حسب الفاتورة", () => {
  it("يعرض قسم الفواتير وتسوياتها بدل سجل الحركات المسطّح", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/الفواتير وتسوياتها/)).toBeTruthy());
    expect(screen.queryByText(/سجل الحركات/)).toBeNull();
    expect(screen.queryByText(/الرصيد بعد الحركة/)).toBeNull();
  });

  it("الفاتورة سطر مستقل بقيمتها ومدفوعها ومتبقيها", async () => {
    renderPage();
    const invRow = await waitFor(() => screen.getByText(/فاتورة INV-1001/).closest("tr")!);
    const cells = within(invRow).getAllByRole("cell").map((c) => c.textContent?.trim());
    expect(cells).toEqual(["1", "2026-01-01", "فاتورة INV-1001", "500", "500", "مسددة"]);
  });

  it("التسوية سطر تحت الفاتورة مباشرة: السابق 100 — المدفوع 100 — الفائض 100", async () => {
    renderPage();
    await waitFor(() => screen.getByText(/فاتورة INV-1001/));
    const settleRow = screen.getByText(/تسوية من شحن رصيد/).closest("tr")!;
    // تأتي مباشرة بعد سطر فاتورتها
    const invRow = screen.getByText(/فاتورة INV-1001/).closest("tr")!;
    expect(invRow.nextElementSibling).toBe(settleRow);

    expect(settleRow.textContent).toContain("200");
    expect(settleRow.textContent).toContain("OP-1");
    expect(settleRow.textContent).toContain("الفائض بعد التغطية 100 رصيد دائن للعميل");
    const cells = within(settleRow).getAllByRole("cell").map((c) => c.textContent?.trim());
    expect(cells[3]).toBe("100"); // السابق
    expect(cells[4]).toBe("100"); // المدفوع
    expect(cells[5]).toBe("مسددة"); // المتبقي
  });

  it("الرصيد النهائي في الجدول يطابق net_balance (له 100)", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وتسوياتها/));
    const page = within(container.querySelector(".ps-page") as HTMLElement);
    const closingRow = page.getByText("الرصيد النهائي").closest("tr")!;
    expect(closingRow.textContent).toContain("100");
    expect(closingRow.textContent).toContain("له");
    // ولا تسوية مُرحَّلة تظهر لأن الحساب متّزن
    expect(page.queryByText("تسوية رصيد مُرحَّل")).toBeNull();
  });

  it("يعرض شحنات الرصيد بفائضها المتبقي", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وتسوياتها/));
    const page = within(container.querySelector(".ps-page") as HTMLElement);
    const chargeRow = page.getByText("OP-1").closest("tr")!;
    const cells = within(chargeRow).getAllByRole("cell").map((c) => c.textContent?.trim());
    expect(cells).toEqual(["1", "2026-02-01", "OP-1", "200", "100", "100"]);
  });

  it("الصفحة RTL عربية", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وتسوياتها/));
    const root = container.querySelector(".public-statement")!;
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("lang")).toBe("ar");
  });
});
