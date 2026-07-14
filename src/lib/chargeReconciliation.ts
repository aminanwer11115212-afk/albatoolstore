/**
 * Pure reconciliation helper for the charge history tab.
 * Extracted so it can be exercised by integration tests without React.
 */

export interface ReconciliationInput {
  customer: { balance?: number | null; credit_balance?: number | null } | null;
  invoices: Array<{ total?: number | null; paid_amount?: number | null; status?: string | null; source?: string | null }>;
  groups: Array<{ surplus?: number; allocated?: number; date?: string; method?: string | null }>;
}

export interface ReconciliationResult {
  ok: boolean;
  expectedBalance: number;
  expectedCredit: number;
  actualBalance: number;
  actualCredit: number;
  balanceDelta: number;
  creditDelta: number;
  text: string;
}

const EPSILON = 0.02;

export function computeReconciliation(input: ReconciliationInput): ReconciliationResult {
  const { customer, invoices, groups } = input;
  const expectedBalance = (invoices || [])
    .filter((i) => i.status !== "cancelled" && i.source !== "pos")
    .reduce((s, i) => s + Math.max(Number(i.total || 0) - Number(i.paid_amount || 0), 0), 0);
  const expectedCredit = (groups || []).reduce((s, g) => s + Number(g.surplus || 0), 0);
  const actualBalance = Number(customer?.balance || 0);
  const actualCredit = Number(customer?.credit_balance || 0);
  const balanceDelta = Math.abs(actualBalance - expectedBalance);
  const creditDelta = Math.abs(actualCredit - expectedCredit);
  const ok = balanceDelta <= EPSILON && creditDelta <= EPSILON;
  const text = ok
    ? `الأرصدة متطابقة — المستحق ${expectedBalance.toFixed(2)} / الدائن ${expectedCredit.toFixed(2)}`
    : `تعارض في الأرصدة: رصيد=${actualBalance} (متوقع ${expectedBalance.toFixed(2)}) — دائن=${actualCredit} (متوقع ${expectedCredit.toFixed(2)})`;
  return { ok, expectedBalance, expectedCredit, actualBalance, actualCredit, balanceDelta, creditDelta, text };
}

export type SortKey = "date_desc" | "date_asc" | "method_asc" | "method_desc";

export function sortGroups<T extends { date?: string; method?: string | null; created_at?: string }>(
  groups: T[],
  sort: SortKey,
): T[] {
  const arr = [...groups];
  const cmp = (a: string, b: string) => a.localeCompare(b);
  switch (sort) {
    case "date_asc":
      arr.sort((a, b) => cmp((a.date || "") + (a.created_at || ""), (b.date || "") + (b.created_at || "")));
      break;
    case "method_asc":
      arr.sort((a, b) => cmp(a.method || "", b.method || ""));
      break;
    case "method_desc":
      arr.sort((a, b) => cmp(b.method || "", a.method || ""));
      break;
    case "date_desc":
    default:
      arr.sort((a, b) => cmp((b.date || "") + (b.created_at || ""), (a.date || "") + (a.created_at || "")));
  }
  return arr;
}
