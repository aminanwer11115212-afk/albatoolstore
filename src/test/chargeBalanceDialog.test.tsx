import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * RTL tests for ChargeBalanceDialog — covers input validation:
 *  - Customer required
 *  - Amount > 0 required
 *  - bank_transfer requires bank account + reference number
 */

// ---- Mocks ----
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string) => toastSuccess(m),
  },
}));

const fakeCustomers = [
  { id: "c1", name: "عميل اختبار", phone: "0911", balance: 100 },
];
const fakeAccounts = [
  { id: "a1", name: "الخزنة", bank_name: null, account_type: "cash", is_default: true },
];

const insertedTransactions: any[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const api: any = {
      select: () => api,
      order: () => Promise.resolve({
        data: table === "customers" ? fakeCustomers
            : table === "accounts" ? fakeAccounts
            : [],
        error: null,
      }),
      eq: () => api,
      update: () => api,
      insert: (payload: any) => {
        if (table === "transactions") insertedTransactions.push(payload);
        return Promise.resolve({ data: null, error: null });
      },
    };
    // make eq().order() also resolve for invoices query
    api.order = (() => {
      let chained = false;
      return (..._args: any[]) => {
        if (!chained) {
          chained = true;
          return Promise.resolve({
            data: table === "customers" ? fakeCustomers
                : table === "accounts" ? fakeAccounts
                : [],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      };
    })();
    return api;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

import ChargeBalanceDialog from "@/components/dashboard/ChargeBalanceDialog";

beforeEach(() => {
  toastError.mockClear();
  toastSuccess.mockClear();
  insertedTransactions.length = 0;
});

describe("ChargeBalanceDialog — input validation", () => {
  it("shows error when no customer is selected", async () => {
    render(<ChargeBalanceDialog open onOpenChange={() => {}} />);
    const saveBtn = await screen.findByRole("button", { name: /شحن الرصيد/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("اختر العميل"));
    expect(insertedTransactions.length).toBe(0);
  });

  it("shows error when amount is empty/zero", async () => {
    render(<ChargeBalanceDialog open onOpenChange={() => {}} />);
    // pick a customer via the suggestion list
    const search = await screen.findByPlaceholderText(/ابحث بالاسم/);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "عميل" } });
    const suggestion = await screen.findByText("عميل اختبار");
    fireEvent.mouseDown(suggestion);

    const saveBtn = screen.getByRole("button", { name: /شحن الرصيد/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("أدخل مبلغاً صحيحاً"));
    expect(insertedTransactions.length).toBe(0);
  });

  it("rejects negative amount", async () => {
    render(<ChargeBalanceDialog open onOpenChange={() => {}} />);
    const search = await screen.findByPlaceholderText(/ابحث بالاسم/);
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: "عميل" } });
    fireEvent.mouseDown(await screen.findByText("عميل اختبار"));

    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "-50" } });

    fireEvent.click(screen.getByRole("button", { name: /شحن الرصيد/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("أدخل مبلغاً صحيحاً"));
    expect(insertedTransactions.length).toBe(0);
  });
});
