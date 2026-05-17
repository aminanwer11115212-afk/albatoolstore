import { useState } from "react";
import { useAccounts } from "@/hooks/useData";
import { toast } from "sonner";

export default function BalanceSheetPage() {
  const { data: accounts, isLoading } = useAccounts();

  const totalBalance = (accounts || []).reduce((sum: number, a: any) => sum + Number(a.balance || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">كشف الموازنة</h1>
      <div className="legacy-card card-block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted">
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">#</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">اسم الحساب</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">رقم الحساب</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">النوع</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">الرصيد</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : (accounts || []).map((a: any, i: number) => (
                <tr key={a.id} className="border-b border-border hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground">{i+1}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{a.name}</td>
                  <td className="px-4 py-3 text-foreground">{a.account_number || "-"}</td>
                  <td className="px-4 py-3 text-foreground">{a.account_type === "bank" ? "بنكي" : a.account_type === "cash" ? "نقدي" : "إلكتروني"}</td>
                  <td className="px-4 py-3 font-bold text-foreground">{Number(a.balance || 0).toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-muted font-bold">
                <td colSpan={4} className="px-4 py-3 text-foreground">الإجمالي</td>
                <td className="px-4 py-3 text-primary">{totalBalance.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
