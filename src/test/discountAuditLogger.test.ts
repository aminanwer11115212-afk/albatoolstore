import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDiscountAuditPayload, logDiscountEvent } from "@/utils/discountAuditLogger";

vi.mock("@/integrations/supabase/client", () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ insert });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } });
  return { supabase: { from, auth: { getUser }, __mocks: { insert, from } } };
});

import { supabase } from "@/integrations/supabase/client";

describe("buildDiscountAuditPayload", () => {
  it("normalizes numbers and passes through metadata", () => {
    const p = buildDiscountAuditPayload({
      entity_type: "invoice",
      entity_id: "inv-1",
      entity_number: "INV-100",
      customer_id: "cust-1",
      discount_before: 0,
      discount_added: 250.123456789,
      discount_after: 250.123456789,
      total_before: 1000,
      total_after: 749.876543211,
      balance_before: 400,
      balance_after: 150,
      source: "customer_payment_dialog",
      note: "خصم يدوي",
    });
    expect(p.entity_type).toBe("invoice");
    expect(p.customer_id).toBe("cust-1");
    expect(p.discount_added).toBeCloseTo(250.1235, 3);
    expect(p.total_after).toBeCloseTo(749.8765, 3);
    expect(p.balance_before).toBe(400);
    expect(p.balance_after).toBe(150);
  });
});

describe("logDiscountEvent", () => {
  beforeEach(() => {
    (supabase as any).__mocks.insert.mockClear();
    (supabase as any).__mocks.from.mockClear();
  });

  it("skips insert when discount_added is zero", async () => {
    await logDiscountEvent({
      entity_type: "invoice",
      discount_before: 0,
      discount_added: 0,
      discount_after: 0,
      total_before: 100,
      total_after: 100,
      source: "customer_payment_dialog",
    });
    expect((supabase as any).__mocks.from).not.toHaveBeenCalled();
  });

  it("inserts into discount_audit_log with created_by from auth", async () => {
    await logDiscountEvent({
      entity_type: "invoice",
      entity_id: "inv-42",
      entity_number: "F-42",
      customer_id: "cust-9",
      discount_before: 0,
      discount_added: 100,
      discount_after: 100,
      total_before: 1000,
      total_after: 900,
      balance_before: 1000,
      balance_after: 900,
      source: "customer_payment_dialog",
    });
    expect((supabase as any).__mocks.from).toHaveBeenCalledWith("discount_audit_log");
    const arg = (supabase as any).__mocks.insert.mock.calls[0][0];
    expect(arg.entity_number).toBe("F-42");
    expect(arg.discount_added).toBe(100);
    expect(arg.created_by).toBe("user-1");
  });
});
