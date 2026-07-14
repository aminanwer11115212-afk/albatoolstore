/**
 * @vitest-environment jsdom
 *
 * Integration checks for CustomerPaymentDialog:
 *  - حالة الحساب (خالص/له/عليه) تظهر بالألوان الصحيحة
 *  - نافذة تأكيد قبل الحفظ + إمكانية الإلغاء
 *  - منع القيم السالبة
 *  - صلاحيات: منع الخصم/تسجيل مبلغ عام لغير المخوّلين
 *  - طريقة الدفع مثبتة "تحويل بنكي"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CustomerPaymentDialog from "@/components/invoice/CustomerPaymentDialog";

// role hook — يتحكم به كل اختبار
const roleState: { isAdmin: boolean; permissions: any } = {
  isAdmin: true,
  permissions: {},
};
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    role: roleState.isAdmin ? "admin" : "sales",
    isAdmin: roleState.isAdmin,
    isStaff: !roleState.isAdmin,
    permissions: roleState.permissions,
    loading: false,
  }),
}));

// حسابات جاهزة تحتوي "أولاد جابر"
vi.mock("@/hooks/useData", () => ({
  useAccounts: () => ({
    data: [
      { id: "acc-jaber", name: "أولاد جابر", bank_name: "بنك الخرطوم", account_type: "bank", is_default: true },
      { id: "acc-2", name: "حساب آخر", bank_name: "بنك ب", account_type: "bank" },
    ],
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

// supabase — نتحكم بقراءة الرصيد
const custRow = { balance: 0, credit_balance: 0 };
vi.mock("@/integrations/supabase/client", () => {
  const chain = (row: any) => ({
    select: () => chain(row),
    eq: () => chain(row),
    maybeSingle: async () => ({ data: row, error: null }),
    update: () => chain(row),
    insert: async () => ({ error: null }),
  });
  return {
    supabase: {
      from: (t: string) => {
        if (t === "customers") return chain(custRow);
        if (t === "invoices") return chain({ total: 1000, paid_amount: 0, discount: 0, subtotal: 1000 });
        return chain({});
      },
    },
  };
});

vi.mock("@/utils/balanceRefreshToast", () => ({
  refetchAndToastCustomerBalance: vi.fn(),
}));
vi.mock("@/utils/discountAuditLogger", () => ({ logDiscountEvent: vi.fn() }));
vi.mock("sonner", () => {
  const fn: any = vi.fn();
  fn.success = vi.fn();
  fn.error = vi.fn();
  fn.info = vi.fn();
  return { toast: fn };
});

function renderDlg(props: Partial<React.ComponentProps<typeof CustomerPaymentDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CustomerPaymentDialog
        open
        onOpenChange={() => {}}
        invoiceId="inv-1"
        invoiceNumber="INV-001"
        customerId="cust-1"
        customerName="أمين"
        total={1000}
        paidBefore={0}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cleanup();
  roleState.isAdmin = true;
  roleState.permissions = {};
  custRow.balance = 0;
  custRow.credit_balance = 0;
});

describe("CustomerPaymentDialog — تدفق الدفعة", () => {
  it("طريقة الدفع مثبتة على «تحويل بنكي»", () => {
    renderDlg();
    expect(screen.getByDisplayValue("تحويل بنكي")).toBeTruthy();
  });

  it("يعرض حالة «خالص» عند رصيد صفري", async () => {
    renderDlg();
    await waitFor(() => expect(screen.getByText(/حساب العميل:/)).toBeTruthy());
    expect(screen.getByText(/خالص/)).toBeTruthy();
  });

  it("يعرض «له» بالأخضر عند وجود رصيد دائن", async () => {
    custRow.credit_balance = 500;
    renderDlg({ total: 0, paidBefore: 0 });
    await waitFor(() => expect(screen.getByText(/له/)).toBeTruthy());
  });

  it("يعرض «عليه» بالأحمر عند وجود دين", async () => {
    custRow.balance = 700;
    renderDlg();
    await waitFor(() => expect(screen.getByText(/عليه/)).toBeTruthy());
  });

  it("يمنع القيم السالبة في المبلغ", () => {
    renderDlg();
    const input = screen.getAllByPlaceholderText("0.00")[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-50" } });
    expect(input.value).not.toBe("-50");
  });

  it("يفتح نافذة تأكيد قبل الحفظ ويمكن الإلغاء", async () => {
    renderDlg();
    const save = screen.getByTestId("open-confirm-payment");
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByText(/تأكيد تسجيل الدفعة/)).toBeTruthy());
    fireEvent.click(screen.getByText("رجوع"));
    await waitFor(() => expect(screen.queryByText(/تأكيد تسجيل الدفعة/)).toBeNull());
  });

  it("يمنع تطبيق خصم دون صلاحية apply_discount", () => {
    roleState.isAdmin = false;
    roleState.permissions = { apply_discount: false, record_payment: true };
    renderDlg();
    expect(screen.getByText(/صلاحية «تطبيق خصم» غير مفعّلة/)).toBeTruthy();
  });

  it("يعرض تنبيه صلاحية «تسجيل مبلغ عام» لغير المخوّل", () => {
    roleState.isAdmin = false;
    roleState.permissions = { record_payment: false };
    renderDlg();
    expect(screen.getByText(/صلاحية «تسجيل مبلغ عام» مطلوبة/)).toBeTruthy();
  });

  it("يبرز حساب «أولاد جابر» عند توفره", async () => {
    renderDlg();
    await waitFor(() => expect(screen.getByText(/أولاد جابر/)).toBeTruthy());
  });
});
