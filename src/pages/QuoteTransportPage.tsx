import { useState, useEffect } from "react";
import ZoomControls from "@/components/ZoomControls";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTransporters, useDestinations } from "@/hooks/useData";
import { toast } from "sonner";

export default function QuoteTransportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backToEdit = (location.state as any)?.from === "edit";
  const { data: transporters } = useTransporters();
  const { data: destinations } = useDestinations();

  const [quote, setQuote] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [transporterId, setTransporterId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [transportDate, setTransportDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: q } = await supabase.from("quotes").select("*, customers(id, name)").eq("id", id).single();
    setQuote(q);
    const { data: trs } = await supabase.from("quote_transports").select("*, transporters(name), destinations(name)").eq("quote_id", id).order("created_at", { ascending: false });
    setList(trs || []);
    if (q?.customer_id) {
      try {
        const { fetchCustomerTransportDefaults } = await import("@/utils/customerTransportDefaults");
        const defaults = await fetchCustomerTransportDefaults(q.customer_id);
        if (defaults.destinationId) setDestinationId(defaults.destinationId);
        if (defaults.transporterId) setTransporterId(defaults.transporterId);
      } catch (e) { console.warn("customer transport defaults failed", e); }
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!id) return;
    try {
      await supabase.from("quote_transports").insert({
        quote_id: id, customer_id: quote?.customer_id || null,
        transporter_id: transporterId || null, destination_id: destinationId || null,
        driver_name: driverName || null, vehicle_number: vehicleNumber || null,
        transport_date: transportDate, cost: parseFloat(cost) || 0, notes: notes || null,
      });
      toast.success("تمت الإضافة");
      setTransporterId(""); setDriverName(""); setVehicleNumber(""); setCost("0"); setNotes("");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (tId: string) => {
    if (!confirm("حذف؟")) return;
    await supabase.from("quote_transports").delete().eq("id", tId);
    toast.success("تم الحذف");
    load();
  };

  if (loading) return <article className="content"><div className="legacy-card card-block">جاري التحميل...</div></article>;

  return (
    <article className="content">
      <div className="legacy-card card-block">
        <h5>نقل عرض السعر #{quote?.quote_number} — {quote?.customers?.name || "—"}</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => navigate(backToEdit ? `/quotes/create?edit=${id}` : "/quotes")} className="legacy-btn legacy-btn-default">
            ← {backToEdit ? "العودة لعرض السعر" : "العودة لعروض الأسعار"}
          </button>
          <ZoomControls />
        </div>

        <div className="legacy-form-horizontal" style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid hsl(var(--border))" }}>
          <div className="legacy-form-row"><label className="legacy-form-label">الناقل</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={transporterId} onChange={(e) => setTransporterId(e.target.value)}><option value="">اختر...</option>{(transporters as any[] || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">الوجهة</label><div className="legacy-form-control-wrap"><select className="legacy-control" value={destinationId} onChange={(e) => setDestinationId(e.target.value)}><option value="">اختر...</option>{(destinations as any[] || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">التاريخ</label><div className="legacy-form-control-wrap"><input type="date" className="legacy-control" value={transportDate} onChange={(e) => setTransportDate(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">السائق</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">رقم المركبة</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">التكلفة</label><div className="legacy-form-control-wrap"><input type="number" className="legacy-control" value={cost} onChange={(e) => setCost(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label">ملاحظات</label><div className="legacy-form-control-wrap"><input className="legacy-control" value={notes} onChange={(e) => setNotes(e.target.value)} /></div></div>
          <div className="legacy-form-row"><label className="legacy-form-label"></label><div className="legacy-form-control-wrap"><button onClick={handleAdd} className="legacy-btn legacy-btn-success">+ إضافة</button></div></div>
        </div>

        <table className="legacy-table">
          <thead><tr><th>#</th><th>الناقل</th><th>الوجهة</th><th>السائق</th><th>المركبة</th><th>التاريخ</th><th>التكلفة</th><th>إعدادات</th></tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center" }}>لا توجد سجلات</td></tr>
            : list.map((t: any, i: number) => (
              <tr key={t.id} className={i % 2 === 0 ? "odd" : "even"}>
                <td>{i + 1}</td>
                <td>{t.transporters?.name || "—"}</td>
                <td>{t.destinations?.name || "—"}</td>
                <td>{t.driver_name || "—"}</td>
                <td>{t.vehicle_number || "—"}</td>
                <td>{t.transport_date}</td>
                <td>{Number(t.cost || 0).toLocaleString()}</td>
                <td><button onClick={() => handleDelete(t.id)} className="btn-xs btn-danger">حذف</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
