import { useState } from "react";
import { useAccounts, useTransactions } from "@/hooks/useData";
import { toast } from "sonner";

export default function TransferPage() {
  const { data: accounts } = useAccounts();
  const { insert } = useTransactions();
  const [form, setForm] = useState({ from_account: "", to_account: "", amount: "", description: "", date: new Date().toISOString().split("T")[0] });

  const submit = async () => {
    if (!form.from_account || !form.to_account || !form.amount) { toast.error("جميع الحقول مطلوبة"); return; }
    if (form.from_account === form.to_account) { toast.error("لا يمكن التحويل لنفس الحساب"); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error("الرجاء إدخال مبلغ صحيح"); return; }
    const fromAcc = (accounts as any[] | undefined)?.find((a: any) => a.id === form.from_account);
    const fromBalance = Number(fromAcc?.balance || 0);
    if (fromBalance < amount) {
      toast.error(`الرصيد غير كافٍ — المتاح: ${fromBalance.toLocaleString()}`);
      return;
    }
    try {
      await insert.mutateAsync({ type: "transfer", amount, description: form.description || "تحويل بين حسابات", account_id: form.from_account, to_account_id: form.to_account, date: form.date, debit: amount, credit: 0 });
      toast.success("تم التحويل بنجاح");
      setForm({ from_account: "", to_account: "", amount: "", description: "", date: new Date().toISOString().split("T")[0] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>تحويل بين الحسابات</h5>
        <hr />
        <div className="legacy-form-horizontal">
          <div className="legacy-form-row">
            <label className="legacy-form-label">من حساب</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={form.from_account} onChange={(e) => setForm({ ...form, from_account: e.target.value })}>
                <option value="">-- اختر --</option>
                {(accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name} ({Number(a.balance || 0).toLocaleString()})</option>)}
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">إلى حساب</label>
            <div className="legacy-form-control-wrap">
              <select className="legacy-control" value={form.to_account} onChange={(e) => setForm({ ...form, to_account: e.target.value })}>
                <option value="">-- اختر --</option>
                {(accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.name} ({Number(a.balance || 0).toLocaleString()})</option>)}
              </select>
            </div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">المبلغ</label>
            <div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">التاريخ</label>
            <div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label">ملاحظات</label>
            <div className="legacy-form-control-wrap"><input className="legacy-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="legacy-form-row">
            <label className="legacy-form-label"></label>
            <div className="legacy-form-control-wrap"><button onClick={submit} className="legacy-btn legacy-btn-success">حفظ التحويل</button></div>
          </div>
        </div>
      </div>
    </article>
  );
}
