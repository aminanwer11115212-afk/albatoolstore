/**
 * تصفيرُ كشف الحساب من الشاشة إلى الحصيلة — المسارُ كاملاً.
 *
 * ## العطل الذي يحرسه
 * هجرةُ `admin_reset_stock_and_ledgers` تُطبَّق يدوياً من SQL Editor، ولم
 * يكن في النظام ما يقول إن كانت وصلت: الشاشةُ تنادي الدالّة، تقرأ `error`
 * وحدَه، وترمي الحصيلةَ التي تحمل الجواب.
 *
 * والنجاحُ ليس دليلاً. النسخةُ القديمة تسقط بالحارس المؤجَّل **متى وُجدت
 * فاتورةٌ غير نقدية** — فقاعدةٌ خاليةٌ منها يمرّ فيها النداءُ القديم بسلام،
 * فيظنّ صاحبُه أن الهجرة طُبِّقت وهي لم تُطبَّق، ويبني على ذلك.
 *
 * فيقطع هذا الفحصُ المسار كما يقطعه المستخدم: الاختصار ← اختيار النطاق ←
 * عبارة المرور ← «تنفيذ الآن» ← ما يُعرض. مرّةً وقاعدتُها على النسخة
 * القديمة، ومرّةً على الجديدة.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const toasts: Array<{ kind: string; msg: string; desc?: string }> = [];
vi.mock("sonner", () => ({
  toast: {
    error: (m: any, o?: any) => { toasts.push({ kind: "error", msg: String(m), desc: o?.description && String(o.description) }); },
    success: (m: any, o?: any) => { toasts.push({ kind: "success", msg: String(m), desc: o?.description && String(o.description) }); },
    info: () => {}, message: () => {},
  },
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true, loading: false, role: "admin", permissions: {} }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.c" }, loading: false }),
}));

/** ما تُعيده الدالّةُ في القاعدة — يُبدَّل لكل حالة. */
let RPC_DATA: unknown = {};

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const res = { data: [], count: 0, error: null };
    const api: any = {
      select: () => { const p: any = Promise.resolve(res); p.limit = () => Promise.resolve(res); return p; },
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({ not: () => Promise.resolve({ error: null }), gte: () => Promise.resolve({ error: null }) }),
    };
    return api;
  };
  return {
    supabase: {
      from: () => builder(),
      rpc: (name: string) =>
        Promise.resolve({
          data: name === "admin_reset_stock_and_ledgers" ? RPC_DATA : { ok: true },
          error: null,
        }),
    },
  };
});

import HiddenDevResetDialog from "@/components/HiddenDevResetDialog";
import { LEDGER_RESET_MIGRATION } from "@/utils/ledgerResetResult";

/** حصيلةُ النسخة التي أدخلتها الهجرة. */
const CURRENT = {
  customer_txs_deleted: 41, invoices_marked_paid: 17,
  settlements_inserted: 17, customers_zeroed: 9,
};
/** وحصيلةُ ما قبلها — بلا قيد التسوية. */
const LEGACY = { customer_txs_deleted: 41, invoices_marked_paid: 17, customers_zeroed: 9 };

beforeEach(() => {
  toasts.length = 0;
  RPC_DATA = CURRENT;
  (globalThis as any).URL.createObjectURL = () => "blob:x";
  (globalThis as any).URL.revokeObjectURL = () => {};
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** يفتح النافذة، يختار «تصفير كشف حساب كل العملاء»، ويكتب عبارة المرور. */
async function armLedgerReset() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    React.createElement(QueryClientProvider, { client: qc },
      React.createElement(HiddenDevResetDialog)),
  );
  fireEvent.keyDown(window, { key: "9", code: "Digit9", ctrlKey: true, shiftKey: true });
  await screen.findByText(/أداة مطوّر مخفية/);

  fireEvent.click(screen.getByText(/تصفير كشف حساب كل العملاء/));
  // النسخةُ الاحتياطية بوّابةٌ تسبق التنفيذ — ولا شأنَ لها بما نقيس
  const backup = screen.getByText(/نسخة احتياطية/).closest("label,div") as HTMLElement | null;
  if (backup) fireEvent.click(backup.querySelector("button, input") ?? backup);

  const label = screen.getByText(/اكتب عبارة المرور/).textContent || "";
  const phrase = /([^\s]+-\d{4})/.exec(label)![1];
  fireEvent.change(screen.getByPlaceholderText(phrase), { target: { value: phrase } });
  fireEvent.click(screen.getByText("تنفيذ الآن"));
}

