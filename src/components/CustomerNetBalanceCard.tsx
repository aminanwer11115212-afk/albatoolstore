import { AlertTriangle, CheckCircle2, Wallet, PlusCircle } from "lucide-react";
import { computeDisplayBalance, formatMoney, CustomerAccountSummary } from "@/utils/balanceDisplay";

/**
 * Unified "صافي الحساب" hero card — consistent across all screen sizes.
 * Colors/labels are 100% derived from `computeDisplayBalance`, so what the
 * user sees always matches what the DB stores.
 */
export default function CustomerNetBalanceCard({
  customer,
  onCharge,
}: {
  customer: { balance?: number | null; credit_balance?: number | null; net_balance?: number | null };
  onCharge?: () => void;
}) {
  const d = computeDisplayBalance(customer);
  const tone =
    d.direction === "debtor"
      ? { wrap: "bg-destructive/10 border-destructive/30", text: "text-destructive", icon: <AlertTriangle size={22} /> }
      : d.direction === "creditor"
        ? { wrap: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-600", icon: <CheckCircle2 size={22} /> }
        : { wrap: "bg-muted border-border", text: "text-foreground", icon: <Wallet size={22} /> };

  return (
    <div
      data-testid="net-balance-card"
      data-direction={d.direction}
      className={`rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${tone.wrap}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-background/60 ${tone.text}`}>
          {tone.icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">صافي الحساب</div>
          <div className={`text-2xl sm:text-3xl font-extrabold tabular-nums leading-tight ${tone.text} break-words`}>
            <span data-testid="net-balance-label">{d.label}</span>{" "}
            {d.amount > 0 && <span data-testid="net-balance-amount">{formatMoney(d.amount)}</span>}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {d.direction === "debtor"
              ? "لدى العميل فواتير غير مسدَّدة — أي رصيد يُشحن سيُخفّض هذا المبلغ أولاً"
              : d.direction === "creditor"
                ? "كل الفواتير مسدَّدة — هذا رصيد فائض للعميل لدينا"
                : "لا يوجد مديونية"}
          </div>
        </div>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[320px] lg:min-w-[380px] flex flex-col gap-3">
        <CustomerAccountSummary customer={customer} size="md" />
        {onCharge && (
          <button
            onClick={onCharge}
            className="w-full inline-flex items-center justify-center gap-1 bg-emerald-600 text-white text-sm px-3 py-2 rounded-lg hover:opacity-90"
          >
            <PlusCircle size={16} /> شحن رصيد
          </button>
        )}
      </div>
    </div>
  );
}
