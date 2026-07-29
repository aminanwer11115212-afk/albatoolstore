import { useMemo } from "react";
import { buildSettlementLedger, type LedgerInvoice, type LedgerTransaction, type LedgerTone } from "@/lib/settlementLedger";

const toneClass: Record<LedgerTone, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-amber-700",
  info: "text-primary",
};

export default function SettlementLedgerTab({
  invoices,
  transactions,
  hidden,
}: {
  invoices: LedgerInvoice[];
  transactions: LedgerTransaction[];
  hidden?: boolean;
}) {
  const ledger = useMemo(
    () => buildSettlementLedger({ invoices: invoices || [], transactions: transactions || [] }),
    [invoices, transactions],
  );

  return (
    <div
      data-section="settlement-ledger"
      data-section-label="كشف تفصيلي تسويي"
      data-testid="settlement-ledger"
      className={`legacy-card card-block ${hidden ? "hidden" : ""}`}
    >
      <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2 justify-between">
        <h3 className="font-semibold text-foreground">كشف تفصيلي تسويي ({ledger.rows.length})</h3>
        <div className="text-xs text-muted-foreground">
          الرصيد النهائي:{" "}
          <b
            data-testid="ledger-final-balance"
            className={`tabular-nums ${ledger.finalBalance > 0.01 ? "text-destructive" : ledger.finalBalance < -0.01 ? "text-success" : "text-foreground"}`}
          >
            {ledger.finalBalance.toLocaleString()}
          </b>{" "}
          {ledger.finalBalance > 0.01 ? "(مطلوب من العميل)" : ledger.finalBalance < -0.01 ? "(رصيد دائن له)" : "(مُسوّى)"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm mobile-stack-table">
          <thead>
            <tr className="bg-muted/50 text-right">
              <th className="px-5 py-3 font-semibold text-muted-foreground">التاريخ</th>
              <th className="px-5 py-3 font-semibold text-muted-foreground">البيان</th>
              <th className="px-5 py-3 font-semibold text-muted-foreground">مدين</th>
              <th className="px-5 py-3 font-semibold text-muted-foreground">دائن</th>
              <th className="px-5 py-3 font-semibold text-muted-foreground">الرصيد التراكمي</th>
              <th className="px-5 py-3 font-semibold text-muted-foreground">ملاحظات التسوية</th>
            </tr>
          </thead>
          <tbody>
            {ledger.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  لا توجد حركات لعرضها
                </td>
              </tr>
            ) : (
              ledger.rows.map((r) => (
                <tr key={r.key} data-testid="ledger-row" className="border-t border-border hover:bg-muted/30">
                  <td data-label="التاريخ" className="px-5 py-3 text-foreground tabular-nums">{r.date || "—"}</td>
                  <td data-label="البيان" className="px-5 py-3 text-foreground">{r.label}</td>
                  <td data-label="مدين" className="px-5 py-3 tabular-nums text-destructive">
                    {r.debit > 0 ? r.debit.toLocaleString() : "—"}
                  </td>
                  <td data-label="دائن" className="px-5 py-3 tabular-nums text-success">
                    {r.credit > 0 ? r.credit.toLocaleString() : "—"}
                  </td>
                  <td data-label="الرصيد التراكمي" className="px-5 py-3 font-semibold tabular-nums text-foreground">
                    {r.balance.toLocaleString()}
                  </td>
                  <td data-label="ملاحظات التسوية" className={`px-5 py-3 text-xs ${toneClass[r.tone]}`}>{r.note}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
