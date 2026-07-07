import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTransporters, useDestinations } from "@/hooks/useData";

const transporterSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(120, "الاسم طويل جداً"),
  phone: z.string().trim().min(4, "الهاتف مطلوب").max(40, "الهاتف طويل جداً"),
  address: z.string().trim().min(1, "العنوان مطلوب").max(255, "العنوان طويل جداً"),
  destination_ids: z.array(z.string().uuid()).min(1, "اختر وجهة واحدة على الأقل"),
});

type FormState = {
  name: string;
  phone: string;
  address: string;
  notes: string;
  destination_ids: string[];
};

const emptyForm = (): FormState => ({
  name: "",
  phone: "",
  address: "",
  notes: "",
  destination_ids: [],
});

function useTransporterDestinations() {
  return useQuery({
    queryKey: ["destination_transporters", "by-transporter"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("destination_transporters")
        .select("transporter_id, destination_id, position, destinations(name)")
        .order("position", { ascending: true });
      if (error) throw error;
      const map: Record<string, { id: string; name: string }[]> = {};
      for (const row of (data as any[]) || []) {
        const tid = row.transporter_id as string;
        if (!map[tid]) map[tid] = [];
        map[tid].push({ id: row.destination_id, name: row.destinations?.name || "—" });
      }
      return map;
    },
  });
}

