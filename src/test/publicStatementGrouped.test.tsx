/**
 * كشف حساب العميل العام — عرض حسب الفاتورة بلا توزيع تلقائي ولا تسوية تراكمية.
 *
 * يتحقّق أن السجل المسطّح وأسطر «التسوية من شحن رصيد» المستنتجة اختفت، وأن كل
 * فاتورة تتبعها حركاتها المرتبطة بها فقط بدقة الساعة، وأن الرصيد ملوّن بإشارته
 * («له +» أخضر / «عليه −» أحمر)، وأن الإجمالي يطابق net_balance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicCustomerStatementPage from "@/pages/PublicCustomerStatementPage";

// فاتورة 4000 دفع عليها العميل 5000: 4000 تُقيَّد عليها و1000 فائض دائن.
// ثم شحن رصيد 4000 يبقى قابلاً للتوزيع ⇒ الصافي = له 5000.
const customer = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "عميل تجريبي",
  phone: "0900000000",
  balance: 0,
  credit_balance: 5000,
  net_balance: -5000,
};

const payload = {
  customer,
  company: { company_name: "شركة الاختبار", currency: "SYP" },
  invoices: [
    { id: "inv-1", invoice_number: "INV-1001", date: "2026-07-30", created_at: "2026-07-30T09:15:00", total: 4000, paid_amount: 4000, due_amount: 0, status: "paid" },
  ],
  quotes: [],
  returns: [],
  transactions: [
    { id: "p1", date: "2026-07-30", created_at: "2026-07-30T10:30:00", amount: 4000, type: "income", category: "customer_payment", reference_id: "inv-1", method: "cash" },
    { id: "o1", date: "2026-07-30", created_at: "2026-07-30T10:30:00", amount: 1000, type: "income", category: "customer_credit", reference_id: "inv-1", description: "فائض دفعة على فاتورة INV-1001" },
    { id: "ch", date: "2026-07-31", created_at: "2026-07-31T12:00:00", amount: 4000, type: "income", category: "customer_credit", reference_no: "OP-9", description: "شحن رصيد" },
  ],
  accounts: [],
};

/** الاستعلامات مُقيَّدة بـ `.ps-page` لأن شريط الطباعة يكرّر أسماء الأقسام. */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/share/customer/t/tok-1"]}>
      <Routes>
        <Route path="/share/customer/t/:token" element={<PublicCustomerStatementPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
const pageOf = (container: HTMLElement) => within(container.querySelector(".ps-page") as HTMLElement);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => payload })) as any);
});
afterEach(() => vi.unstubAllGlobals());

describe("لا سجل حركات ولا تسوية تراكمية", () => {
  it("السجل المسطّح غائب", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/الفواتير وحركاتها/)).toBeTruthy());
    expect(screen.queryByText(/سجل الحركات/)).toBeNull();
    expect(screen.queryByText(/الرصيد بعد الحركة/)).toBeNull();
  });

  it("لا أسطر «تسوية من شحن رصيد» مستنتجة ولا «الفائض بعد التغطية»", async () => {
    renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    expect(screen.queryByText(/تسوية من شحن رصيد/)).toBeNull();
    expect(screen.queryByText(/الفائض بعد التغطية/)).toBeNull();
    expect(screen.queryByText(/تسوية رصيد مُرحَّل/)).toBeNull();
  });
});

describe("الفاتورة وحركاتها بدقة الساعة", () => {
  it("سطر الفاتورة يحمل التاريخ واليوم والساعة", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const row = pageOf(container).getByText(/فاتورة INV-1001/).closest("tr")!;
    expect(row.textContent).toContain("2026-07-30 · الخميس · 09:15");
  });

  it("المتبقي يظهر «له +1,000» لا صفراً — العميل دفع أكثر من قيمتها", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const cells = within(pageOf(container).getByText(/فاتورة INV-1001/).closest("tr")!).getAllByRole("cell");
    // الأعمدة: # | التاريخ | البيان | الإجمالي | المدفوع | المتبقي | حساب العميل بعدها
    expect(cells[5].textContent).toBe("له +1,000");
    expect(cells[3].textContent).toBe("4,000");
    expect(cells[4].textContent).toBe("4,000");
  });

  it("حركات الفاتورة تحتها مباشرة: الدفعة ثم الفائض", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const page = pageOf(container);
    const invRow = page.getByText(/فاتورة INV-1001/).closest("tr")!;
    const payRow = invRow.nextElementSibling as HTMLElement;
    const overRow = payRow.nextElementSibling as HTMLElement;
    expect(payRow.textContent).toContain("دفعة على الفاتورة");
    expect(payRow.textContent).toContain("10:30");
    expect(overRow.textContent).toContain("فائض دفعة → رصيد العميل");
  });
});

describe("رصيد العميل القابل للتوزيع", () => {
  it("الشحنة غير المرتبطة بفاتورة تظهر في قسم مستقل لا تحت فاتورة", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const page = pageOf(container);
    expect(page.getAllByText(/رصيد العميل القابل للتوزيع/).length).toBeGreaterThan(0);
    const chargeRow = page.getByText(/شحن رصيد للعميل/).closest("tr")!;
    expect(chargeRow.textContent).toContain("2026-07-31 · الجمعة · 12:00");
    // عمود المبلغ يعرض أثر الحركة: تُخصم 4,000 من مجموع حساب العميل
    expect(within(chargeRow).getByText("−4,000")).toBeTruthy();
    // وعمود الرصيد بعدها يعرضه بلغة «له/عليه»
    expect(within(chargeRow).getByText("له +5,000")).toBeTruthy();
  });

  it("المتاح للتوزيع 4,000 — الفائض المنسوب لفاتورة غير محسوب فيه", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    expect(pageOf(container).getByText("المتاح للتوزيع").closest("tr")!.textContent).toContain("4,000");
  });
});

describe("إجمالي حساب العميل", () => {
  it("يطابق net_balance ويُعرض «له +5,000»", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const row = pageOf(container).getByText("إجمالي حساب العميل").closest("tr")!;
    expect(within(row).getByText("له +5,000")).toBeTruthy();
  });
});

describe("سلامة بصرية", () => {
  it("الصفحة RTL عربية", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const root = container.querySelector(".public-statement")!;
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("lang")).toBe("ar");
  });

  it("«له» أخضر و«عليه» أحمر", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const credit = pageOf(container).getAllByText(/^له \+/)[0];
    expect(credit.getAttribute("style")).toContain("rgb(22, 163, 74)"); // #16a34a
  });
});
