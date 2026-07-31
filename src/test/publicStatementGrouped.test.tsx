/**
 * كشف حساب العميل العام — الجدول المسطّح بالشكل الذي طلبه العميل.
 *
 * كل الأسطر بنفس الشكل: فاتورة، شحن رصيد، سداد من الرصيد — لا أسطر فرعية ولا
 * شريط يمتد على الأعمدة. «المتبقي» بإشارة العرض: «+» أخضر و«−» أحمر، وسطر
 * المجموع يحمل صافي الحساب المطابق لـ net_balance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicCustomerStatementPage from "@/pages/PublicCustomerStatementPage";

// مثال العميل: فاتورتان بـ200 ثم شحن 500 ⇒ الشحن يبتلع 400 ويبقى 100 له.
const customer = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "عميل تجريبي",
  phone: "0900000000",
  balance: 400,
  credit_balance: 500,
  net_balance: -100,
};

const payload = {
  customer,
  company: { company_name: "شركة الاختبار", currency: "SYP" },
  invoices: [
    { id: "a", invoice_number: "INV-A", date: "2026-07-20", created_at: "2026-07-20T09:00:00", total: 200, paid_amount: 0, due_amount: 200, status: "pending" },
    { id: "b", invoice_number: "INV-B", date: "2026-07-21", created_at: "2026-07-21T10:40:00", total: 200, paid_amount: 0, due_amount: 200, status: "pending" },
  ],
  quotes: [],
  returns: [],
  transactions: [
    { id: "ch", category: "customer_credit", amount: 500, reference_no: "OP-7", type: "income", date: "2026-07-25", created_at: "2026-07-25T12:00:00", description: "شحن رصيد" },
  ],
  accounts: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/share/customer/t/tok-1"]}>
      <Routes>
        <Route path="/share/customer/t/:token" element={<PublicCustomerStatementPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
/** الاستعلامات مُقيَّدة بـ `.ps-page` لأن شريط الطباعة يكرّر أسماء الأقسام. */
const pageOf = (c: HTMLElement) => within(c.querySelector(".ps-page") as HTMLElement);
const ready = () => waitFor(() => expect(screen.getAllByText("الحساب").length).toBeGreaterThan(0));
const bodyRows = (c: HTMLElement) => [...c.querySelectorAll(".ps-by-invoice tbody tr")];
const cellsOf = (tr: Element) => [...tr.querySelectorAll("td")].map((td) => td.textContent);

describe("الجدول المسطّح — أسطر المثال بالضبط", () => {
  it("ثلاثة أسطر ثم سطر المجموع، بالأرقام نفسها", async () => {
    const { container } = renderPage();
    await ready();
    const rows = bodyRows(container);
    expect(rows).toHaveLength(4); // فاتورتان + شحن + المجموع
    expect(cellsOf(rows[0])).toEqual(["1", "2026-07-20 · 09:00", "فاتورة INV-A", "200", "—", "\u2212200"]);
    expect(cellsOf(rows[1])).toEqual(["2", "2026-07-21 · 10:40", "فاتورة INV-B", "200", "—", "\u2212200"]);
    expect(cellsOf(rows[2])).toEqual(["3", "2026-07-25 · 12:00", "＋تم شحن +500", "—", "500", "+100"]);
  });

  it("سطر المجموع: 400 / 500 / +100 — والطرح يقفل", async () => {
    const { container } = renderPage();
    await ready();
    const total = container.querySelector(".ps-closing-row")!;
    expect(cellsOf(total)).toEqual(["المجموع", "400", "500", "+100"]);
  });

  it("عمودا القيمة والمدفوع يجمعان إلى سطر المجموع", async () => {
    const { container } = renderPage();
    await ready();
    const rows = bodyRows(container).slice(0, 3);
    const col = (i: number) => rows.reduce((s, r) => s + (Number(cellsOf(r)[i]?.replace(/,/g, "")) || 0), 0);
    expect(col(3)).toBe(400);
    expect(col(4)).toBe(500);
  });

  it("الترقيم متسلسل على كل الأسطر", async () => {
    const { container } = renderPage();
    await ready();
    expect(bodyRows(container).slice(0, 3).map((r) => cellsOf(r)[0])).toEqual(["1", "2", "3"]);
  });

  it("نوعا الأسطر فقط: فاتورة وشحن — لا سطر سداد", async () => {
    const { container } = renderPage();
    await ready();
    expect(bodyRows(container).slice(0, 3).map((r) => r.className))
      .toEqual(["ps-inv-row", "ps-inv-row", "ps-credit-row"]);
    expect(container.querySelector(".ps-settle-row")).toBeNull();
    expect(screen.queryByText(/سداد من رصيد/)).toBeNull();
  });

  it("نصّ الشحن يحمل التاريخ والساعة بلا اسم اليوم", async () => {
    const { container } = renderPage();
    await ready();
    const row = container.querySelector(".ps-credit-row")!;
    expect(row.textContent).toContain("تم شحن +500");
    expect(row.textContent).toContain("2026-07-25 · 12:00");
    expect(row.textContent).not.toContain("السبت");
  });
});

