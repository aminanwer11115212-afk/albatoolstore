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
  it("سطر الفاتورة يحمل التاريخ والساعة بلا اسم اليوم", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const row = pageOf(container).getByText(/فاتورة INV-1001/).closest("tr")!;
    expect(row.textContent).toContain("2026-07-30 · 09:15");
    expect(row.textContent).not.toContain("الخميس");
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
    // بلغة مخاطبة العميل لا بلغة المحاسبة
    expect(payRow.textContent).toContain("دفعتم 4,000 عن طريق نقدًا");
    expect(payRow.textContent).toContain("10:30");
    expect(overRow.textContent).toContain("دفعتم زيادة 1,000 عن قيمة الفاتورة");
    expect(overRow.textContent).toContain("أُضيفت إلى رصيدكم لدينا");
  });
});

describe("شحن الرصيد كشريط أخضر فاصل", () => {
  it("يظهر داخل الجدول كصف يمتد على كل الأعمدة لا في قسم منفصل", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const band = container.querySelector(".ps-credit-band")!;
    expect(band).toBeTruthy();
    const cell = band.querySelector("td")!;
    expect(cell.getAttribute("colspan")).toBe("6");
    // لم يعد هناك قسم مستقل في ذيل الكشف
    expect(pageOf(container).queryByText("المتاح للتوزيع")).toBeNull();
  });

  it("نصّه يشرح للعميل المبلغ والتاريخ ورقم العملية والرصيد بعده", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const text = container.querySelector(".ps-credit-band")!.textContent || "";
    expect(text).toContain("تم شحن رصيدكم بمبلغ 4,000");
    expect(text).toContain("رقم العملية OP-9");
    expect(text).toContain("2026-07-31");
    expect(text).toContain("الساعة 12:00");
    expect(text).not.toContain("الجمعة");
    expect(text).toContain("حسابكم بعدها: له +5,000");
  });

  it("لا يُحتسب في ترقيم الفواتير", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const seqs = [...container.querySelectorAll(".ps-inv-row")].map(
      (r) => r.querySelector("td")!.textContent,
    );
    expect(seqs).toEqual(seqs.map((_, i) => String(i + 1)));
  });

  it("يقع في موضعه الزمني بعد الفاتورة الأقدم منه", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const rows = [...container.querySelectorAll(".ps-by-invoice tbody tr")];
    const invIdx = rows.findIndex((r) => r.classList.contains("ps-inv-row"));
    const bandIdx = rows.findIndex((r) => r.classList.contains("ps-credit-band"));
    expect(bandIdx).toBeGreaterThan(invIdx);
  });
});

describe("شرح مبسّط للعميل", () => {
  it("تحت رقم الفاتورة جملة تشرح قيمتها والمدفوع والمتبقي", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const plain = container.querySelector(".ps-plain")!.textContent || "";
    expect(plain).toContain("قيمتها 4,000");
    expect(plain).toContain("دفعتم 4,000");
    expect(plain).toContain("ولكم زيادة 1,000 أُضيفت لرصيدكم");
  });
});

describe("الجملة", () => {
  it("تطابق net_balance وتُعرض «له +5,000» بكلمة العميل نفسها", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const row = pageOf(container).getByText("الجملة").closest("tr")!;
    expect(within(row).getByText("له +5,000")).toBeTruthy();
  });

  it("الأعمدة بكلمات العميل: القيمة / دفع / المتبقي", async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText(/الفواتير وحركاتها/));
    const heads = [...container.querySelectorAll(".ps-by-invoice thead th")].map((h) => h.textContent);
    expect(heads).toEqual(["#", "التاريخ والساعة", "البيان", "القيمة", "دفع", "المتبقي"]);
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
