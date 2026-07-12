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
