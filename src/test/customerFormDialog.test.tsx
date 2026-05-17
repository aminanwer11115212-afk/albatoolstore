import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * RTL tests for CustomerFormDialog input validation.
 *  - Name required (whitespace-only rejected)
 *  - Trims whitespace on save
 *  - Empty optional fields become null
 */

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string) => toastSuccess(m),
  },
}));

const insertCalls: any[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const api: any = {
      select: () => api,
      order: () => Promise.resolve({ data: [], error: null }),
      eq: () => api,
      delete: () => api,
      update: () => api,
      insert: (payload: any) => {
        if (table === "customers") {
          insertCalls.push(payload);
          return {
            select: () => ({
              single: async () => ({ data: { id: "new-cust", ...payload }, error: null }),
            }),
          };
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return api;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    },
  };
});

import CustomerFormDialog from "@/components/CustomerFormDialog";

beforeEach(() => {
  toastError.mockClear();
  toastSuccess.mockClear();
  insertCalls.length = 0;
});

describe("CustomerFormDialog — input validation", () => {
  it("rejects empty name", async () => {
    render(<CustomerFormDialog open onClose={() => {}} onSaved={() => {}} />);
    const saveBtn = await screen.findByRole("button", { name: /^حفظ$|^إضافة$/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("الاسم مطلوب"));
    expect(insertCalls.length).toBe(0);
  });

  it("rejects whitespace-only name", async () => {
    render(<CustomerFormDialog open onClose={() => {}} onSaved={() => {}} />);
    const nameInput = await screen.findByPlaceholderText(/اسم العميل/);
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /^حفظ$|^إضافة$/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("الاسم مطلوب"));
    expect(insertCalls.length).toBe(0);
  });

  it("trims whitespace and converts empty optional fields to null", async () => {
    render(<CustomerFormDialog open onClose={() => {}} onSaved={() => {}} />);
    const nameInput = await screen.findByPlaceholderText(/اسم العميل/);
    fireEvent.change(nameInput, { target: { value: "  أحمد التجريبي  " } });

    fireEvent.click(screen.getByRole("button", { name: /^حفظ$|^إضافة$/ }));

    await waitFor(() => expect(insertCalls.length).toBe(1));
    const payload = insertCalls[0];
    expect(payload.name).toBe("أحمد التجريبي");
    expect(payload.phone).toBeNull();
    expect(payload.whatsapp).toBeNull();
    expect(payload.address).toBeNull();
    expect(payload.notes).toBeNull();
    // role-scoped fields propagated
    expect(payload.created_by_uid).toBe("u1");
  });
});
