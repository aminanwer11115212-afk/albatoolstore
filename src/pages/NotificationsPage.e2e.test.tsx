/**
 * Integration test (vitest + jsdom) for NotificationsPage per-user persistence.
 *
 * Verifies:
 *  1. عند تسجيل دخول مستخدم A، نقرات "تحديد كمقروء" تُكتب تحت
 *     lov:u:user-a:legacy:notif_read_ids
 *  2. عند تبديل الجلسة إلى مستخدم B (محاكاة onAuthStateChange)،
 *     لا تظهر القراءة السابقة، وتُحفظ قراءة B تحت مفتاح منفصل.
 *  3. الإيقاف المؤقت snooze لمستخدم A لا يؤثر على B.
 *  4. عودة A تستعيد قراءته/snooze الخاص به.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------- Mock supabase BEFORE importing the page ----------
type AuthCb = (e: string, session: { user: { id: string } } | null) => void;
const mockState = vi.hoisted(() => ({
  authListeners: new Set<(e: string, s: any) => void>(),
  currentSession: null as { user: { id: string } } | null,
}));

function setSession(uid: string | null) {
  mockState.currentSession = uid ? { user: { id: uid } } : null;
  mockState.authListeners.forEach((cb) => cb("SIGNED_IN", mockState.currentSession));
}

const sampleInvoice = {
  id: "inv-1",
  invoice_number: "INV-001",
  total: 100,
  paid_amount: 0,
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  customers: { name: "عميل تجريبي" },
};
const sampleStock = {
  id: "p-1",
  name: "منتج ناقص",
  stock_quantity: 0,
  min_stock: 5,
  updated_at: new Date().toISOString(),
};

function makeQueryBuilder(table: string) {
  // Chainable thenable that resolves with mocked data per table.
  const data =
    table === "invoices"
      ? [sampleInvoice]
      : table === "products"
      ? [sampleStock]
      : table === "activity_log"
      ? []
      : [];
  const builder: any = {
    select: () => builder,
    gte: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data, error: null }),
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockState.currentSession } }),
      onAuthStateChange: (cb: AuthCb) => {
        mockState.authListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => mockState.authListeners.delete(cb) } } };
      },
    },
    from: (table: string) => makeQueryBuilder(table),
  },
}));

// Import AFTER mocks
import NotificationsPage from "./NotificationsPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>
  );
}

const READ_KEY = (uid: string) => `lov:u:${uid}:legacy:notif_read_ids`;
const SNOOZE_KEY = (uid: string) => `lov:u:${uid}:legacy:notif_snoozed_stock`;

describe("NotificationsPage — per-user read/snooze persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    // لا نمسح authListeners — listener userScopedKey مُسجَّل وقت الاستيراد.
    setSession(null);
  });
  afterEach(() => cleanup());

  it("يفصل حالة القراءة والإيقاف المؤقت بين المستخدمين", async () => {
    // ---- Sign in as user A ----
    setSession("user-a");
    renderPage();

    // انتظر تحميل الإشعارات (دفعة + فاتورة + مخزون)
    await waitFor(() =>
      expect(screen.getByText(/نفد المخزون: منتج ناقص/)).toBeInTheDocument()
    );

    // اضغط "تحديد الظاهر كمقروء"
    await act(async () => {
      fireEvent.click(screen.getByText("تحديد الظاهر كمقروء"));
    });

    const aRead = JSON.parse(localStorage.getItem(READ_KEY("user-a")) || "[]");
    expect(aRead.length).toBeGreaterThan(0);
    expect(localStorage.getItem(READ_KEY("user-b"))).toBeNull();

    // اضغط "إخفاء" (snooze) على بطاقة المخزون
    const snoozeBtn = screen.getAllByTitle("إخفاء مؤقت لمدة ساعتين")[0];
    await act(async () => {
      fireEvent.click(snoozeBtn);
    });

    const aSnoozed = JSON.parse(localStorage.getItem(SNOOZE_KEY("user-a")) || "{}");
    expect(Object.keys(aSnoozed).length).toBeGreaterThan(0);
    expect(localStorage.getItem(SNOOZE_KEY("user-b"))).toBeNull();

    cleanup();

    // ---- Switch to user B ----
    await act(async () => {
      setSession("user-b");
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/نفد المخزون: منتج ناقص/)).toBeInTheDocument()
    );

    // عداد "غير مقروء" يجب أن يكون كاملاً (لا قراءة سابقة لـ B)
    const unreadHeader = screen.getByText(/غير مقروء:/);
    expect(unreadHeader.textContent).not.toContain("غير مقروء: 0");

    // B يقرأ كل شيء
    await act(async () => {
      fireEvent.click(screen.getByText("تحديد الظاهر كمقروء"));
    });
    const bRead = JSON.parse(localStorage.getItem(READ_KEY("user-b")) || "[]");
    expect(bRead.length).toBeGreaterThan(0);

    // مفاتيح A لم تتأثر
    expect(JSON.parse(localStorage.getItem(READ_KEY("user-a")) || "[]")).toEqual(aRead);
    expect(JSON.parse(localStorage.getItem(SNOOZE_KEY("user-a")) || "{}")).toEqual(aSnoozed);

    cleanup();

    // ---- Back to user A: تستعاد التفضيلات ----
    await act(async () => {
      setSession("user-a");
    });
    renderPage();

    await waitFor(() => screen.getByText(/كل الإشعارات/));
    // snooze A لا يزال نشطاً → بطاقة المخزون مخفية، يظهر زر "إظهار المُخفاة"
    expect(screen.getByText(/إظهار المُخفاة/)).toBeInTheDocument();
  });
});