describe("تصفيرُ كشف الحساب — الشاشةُ تقرأ حصيلة الدالّة", () => {
  /**
   * العطل: نداءٌ ينجح على النسخة القديمة فيُحسب نجاحاً، ولا أحدَ يعلم أن
   * الهجرة لم تصل. فيلزم أن تُسمّى العلّةُ باسم الهجرة كي تُطبَّق.
   */
  it("النسخةُ القديمة ⇒ الخطوةُ تفشل والرسالةُ تُسمّي الهجرة", async () => {
    RPC_DATA = LEGACY;
    await armLedgerReset();

    await waitFor(() => expect(toasts.some((t) => t.kind === "error")).toBe(true), { timeout: 5000 });
    const said = toasts.map((t) => `${t.msg} ${t.desc ?? ""}`).join(" | ");
    expect(said, "لم تُذكر الهجرة باسمها").toContain(LEDGER_RESET_MIGRATION);
    expect(said).toContain("غير مطبَّقة");
  });

  /** والنسخةُ الجديدة تمضي، وتُعرض أرقامُها بدل كلمة «تمّت». */
  it("والنسخةُ الجديدة ⇒ تنجح وتُعرض أعدادُها", async () => {
    RPC_DATA = CURRENT;
    await armLedgerReset();

    await waitFor(() => expect(toasts.some((t) => t.kind === "success")).toBe(true), { timeout: 5000 });
    expect(toasts.some((t) => t.kind === "error"), "فشلٌ لا سبب له").toBe(false);

    // الملخّصُ يُعرض في اللوحة — الأرقامُ منه لا من التخمين
    const panel = await screen.findByText(/settlements_inserted/);
    expect(panel.textContent).toContain("17");
    expect(panel.textContent).toContain("reset_summary");
  });

  /**
   * وتصفيرُ المخزون وحدَه لا يمرّ بفرع كشوف الحسابات، فلا يُنتج المفتاح في
   * النسختين — فالحكمُ عليه يمنع عمليةً سليمة.
   */
  it("وتصفيرُ المخزون وحدَه لا يُحكم عليه بغياب المفتاح", async () => {
    RPC_DATA = { products_zeroed: 120 };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      React.createElement(QueryClientProvider, { client: qc },
        React.createElement(HiddenDevResetDialog)),
    );
    fireEvent.keyDown(window, { key: "9", code: "Digit9", ctrlKey: true, shiftKey: true });
    await screen.findByText(/أداة مطوّر مخفية/);
    fireEvent.click(screen.getByText(/تصفير كميات كل المنتجات/));
    const label = screen.getByText(/اكتب عبارة المرور/).textContent || "";
    const phrase = /([^\s]+-\d{4})/.exec(label)![1];
    fireEvent.change(screen.getByPlaceholderText(phrase), { target: { value: phrase } });
    fireEvent.click(screen.getByText("تنفيذ الآن"));

    await waitFor(() => expect(toasts.length).toBeGreaterThan(0), { timeout: 5000 });
    const said = toasts.map((t) => `${t.msg} ${t.desc ?? ""}`).join(" | ");
    expect(said, "حُكم على نطاقٍ لا يمسّ كشوف الحسابات").not.toContain(LEDGER_RESET_MIGRATION);
  });
});
