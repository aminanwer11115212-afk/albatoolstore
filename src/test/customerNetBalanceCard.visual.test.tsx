import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CustomerNetBalanceCard from "@/components/CustomerNetBalanceCard";

/**
 * Visual-regression style structural checks for CustomerNetBalanceCard.
 *
 * Real pixel diffing requires a browser harness we don't run in unit tests,
 * so we assert the class fingerprint (colors + responsive layout) matches
 * the "single source of truth" contract. If somebody swaps a color utility
 * or breaks the responsive stack, these tests fail loudly.
 */
function renderCard(customer: Parameters<typeof CustomerNetBalanceCard>[0]["customer"]) {
  return render(<CustomerNetBalanceCard customer={customer} />);
}

describe("CustomerNetBalanceCard — color + layout fingerprint", () => {
  it("debtor: red destructive tone + 'عليه' label", () => {
    renderCard({ balance: 500, credit_balance: 0 });
    const card = screen.getByTestId("net-balance-card");
    expect(card.getAttribute("data-direction")).toBe("debtor");
    expect(card.className).toMatch(/bg-destructive\/10/);
    expect(card.className).toMatch(/border-destructive\/30/);
    expect(screen.getByTestId("net-balance-label").textContent).toBe("عليه");
  });

  it("creditor: emerald tone + 'له' label", () => {
    renderCard({ balance: 0, credit_balance: 200 });
    const card = screen.getByTestId("net-balance-card");
    expect(card.getAttribute("data-direction")).toBe("creditor");
    expect(card.className).toMatch(/bg-emerald-500\/10/);
    expect(card.className).toMatch(/border-emerald-500\/30/);
    expect(screen.getByTestId("net-balance-label").textContent).toBe("له");
  });

  it("settled: neutral muted tone + 'خالص' label + no amount rendered", () => {
    renderCard({ balance: 100, credit_balance: 100 });
    const card = screen.getByTestId("net-balance-card");
    expect(card.getAttribute("data-direction")).toBe("settled");
    expect(card.className).toMatch(/bg-muted/);
    expect(card.className).toMatch(/border-border/);
    expect(screen.getByTestId("net-balance-label").textContent).toBe("خالص");
    // Settled hides the amount span
    expect(screen.queryByTestId("net-balance-amount")).toBeNull();
  });

  it("responsive layout: mobile-first flex-col upgrades to sm:flex-row", () => {
    renderCard({ balance: 500 });
    const card = screen.getByTestId("net-balance-card");
    // stacks on mobile
    expect(card.className).toMatch(/flex-col/);
    // side-by-side on ≥ sm
    expect(card.className).toMatch(/sm:flex-row/);
    // padding scales up on ≥ sm
    expect(card.className).toMatch(/p-4/);
    expect(card.className).toMatch(/sm:p-5/);
  });

  it("summary sub-card numbers match the hero amount (single-source-of-truth)", () => {
    renderCard({ balance: 750, credit_balance: 250 });
    // net = 500 debtor
    expect(screen.getByTestId("net-balance-amount").textContent).toContain("500");
    expect(screen.getByTestId("cas-net").textContent).toContain("500");
    expect(screen.getByTestId("cas-debt").textContent).toContain("750");
    expect(screen.getByTestId("cas-credit").textContent).toContain("250");
  });

  it("amount font sizing scales from text-2xl (mobile) to sm:text-3xl (desktop)", () => {
    renderCard({ balance: 500 });
    const amount = screen.getByTestId("net-balance-amount").parentElement!;
    expect(amount.className).toMatch(/text-2xl/);
    expect(amount.className).toMatch(/sm:text-3xl/);
    expect(amount.className).toMatch(/font-extrabold/);
    expect(amount.className).toMatch(/tabular-nums/);
  });
});
