import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialogSize } from "@/hooks/useDialogSize";

type Account = {
  id: string;
  name: string;
  account_number: string | null;
  balance: number | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function AccountsOpeningBalanceDialog({ open, onOpenChange }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [income, setIncome] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const { dlgRef, dlgStyle } = useDialogSize("accounts_opening_dialog", open, { w: "min(900px, 96vw)", h: "85vh" });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("accounts")
        .select("id, name, account_number, balance")
        .order("created_at", { ascending: true });
      const list = (data || []) as Account[];
      setAccounts(list);
      const op: Record<string, string> = {};
      const inc: Record<string, string> = {};
      list.forEach(a => {
        op[a.id] = String(a.balance ?? 0);
        inc[a.id] = "0";
      });

      // اجلب دخل اليوم الفعلي لكل حساب من المعاملات (يشمل دفعات الفواتير)
      const today = new Date().toISOString().split("T")[0];
      const { data: txs } = await supabase
        .from("transactions")
        .select("account_id, amount, type, date")
        .eq("type", "income")
        .eq("date", today);
      (txs || []).forEach((t: any) => {
        if (!t.account_id) return;
        const cur = Number(inc[t.account_id] || 0);
        inc[t.account_id] = String(cur + Number(t.amount || 0));
      });

      setOpening(op);
      setIncome(inc);
    })();
  }, [open]);

  const netFor = (a: Account) => {
    const op = Number(opening[a.id] || 0);
    const inc = Number(income[a.id] || 0);
    return op + inc;
  };

  const save = async (a: Account) => {
    if (savingId) return; // منع النقر المتكرر
    setSavingId(a.id);
    try {
      const targetBalance = netFor(a);
      const currentBalance = Number(a.balance ?? 0);
      const diff = Number((targetBalance - currentBalance).toFixed(2));
      // الرصيد عمود محسوب بواسطة triggers من جدول المعاملات،
      // فبدل الكتابة المباشرة نُسجّل معاملة تسوية بقيمة الفرق ليُعاد حسابه تلقائياً.
      if (Math.abs(diff) >= 0.01) {
        const today = new Date().toISOString().split("T")[0];
        const isIncome = diff > 0;
        const { error } = await supabase.from("transactions").insert({
          type: isIncome ? "income" : "expense",
          amount: Math.abs(diff),
          date: today,
          description: `تسوية رصيد افتتاحي - ${a.name}`,
          category: "opening_balance_adjustment",
          account_id: a.id,
          method: "cash",
          debit: isIncome ? Math.abs(diff) : 0,
          credit: isIncome ? 0 : Math.abs(diff),
        } as any);
        if (error) { toast.error("فشل الحفظ: " + error.message); return; }
      }
      toast.success(`تم تحديث رصيد ${a.name}`);
      setAccounts(prev => prev.map(x => x.id === a.id ? { ...x, balance: targetBalance } : x));
      setOpening(prev => ({ ...prev, [a.id]: String(targetBalance) }));
      setIncome(prev => ({ ...prev, [a.id]: "0" }));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dlgRef} style={{ ...dlgStyle, overflowY: "auto" }} dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center text-base">تعديل المبالغ المبدئية للحسابات</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/60 text-foreground">
                <th className="px-3 py-2 text-right font-semibold border">رقم</th>
                <th className="px-3 py-2 text-right font-semibold border">اسم الحساب</th>
                <th className="px-3 py-2 text-right font-semibold border">الدخل اليوم</th>
                <th className="px-3 py-2 text-right font-semibold border">الرصيد الافتتاحي اليوم</th>
                <th className="px-3 py-2 text-right font-semibold border">الصافي</th>
                <th className="px-3 py-2 text-center font-semibold border">حفظ</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-6 border">لا توجد حسابات</td></tr>
              )}
              {accounts.map(a => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 border">{a.account_number || "—"}</td>
                  <td className="px-3 py-2 border">{a.name}</td>
                  <td className="px-2 py-2 border">
                    <Input
                      type="number"
                      className="h-8 text-left"
                      value={income[a.id] ?? "0"}
                      onChange={e => setIncome(prev => ({ ...prev, [a.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-2 py-2 border">
                    <Input
                      type="number"
                      className="h-8 text-left"
                      value={opening[a.id] ?? "0"}
                      onChange={e => setOpening(prev => ({ ...prev, [a.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2 border font-mono text-left">
                    {netFor(a).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-2 border text-center">
                    <Button size="sm" className="h-7 px-3" onClick={() => save(a)} disabled={savingId === a.id}>
                      {savingId === a.id ? "..." : "حفظ"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-start pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
