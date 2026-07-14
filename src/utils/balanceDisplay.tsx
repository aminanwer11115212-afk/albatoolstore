/**
 * Centralized balance/debt display helpers.
 *
 * Convention (matches the database schema):
 *   balance > 0  →  العميل مدين لنا  ("عليه")  — نريد منه مال  → أحمر
 *   balance < 0  →  نحن مدينون له   ("له")     — يريد مننا مال → أخضر
 *   balance = 0  →  لا يوجد مديونية
 *
 * This is the ONLY place that decides colors and labels for balances.
 * Import `BalanceChip` or `balanceLabel` wherever you need to show balance.
 */
import React from "react";

/**
 * Single source of truth for a customer's net balance.
 *
 *   net > 0  →  العميل مدين لنا  ("عليه")
 *   net < 0  →  نحن مدينون له   ("له")
 *   net = 0  →  مسوّى
 *
 * Prefers the DB-computed `net_balance` column (generated column).
 * Falls back to `balance - credit_balance` for older cached rows.
 */
export function netBalanceOf(
  customer:
    | { net_balance?: number | null; balance?: number | null; credit_balance?: number | null }
    | null
    | undefined,
): number {
  if (!customer) return 0;
  const nb = (customer as any).net_balance;
  if (nb !== null && nb !== undefined && !Number.isNaN(Number(nb))) return Number(nb);
  return Number(customer.balance || 0) - Number(customer.credit_balance || 0);
}

/**
 * Unified display decision for the customer's net balance.
 *
 * Rules (must match InvoiceCreatePage, CustomerDetailView, statement pages):
 *   - "عليه" appears ONLY when there's a positive net dues after subtracting credit_balance
 *   - "له" appears ONLY when ALL invoices are paid and there's a surplus credit
 *   - "مسوّى" when |net| < 0.01
 *
 * Any client-facing balance surface MUST route through this helper so the DB
 * math (`recompute_customer_balance` -> `net_balance = balance - credit_balance`)
 * and the UI never drift, regardless of decimal precision of totals/discounts.
 */
export type BalanceDirection = "debtor" | "creditor" | "settled";
export function computeDisplayBalance(
  customer: { balance?: number | null; credit_balance?: number | null; net_balance?: number | null } | null | undefined,
): { direction: BalanceDirection; label: "عليه" | "له" | "مسوّى"; amount: number; net: number } {
  const net = netBalanceOf(customer);
  if (Math.abs(net) < 0.01) return { direction: "settled", label: "مسوّى", amount: 0, net: 0 };
  if (net > 0) return { direction: "debtor", label: "عليه", amount: Math.abs(net), net };
  return { direction: "creditor", label: "له", amount: Math.abs(net), net };
}

/**
 * Formats a monetary amount consistently across DB-derived and UI-derived values.
 * Rounds to 2 decimals to eliminate float precision drift (e.g. 0.1+0.2=0.3),
 * then locale-formats without trailing zeros for whole numbers.
 */