describe("لا بقايا من الشكل القديم", () => {
  it("لا أسطر فرعية ولا شريط ممتد ولا سجل حركات", async () => {
    const { container } = renderPage();
    await ready();
    expect(container.querySelector(".ps-credit-band")).toBeNull();
    expect(container.querySelector(".ps-plain")).toBeNull();
    expect(container.querySelector("[colspan='6']")).toBeNull();
    expect(screen.queryByText(/سجل الحركات/)).toBeNull();
    expect(screen.queryByText(/تسوية من شحن رصيد/)).toBeNull();
  });

  it("الأعمدة بكلمات العميل", async () => {
    const { container } = renderPage();
    await ready();
    const heads = [...container.querySelectorAll(".ps-by-invoice thead th")].map((h) => h.textContent);
    expect(heads).toEqual(["#", "التاريخ والساعة", "البيان", "القيمة", "المدفوع", "المتبقي"]);
  });
});

describe("الألوان: + أخضر و− أحمر", () => {
  it("الموجب أخضر والسالب أحمر في عمود المتبقي", async () => {
    const { container } = renderPage();
    await ready();
    // «المتبقي» آخر خلية دائماً — سطر المجموع يدمج الأعمدة الثلاثة الأولى
    const tone = (tr: Element) =>
      [...tr.querySelectorAll("td")].at(-1)!.querySelector("span")!.getAttribute("style");
    const rows = bodyRows(container);
    expect(tone(rows[0])).toContain("rgb(192, 57, 43)");  // −200 أحمر
    expect(tone(rows[2])).toContain("rgb(22, 163, 74)");  // +100 أخضر
    expect(tone(rows[3])).toContain("rgb(22, 163, 74)");  // المجموع +100 أخضر
  });
});

describe("الصناديق والرصيد النهائي", () => {
  it("المجموع والمدفوع ورصيد العميل تطابق الجدول", async () => {
    const { container } = renderPage();
    await ready();
    const boxes = [...container.querySelectorAll(".ps-summary-box")].map((b) => b.textContent);
    expect(boxes).toEqual(["المجموع400", "المدفوع500", "رصيد لكم100"]);
  });

  it("الرصيد النهائي يطابق net_balance", async () => {
    const { container } = renderPage();
    await ready();
    const final = container.querySelector(".ps-final")!;
    expect(final.textContent).toContain("100");
    expect(final.className).toContain("credit");
  });
});

describe("سلامة بصرية", () => {
  it("الصفحة RTL عربية", async () => {
    const { container } = renderPage();
    await ready();
    const root = container.querySelector(".public-statement")!;
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("lang")).toBe("ar");
  });
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => payload })) as any);
});
afterEach(() => vi.unstubAllGlobals());

// مرجع غير مستخدم يبقى للتوثيق أن الاستعلام يمكن حصره بالصفحة عند اللبس
void pageOf;
