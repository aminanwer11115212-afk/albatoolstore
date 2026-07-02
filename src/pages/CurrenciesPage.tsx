import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import HomeButton from "@/components/HomeButton";

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [openCur, setOpenCur] = useState(false);
  const [openRate, setOpenRate] = useState(false);
  const [newCur, setNewCur] = useState({ code: "", name: "", symbol: "", decimal_places: 2 });
  const [newRate, setNewRate] = useState({ currency_code: "", rate_to_base: "", effective_date: new Date().toISOString().split("T")[0], notes: "" });

  const load = async () => {
    setLoading(true);
    const [c, r] = await Promise.all([
      (supabase as any).from("currencies").select("*").order("is_base", { ascending: false }),
      (supabase as any).from("exchange_rates").select("*").order("effective_date", { ascending: false }).limit(200),
    ]);
    setCurrencies(c.data || []); setRates(r.data || []); setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addCurrency = async () => {
    if (!newCur.code || !newCur.name) return toast.error("الرمز والاسم مطلوبان");
    const { error } = await (supabase as any).from("currencies").insert(newCur);
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة"); setOpenCur(false); setNewCur({ code: "", name: "", symbol: "", decimal_places: 2 }); load();
  };

  const setBase = async (id: string) => {
    if (!confirm("تعيين كأساسية؟")) return;
    await (supabase as any).from("currencies").update({ is_base: false }).neq("id", id);
    const { error } = await (supabase as any).from("currencies").update({ is_base: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم التحديث"); load();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await (supabase as any).from("currencies").update({ is_active: !active }).eq("id", id); load();
  };

  const addRate = async () => {
    if (!newRate.currency_code || !newRate.rate_to_base) return toast.error("الحقول مطلوبة");
    const { error } = await (supabase as any).from("exchange_rates").insert({ ...newRate, rate_to_base: Number(newRate.rate_to_base) });
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ"); setOpenRate(false); setNewRate({ currency_code: "", rate_to_base: "", effective_date: new Date().toISOString().split("T")[0], notes: "" }); load();
  };

  const deleteRate = async (id: string) => {
    if (!confirm("حذف؟")) return;
    await (supabase as any).from("exchange_rates").delete().eq("id", id); load();
  };

  const baseCur = currencies.find((c) => c.is_base);

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <HomeButton />
        <h5>العملات المعتمدة {baseCur && `— الأساسية: ${baseCur.code}`}</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <Dialog open={openCur} onOpenChange={setOpenCur}>
            <DialogTrigger asChild><button className="legacy-btn legacy-btn-success">+ عملة جديدة</button></DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>إضافة عملة</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><label className="text-xs">الرمز (USD)</label><Input value={newCur.code} onChange={(e) => setNewCur({ ...newCur, code: e.target.value.toUpperCase() })} maxLength={5} /></div>
                <div><label className="text-xs">الاسم</label><Input value={newCur.name} onChange={(e) => setNewCur({ ...newCur, name: e.target.value })} /></div>
                <div><label className="text-xs">الرمز ($)</label><Input value={newCur.symbol} onChange={(e) => setNewCur({ ...newCur, symbol: e.target.value })} /></div>
                <div><label className="text-xs">المنازل العشرية</label><Input type="number" value={newCur.decimal_places} onChange={(e) => setNewCur({ ...newCur, decimal_places: Number(e.target.value) })} /></div>
                <Button onClick={addCurrency} className="w-full">حفظ</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <table className="legacy-table">
          <thead><tr><th>الرمز</th><th>الاسم</th><th>الرمز المختصر</th><th>أساسية</th><th>نشطة</th></tr></thead>
          <tbody>
            {currencies.map((c, i) => (
              <tr key={c.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.code}</td>
                <td>{c.name}</td>
                <td>{c.symbol || "—"}</td>
                <td>{c.is_base ? <Badge>أساسية</Badge> : <button onClick={() => setBase(c.id)} className="btn-xs btn-info">تعيين</button>}</td>
                <td><Switch checked={c.is_active} onCheckedChange={() => toggleActive(c.id, c.is_active)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="legacy-card card-block" style={{ marginTop: "1rem" }}>
        <h5>سجل أسعار الصرف</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <Dialog open={openRate} onOpenChange={setOpenRate}>
            <DialogTrigger asChild><button className="legacy-btn legacy-btn-success">+ تسجيل سعر</button></DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>تسجيل سعر صرف</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><label className="text-xs">العملة</label><select className="w-full border rounded p-2 bg-background" value={newRate.currency_code} onChange={(e) => setNewRate({ ...newRate, currency_code: e.target.value })}><option value="">اختر</option>{currencies.filter((c) => !c.is_base).map((c) => <option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}</select></div>
                <div><label className="text-xs">السعر مقابل {baseCur?.code || "الأساسية"}</label><Input type="number" step="0.0001" value={newRate.rate_to_base} onChange={(e) => setNewRate({ ...newRate, rate_to_base: e.target.value })} /></div>
                <div><label className="text-xs">تاريخ السريان</label><Input type="date" value={newRate.effective_date} onChange={(e) => setNewRate({ ...newRate, effective_date: e.target.value })} /></div>
                <div><label className="text-xs">ملاحظات</label><Input value={newRate.notes} onChange={(e) => setNewRate({ ...newRate, notes: e.target.value })} /></div>
                <Button onClick={addRate} className="w-full">حفظ</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <table className="legacy-table">
          <thead><tr><th>العملة</th><th>السعر مقابل {baseCur?.code || "الأساسية"}</th><th>تاريخ السريان</th><th>ملاحظات</th><th>إعدادات</th></tr></thead>
          <tbody>
            {rates.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center" }}>لا توجد أسعار</td></tr>
            : rates.map((r, i) => (
              <tr key={r.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td style={{ fontFamily: "monospace" }}>{r.currency_code}</td>
                <td><b>{Number(r.rate_to_base).toLocaleString(undefined, { maximumFractionDigits: 4 })}</b></td>
                <td>{r.effective_date}</td>
                <td style={{ fontSize: 11 }}>{r.notes || "—"}</td>
                <td><button onClick={() => deleteRate(r.id)} className="btn-xs btn-danger">حذف</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