export default function TransportersPage() {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useTransporters();
  const { data: destinations } = useDestinations();
  const { data: destByTr } = useTransporterDestinations();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);

  const destList = useMemo(() => (destinations as any[]) || [], [destinations]);
  const trList = useMemo(() => (rows as any[]) || [], [rows]);

  const startAdd = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const startEdit = (row: any) => {
    const linked = (destByTr?.[row.id] || []).map((d) => d.id);
    setEditId(row.id);
    setForm({
      name: row.name || "",
      phone: row.phone || "",
      address: row.address || "",
      notes: row.notes || "",
      destination_ids: linked,
    });
    setShowForm(true);
  };

  const toggleDest = (id: string) => {
    setForm((prev) => {
      const has = prev.destination_ids.includes(id);
      return {
        ...prev,
        destination_ids: has
          ? prev.destination_ids.filter((x) => x !== id)
          : [...prev.destination_ids, id],
      };
    });
  };

  const save = async () => {
    const parsed = transporterSchema.safeParse({
      name: form.name,
      phone: form.phone,
      address: form.address,
      destination_ids: form.destination_ids,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "بيانات غير صحيحة");
      return;
    }
    setBusy(true);
    try {
      let trId = editId;
      if (editId) {
        const { error } = await (supabase as any)
          .from("transporters")
          .update({
            name: parsed.data.name,
            phone: parsed.data.phone,
            address: parsed.data.address,
            notes: form.notes.trim() || null,
          })
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("transporters")
          .insert({
            name: parsed.data.name,
            phone: parsed.data.phone,
            address: parsed.data.address,
            notes: form.notes.trim() || null,
          })
          .select()
          .single();
        if (error) throw error;
        trId = data.id;
      }

      if (trId) {
        // Sync destination links: delete existing then insert with position
        const { error: delErr } = await (supabase as any)
          .from("destination_transporters")
          .delete()
          .eq("transporter_id", trId);
        if (delErr) throw delErr;

        if (parsed.data.destination_ids.length > 0) {
          const links = parsed.data.destination_ids.map((destination_id, idx) => ({
            transporter_id: trId,
            destination_id,
            position: idx,
          }));
          const { error: insErr } = await (supabase as any)
            .from("destination_transporters")
            .insert(links);
          if (insErr) throw insErr;
        }
      }

      toast.success(editId ? "تم تحديث الناقل" : "تمت إضافة الناقل");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transporters"] }),
        qc.invalidateQueries({ queryKey: ["destination_transporters"] }),
      ]);
      try { window.dispatchEvent(new Event("customer-logistics:changed")); } catch {}
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm());
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("حذف الناقل نهائياً؟")) return;
    try {
      // Delete links first (FK), then transporter
      await (supabase as any).from("destination_transporters").delete().eq("transporter_id", id);
      const { error } = await (supabase as any).from("transporters").delete().eq("id", id);
      if (error) throw error;
      toast.success("تم الحذف");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transporters"] }),
        qc.invalidateQueries({ queryKey: ["destination_transporters"] }),
      ]);
      try { window.dispatchEvent(new Event("customer-logistics:changed")); } catch {}
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحذف");
    }
  };

  // Auto-open form when navigated to /transporters/add
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.endsWith("/add")) {
      startAdd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <article className="content" dir="rtl">
      <div className="legacy-card card-block">
        <h5>الناقلين</h5>
        <hr />
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={startAdd} className="legacy-btn legacy-btn-success">
            + إضافة ناقل
          </button>
        </div>

        {showForm && (
          <div
            className="legacy-form-horizontal"
            style={{
              marginBottom: "1rem",
              paddingBottom: "1rem",
              borderBottom: "1px solid hsl(var(--border))",
            }}
          >
            <div className="legacy-form-row">
              <label className="legacy-form-label">الاسم *</label>
              <div className="legacy-form-control-wrap">
                <input
                  className="legacy-control"
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label">الهاتف *</label>
              <div className="legacy-form-control-wrap">
                <input
                  className="legacy-control"
                  value={form.phone}
                  maxLength={40}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label">العنوان *</label>
              <div className="legacy-form-control-wrap">
                <input
                  className="legacy-control"
                  value={form.address}
                  maxLength={255}
                  placeholder="يظهر في تقرير الترحيلات"
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label">الوجهات *</label>
              <div className="legacy-form-control-wrap">
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: "auto",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    padding: 8,
                    background: "hsl(var(--muted) / 0.3)",
                  }}
                >
                  {destList.length === 0 ? (
                    <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                      لا توجد وجهات — أضف وجهات أولاً.
                    </div>
                  ) : (
                    destList.map((d: any) => (
                      <label
                        key={d.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 0",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.destination_ids.includes(d.id)}
                          onChange={() => toggleDest(d.id)}
                        />
                        <span>{d.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {form.destination_ids.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                    الترتيب المحفوظ:{" "}
                    {form.destination_ids
                      .map((id) => destList.find((x: any) => x.id === id)?.name)
                      .filter(Boolean)
                      .join(" ← ")}
                  </div>
                )}
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label">ملاحظات</label>
              <div className="legacy-form-control-wrap">
                <input
                  className="legacy-control"
                  value={form.notes}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label"></label>
              <div className="legacy-form-control-wrap">
                <button onClick={save} disabled={busy} className="legacy-btn legacy-btn-success">
                  {busy ? "جارٍ الحفظ…" : editId ? "تحديث" : "حفظ"}
                </button>{" "}
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditId(null);
                    setForm(emptyForm());
                  }}
                  disabled={busy}
                  className="legacy-btn legacy-btn-default"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        <table className="legacy-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>العنوان</th>
              <th>الوجهات المخدومة</th>
              <th>ملاحظات</th>
              <th>إعدادات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center" }}>
                  جاري التحميل...
                </td>
              </tr>
            ) : trList.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center" }}>
                  لا توجد بيانات
                </td>
              </tr>
            ) : (
              trList.map((row: any, i: number) => {
                const linked = destByTr?.[row.id] || [];
                return (
                  <tr key={row.id} className={i % 2 === 0 ? "odd" : "even"}>
                    <td>{i + 1}</td>
                    <td>{row.name || "-"}</td>
                    <td>{row.phone || "-"}</td>
                    <td>{row.address || "-"}</td>
                    <td>
                      {linked.length === 0 ? (
                        <span style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
                      ) : (
                        linked.map((d) => d.name).join(" ← ")
                      )}
                    </td>
                    <td>{row.notes || "-"}</td>
                    <td>
                      <span className="legacy-actions">
                        <button
                          onClick={() => startEdit(row)}
                          className="btn-xs btn-warning"
                        >
                          تعديل
                        </button>{" "}
                        <button
                          onClick={() => remove(row.id)}
                          className="btn-xs btn-danger"
                        >
                          حذف
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
