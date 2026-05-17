import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Props {
  transactions: any[];
}

export default function DashboardRecentTransactions({ transactions }: Props) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold">المعاملات الأخيرة</CardTitle>
          <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => navigate("/transactions")}>
            عرض الكل
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs">تاريخ#</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs">الحساب</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs">مدين</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs">دائن</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs">طريقة</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">
                    لا توجد معاملات بعد
                  </td>
                </tr>
              ) : (
                transactions.map((tx: any) => {
                  const isExpense = tx.type === "expense";
                  const debit = isExpense ? Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";
                  const credit = !isExpense ? Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";
                  return (
                    <tr key={tx.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="px-3 py-2 text-xs">
                        <button onClick={() => navigate("/transactions")} className="text-primary hover:underline">{tx.date}</button>
                      </td>
                      <td className="px-3 py-2 text-foreground text-xs truncate max-w-[150px]">
                        {tx.description || tx.category || "-"}
                      </td>
                      <td className="px-3 py-2 text-foreground text-xs">{debit}</td>
                      <td className="px-3 py-2 text-foreground text-xs">{credit}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{tx.accounts?.name || ""}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
