import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet } from "lucide-react";
import { useAccounts } from "@/hooks/useData";

export default function DashboardAccountBalances() {
  const { data: accounts } = useAccounts();
  const totalBalance = (accounts || []).reduce((sum: number, a: any) => sum + Number(a.balance || 0), 0);

  const typeLabel = (type: string) => {
    switch (type) {
      case "bank": return "بنكي";
      case "cash": return "نقدي";
      default: return type || "-";
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Wallet size={16} /> أرصدة الحسابات
          </CardTitle>
          <div className="text-sm font-bold text-primary">
            {totalBalance.toLocaleString()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50 text-right">
              <th className="p-2.5 text-xs font-medium text-muted-foreground">الحساب</th>
              <th className="p-2.5 text-xs font-medium text-muted-foreground">النوع</th>
              <th className="p-2.5 text-xs font-medium text-muted-foreground">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {(accounts || []).map((acc: any) => (
              <tr key={acc.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2.5">
                  <p className="font-medium text-foreground text-xs">{acc.name}</p>
                  {acc.account_number && (
                    <p className="text-[10px] text-muted-foreground font-mono">{acc.account_number}</p>
                  )}
                </td>
                <td className="p-2.5">
                  <Badge variant="outline" className="text-[10px]">{typeLabel(acc.account_type)}</Badge>
                </td>
                <td className={`p-2.5 font-bold text-xs ${Number(acc.balance || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {Number(acc.balance || 0).toLocaleString()}
                </td>
              </tr>
            ))}
            {(!accounts || accounts.length === 0) && (
              <tr><td colSpan={3} className="p-4 text-center text-xs text-muted-foreground">لا توجد حسابات</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