export function formatMoney(n: number | null | undefined): string {
  let v = Math.round(Number(n || 0) * 100) / 100;
  if (Object.is(v, -0) || v === 0) v = 0; // normalize -0 → 0
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Returns an Arabic label + color for a balance value. */
export function balanceLabel(balance: number): {
  label: string;      // e.g. "عليه" | "له" | ""
  amount: number;     // absolute value
  direction: "debtor" | "creditor" | "zero";
  color: string;      // CSS color string
  bgColor: string;    // CSS background color string
} {
  const amt = Math.abs(balance);
  if (balance > 0) {
    return {
      label: "عليه",
      amount: amt,
      direction: "debtor",
      color: "hsl(var(--destructive))",
      bgColor: "hsl(var(--destructive) / 0.10)",
    };
  }
  if (balance < 0) {
    return {
      label: "له",
      amount: amt,
      direction: "creditor",
      color: "hsl(142 70% 35%)",
      bgColor: "hsl(142 70% 35% / 0.10)",
    };
  }
  return { label: "", amount: 0, direction: "zero", color: "hsl(var(--muted-foreground))", bgColor: "transparent" };
}

/**
 * Tiny inline chip for header labels (customer name field label area).
 * Shows "عليه X,XXX" in red or "له X,XXX" in green.
 */
export function BalanceChip({
  balance,
  fontSize = 9,
}: {
  balance: number | null | undefined;
  fontSize?: number;
}) {
  const b = Number(balance || 0);
  if (b === 0) return null;
  const { label, amount, color, bgColor } = balanceLabel(b);
  return (
    <span
      style={{
        color,
        fontWeight: 700,
        background: bgColor,
        borderRadius: 3,
        padding: "0 4px",
        fontSize,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      {label} {amount.toLocaleString()}
    </span>
  );
}

/**
 * Shared 3-cell summary card: [مدين | دائن | صافي]
 *
 * Use this in CustomerDetailView / CustomersPage / statement pages so every
 * surface shows the SAME numbers (raw balance, raw credit, and the unified net).
 * Never render bespoke balance chips — always route through this component to
 * avoid the "different pages, different numbers" regression class.
 */
export function CustomerAccountSummary({
  customer,
  size = "md",
  showNetLabel = true,
}: {
  customer:
    | { balance?: number | null; credit_balance?: number | null; net_balance?: number | null }
    | null
    | undefined;
  size?: "sm" | "md";
  showNetLabel?: boolean;
}) {
  const debt = Number(customer?.balance || 0);
  const credit = Number(customer?.credit_balance || 0);
  const net = netBalanceOf(customer);
  const pad = size === "sm" ? "px-2 py-1" : "px-3 py-2";
  const num = size === "sm" ? "text-sm" : "text-base";
  const lbl = size === "sm" ? "text-[10px]" : "text-[11px]";
  return (
    <div className="grid grid-cols-3 gap-2 w-full" dir="rtl" data-testid="customer-account-summary">
      <div className={`bg-destructive/10 rounded-lg text-center ${pad}`}>
        <div className={`text-muted-foreground ${lbl}`}>المديونية</div>
        <div className={`font-bold tabular-nums text-destructive ${num}`} data-testid="cas-debt">
          {debt.toLocaleString()}
        </div>
      </div>
      <div className={`bg-emerald-500/10 rounded-lg text-center ${pad}`}>
        <div className={`text-muted-foreground ${lbl}`}>الرصيد الدائن</div>
        <div className={`font-bold tabular-nums text-emerald-600 ${num}`} data-testid="cas-credit">
          {credit.toLocaleString()}
        </div>
      </div>
      <div
        className={`rounded-lg text-center ${pad} ${
          net > 0 ? "bg-destructive/15" : net < 0 ? "bg-emerald-500/15" : "bg-muted"
        }`}
      >
        <div className={`text-muted-foreground ${lbl}`}>الصافي</div>
        <div
          className={`font-bold tabular-nums ${num} ${
            net > 0 ? "text-destructive" : net < 0 ? "text-emerald-600" : "text-foreground"
          }`}
          data-testid="cas-net"
        >
          {Math.abs(net).toLocaleString()}
          {showNetLabel && (
            <span className="text-[9px] font-normal mr-1">
              {net > 0 ? "عليه" : net < 0 ? "له" : "مسوّى"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Customer info strip for header labels.
 * Shows: 📞 phone  |  [عليه X,XXX] or [له X,XXX]
 */
export function CustomerInfoStrip({
  phone,
  balance,
  fontSize = 9,
}: {
  phone?: string | null;
  balance?: number | null;
  fontSize?: number;
}) {
  const hasPhone = phone && phone.trim();
  const b = Number(balance || 0);
  if (!hasPhone && b === 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexWrap: "wrap",
        lineHeight: 1.2,
      }}
    >
      {hasPhone && (
        <span style={{ color: "hsl(var(--foreground) / 0.6)", fontWeight: 500, fontSize }}>
          📞 {phone}
        </span>
      )}
      <BalanceChip balance={b} fontSize={fontSize} />
    </span>
  );
}
