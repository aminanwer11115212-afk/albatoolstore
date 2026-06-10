/**
 * CustomerLogisticsTable — جدول لوجستيات العملاء داخل صفحة إدارة العملاء.
 * صف لكل عميل مع: ناقلين العميل (إضافة/حذف) + وجهات العميل (إضافة/حذف + تحديد الافتراضي).
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTransporters, useDestinations,
  useCustomerTransporters, useCustomerDestinations,
} from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Star, Search, Truck, MapPin } from "lucide-react";
import { startsWithMatch } from "@/utils/searchMatch";

type Props = {
  customers: any[];
};

export default function CustomerLogisticsTable({ customers }: Props) {
  const qc = useQueryClient();
  const { data: transporters } = useTransporters();
  const { data: destinations } = useDestinations();
  const { data: custTrans } = useCustomerTransporters();
  const { data: custDests } = useCustomerDestinations();

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [addTransFor, setAddTransFor] = useState<Record<string, string>>({});
  const [addDestFor, setAddDestFor] = useState<Record<string, string>>({});

  const trList = (transporters as any[]) || [];
  const dsList = (destinations as any[]) || [];
  const ctList = (custTrans as any[]) || [];
  const cdList = (custDests as any[]) || [];

  const trById = useMemo(() => Object.fromEntries(trList.map((t) => [t.id, t])), [trList]);
  const dsById = useMemo(() => Object.fromEntries(dsList.map((d) => [d.id, d])), [dsList]);

  const filtered = useMemo(() => {
    if (!query.trim()) return customers;
    return customers.filter((c: any) =>
      startsWithMatch(c.name || "", query) || startsWithMatch(c.phone || "", query)
    );
  }, [customers, query]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["table", "customer_transporters"] });
    qc.invalidateQueries({ queryKey: ["table", "customer_destinations"] });
  };

  const addTransporter = async (customerId: string) => {
    const trId = addTransFor[customerId];
    if (!trId) return;
    setBusy(`t-${customerId}`);
    try {
      const { error } = await (supabase as any).from("customer_transporters").insert({
        customer_id: customerId, transporter_id: trId,
      });
      if (error) throw error;
      toast.success("تمت إضافة الناقل");
      setAddTransFor((p) => ({ ...p, [customerId]: "" }));
      invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const removeTransporter = async (linkId: string) => {
    setBusy(`rt-${linkId}`);
    try {
      const { error } = await (supabase as any).from("customer_transporters").delete().eq("id", linkId);
      if (error) throw error;
      toast.success("تم الحذف");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const addDestination = async (customerId: string) => {
    const dId = addDestFor[customerId];
    if (!dId) return;
    setBusy(`d-${customerId}`);
    try {
      const { error } = await (supabase as any).from("customer_destinations").insert({
        customer_id: customerId, destination_id: dId, is_default: false,
      });
      if (error) throw error;
      toast.success("تمت إضافة الوجهة");
      setAddDestFor((p) => ({ ...p, [customerId]: "" }));
      invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const removeDestination = async (linkId: string) => {
    setBusy(`rd-${linkId}`);
    try {
      const { error } = await (supabase as any).from("customer_destinations").delete().eq("id", linkId);
      if (error) throw error;
      toast.success("تم الحذف");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const toggleDefault = async (customerId: string, linkId: string, makeDefault: boolean) => {
    setBusy(`def-${linkId}`);
    try {
      if (makeDefault) {
        // إلغاء الافتراضي عن باقي وجهات نفس العميل
        const others = cdList.filter((x: any) => x.customer_id === customerId && x.is_default && x.id !== linkId);
        for (const o of others) {
          await (supabase as any).from("customer_destinations").update({ is_default: false }).eq("id", o.id);
        }
      }
      const { error } = await (supabase as any).from("customer_destinations").update({ is_default: makeDefault }).eq("id", linkId);
      if (error) throw error;
      toast.success(makeDefault ? "تم تعيين الوجهة الافتراضية" : "تم إلغاء الافتراضي");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div dir="rtl" className="clt-wrap">
      <style>{`
        .clt-wrap { display: flex; flex-direction: column; gap: 10px; height: 100%; }
        .clt-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: hsl(var(--muted) / 0.3); border: 1px solid hsl(var(--border)); border-radius: 8px; }
        .clt-search { position: relative; flex: 1; }
        .clt-search input {
          width: 100%; min-height: 40px; padding: 6px 32px 6px 10px; border-radius: 8px;
          background: hsl(var(--background)); color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border)); font-size: 13px; font-weight: 600;
        }
        .clt-search svg { position: absolute; top: 50%; right: 8px; transform: translateY(-50%); color: hsl(var(--muted-foreground)); }

        .clt-table-wrap { flex: 1; overflow: auto; border: 1px solid hsl(var(--border)); border-radius: 8px; background: hsl(var(--card)); }
        .clt-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .clt-table thead th {
          position: sticky; top: 0; z-index: 2;
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          font-weight: 800; font-size: 11px;
          padding: 8px 8px; text-align: right;
          border-bottom: 1px solid hsl(var(--border));
        }
        .clt-table tbody td { padding: 8px; border-bottom: 1px solid hsl(var(--border)); vertical-align: top; }
        .clt-name { font-weight: 800; color: hsl(var(--foreground)); }
        .clt-phone { font-size: 10.5px; color: hsl(var(--muted-foreground)); margin-top: 2px; font-variant-numeric: tabular-nums; }
        .clt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .clt-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 8px; border-radius: 999px;
          background: hsl(var(--primary) / 0.10);
          color: hsl(var(--primary));
          font-size: 10.5px; font-weight: 700;
          border: 1px solid hsl(var(--primary) / 0.25);
        }
        .clt-chip.def { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .clt-chip button { background: transparent; border: none; cursor: pointer; color: inherit; padding: 0; display: inline-flex; align-items: center; }
        .clt-chip button:hover { opacity: 0.8; }
        .clt-empty-cell { color: hsl(var(--muted-foreground)); font-size: 10.5px; font-style: italic; }

        .clt-addrow { display: flex; gap: 4px; margin-top: 6px; }
        .clt-addrow select {
          flex: 1; min-height: 32px; padding: 4px 6px; border-radius: 6px;
          background: hsl(var(--background)); color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border)); font-size: 11px; font-weight: 600;
        }
        .clt-addrow button {
          min-height: 32px; padding: 0 8px; border-radius: 6px; border: none;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          font-size: 11px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 3px;
        }
        .clt-addrow button:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 640px) {
          .clt-table thead { display: none; }
          .clt-table, .clt-table tbody, .clt-table tr, .clt-table td { display: block; width: 100%; }
          .clt-table tbody tr { padding: 8px; border-bottom: 4px solid hsl(var(--muted)); }
          .clt-table tbody td { border: none; padding: 4px 0; }
          .clt-table tbody td::before { content: attr(data-label); display: block; font-size: 10.5px; font-weight: 800; color: hsl(var(--muted-foreground)); margin-bottom: 4px; }
          .clt-addrow select { min-height: 40px; font-size: 16px; }
          .clt-addrow button { min-height: 40px; font-size: 12px; padding: 0 12px; }
        }
      `}</style>

      <div className="clt-toolbar">
        <div className="clt-search">
          <Search size={14} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العميل أو رقم الهاتف…"
          />
        </div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontWeight: 700 }}>
          {filtered.length} عميل
        </div>
      </div>

      <div className="clt-table-wrap">
        <table className="clt-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>العميل</th>
              <th style={{ width: "39%" }}><Truck size={12} style={{ display: "inline-block", marginLeft: 4 }} />الناقلون</th>
              <th style={{ width: "39%" }}><MapPin size={12} style={{ display: "inline-block", marginLeft: 4 }} />الوجهات (نجمة = افتراضي)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: "center", padding: 32, color: "hsl(var(--muted-foreground))" }}>لا توجد بيانات بعد</td></tr>
            ) : filtered.map((c: any) => {
              const myTrans = ctList.filter((x) => x.customer_id === c.id);
              const myDests = cdList.filter((x) => x.customer_id === c.id);
              const availableTrans = trList.filter((t: any) => !myTrans.some((m) => m.transporter_id === t.id));
              const availableDests = dsList.filter((d: any) => !myDests.some((m) => m.destination_id === d.id));
              return (
                <tr key={c.id}>
                  <td data-label="العميل">
                    <div className="clt-name">{c.name}</div>
                    {c.phone && <div className="clt-phone">{c.phone}</div>}
                  </td>

                  <td data-label="الناقلون">
                    {myTrans.length === 0 ? (
                      <div className="clt-empty-cell">لا يوجد ناقلون مرتبطون</div>
                    ) : (
                      <div className="clt-chips">
                        {myTrans.map((link: any) => (
                          <span key={link.id} className="clt-chip">
                            {trById[link.transporter_id]?.name || "—"}
                            <button
                              type="button"
                              title="حذف"
                              disabled={busy === `rt-${link.id}`}
                              onClick={() => removeTransporter(link.id)}
                            ><Trash2 size={11} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="clt-addrow">
                      <select
                        value={addTransFor[c.id] || ""}
                        onChange={(e) => setAddTransFor((p) => ({ ...p, [c.id]: e.target.value }))}
                      >
                        <option value="">— أضِف ناقلاً —</option>
                        {availableTrans.map((t: any) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!addTransFor[c.id] || busy === `t-${c.id}`}
                        onClick={() => addTransporter(c.id)}
                      ><Plus size={12} /> إضافة</button>
                    </div>
                  </td>

                  <td data-label="الوجهات">
                    {myDests.length === 0 ? (
                      <div className="clt-empty-cell">لا توجد وجهات مرتبطة</div>
                    ) : (
                      <div className="clt-chips">
                        {myDests.map((link: any) => (
                          <span key={link.id} className={`clt-chip ${link.is_default ? "def" : ""}`}>
                            <button
                              type="button"
                              title={link.is_default ? "إلغاء الافتراضي" : "تعيين كافتراضي"}
                              disabled={busy === `def-${link.id}`}
                              onClick={() => toggleDefault(c.id, link.id, !link.is_default)}
                            ><Star size={11} fill={link.is_default ? "currentColor" : "none"} /></button>
                            {dsById[link.destination_id]?.name || "—"}
                            <button
                              type="button"
                              title="حذف"
                              disabled={busy === `rd-${link.id}`}
                              onClick={() => removeDestination(link.id)}
                            ><Trash2 size={11} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="clt-addrow">
                      <select
                        value={addDestFor[c.id] || ""}
                        onChange={(e) => setAddDestFor((p) => ({ ...p, [c.id]: e.target.value }))}
                      >
                        <option value="">— أضِف وجهة —</option>
                        {availableDests.map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!addDestFor[c.id] || busy === `d-${c.id}`}
                        onClick={() => addDestination(c.id)}
                      ><Plus size={12} /> إضافة</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
