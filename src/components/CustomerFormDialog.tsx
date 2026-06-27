import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import InlineSearchSelect, { InlineSearchSelectHandle } from "@/components/InlineSearchSelect";
import { useDialogSize } from "@/hooks/useDialogSize";

const sanitizePhone = (val: string) => {
  if (!val) return "";
  const arabicMap: Record<string, string> = {
    '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
    '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'
  };
  let cleaned = val.replace(/[٠-٩۰-۹]/g, d => arabicMap[d] || d);
  cleaned = cleaned.replace(/[\s\-\(\)]/g, ''); // strip spaces, dashes, parens
  return cleaned;
};

type Focusable = { focus: () => void } | null;

export type CustomerFormValue = {
  id?: string | null;
  name: string;
  phone: string;
  whatsapp: string;
  city: string;
  region_id: string | null;
  state_id: string | null;
  locality_id: string | null;
  city_id: string | null;
  address: string;
  preferred_transporter_id: string | null;
  group_id: string | null;
  notes: string;
  destination_id?: string | null;
};

const empty: CustomerFormValue = {
  name: "", phone: "", whatsapp: "", city: "",
  region_id: null, state_id: null, locality_id: null, city_id: null,
  address: "", preferred_transporter_id: null, group_id: null, notes: "",
  destination_id: null,
};

interface Props {
  open: boolean;
  initial?: Partial<CustomerFormValue> | null;
  onClose: () => void;
  onSaved: (saved: any) => void;
}

export default function CustomerFormDialog({ open, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CustomerFormValue>(empty);
  const [saving, setSaving] = useState(false);
  const [regions, setRegions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [localities, setLocalities] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [transporters, setTransporters] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [destinations, setDestinations] = useState<any[]>([]);

  const queryClient = useQueryClient();
  const localCustomers = queryClient.getQueryData<any[]>(["customers"]) || [];

  const duplicateName = form.name.trim() 
    ? localCustomers.find(c => c.id !== form.id && c.name?.trim() === form.name.trim())
    : null;

  const duplicatePhone = form.phone.trim()
    ? localCustomers.find(c => c.id !== form.id && sanitizePhone(c.phone) === sanitizePhone(form.phone))
    : null;

  const refs = useRef<Focusable[]>([]);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const { dlgRef, dlgStyle } = useDialogSize("customer_form_dialog", open, { w: "min(780px, 96vw)", h: "auto" });
  const focusAt = (i: number) => {
    const el = refs.current[i];
    if (el && typeof el.focus === "function") el.focus();
    else saveBtnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const init: CustomerFormValue = { ...empty, ...(initial || {}) };
    setForm(init);
    (async () => {
      const [r, t, g, d] = await Promise.all([
        (supabase as any).from("regions").select("id,name,sort_order").order("sort_order"),
        supabase.from("transporters" as any).select("id,name").order("name"),
        supabase.from("customer_groups").select("id,name").order("name"),
        (supabase as any).from("destinations").select("id,name").order("name"),
      ]);
      setRegions(r.data || []);
      setTransporters((t.data as any[]) || []);
      setGroups(g.data || []);
      setDestinations((d.data as any[]) || []);

      // load default destination for existing customer
      if (init.id) {
        const { data: cd } = await (supabase as any)
          .from("customer_destinations")
          .select("destination_id,is_default")
          .eq("customer_id", init.id);
        if (cd && cd.length) {
          const def = cd.find((x: any) => x.is_default) || cd[0];
          setForm(f => ({ ...f, destination_id: def.destination_id }));
        }
      }
    })();
    setTimeout(() => refs.current[0]?.focus(), 50);
  }, [open, initial]);

  useEffect(() => {
    if (!form.region_id) { setStates([]); return; }
    (async () => {
      const { data } = await (supabase as any).from("states").select("id,name,region_id").eq("region_id", form.region_id).order("name");
      setStates(data || []);
    })();
  }, [form.region_id]);

  useEffect(() => {
    if (!form.state_id) { setCities([]); return; }
    (async () => {
      const { data } = await (supabase as any).from("cities").select("id,name,state_id").eq("state_id", form.state_id).order("name");
      setCities(data || []);
    })();
  }, [form.state_id]);

  useEffect(() => {
    if (!form.city_id) { setLocalities([]); return; }
    (async () => {
      const { data } = await (supabase as any).from("localities").select("id,name,city_id").eq("city_id", form.city_id).order("name");
      setLocalities(data || []);
    })();
  }, [form.city_id]);

  const addCity = async (name: string): Promise<string | null> => {
    if (!form.state_id) { toast.error("اختر الولاية أولاً"); return null; }
    const { data, error } = await (supabase as any).from("cities")
      .insert({ name: name.trim(), state_id: form.state_id }).select("id,name,state_id").single();
    if (error) { toast.error(error.message); return null; }
    setCities(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setForm(f => ({ ...f, city_id: data.id, locality_id: null }));
    toast.success(`تمت إضافة المدينة: ${data.name}`);
    return data.id;
  };

  const addLocality = async (name: string): Promise<string | null> => {
    if (!form.city_id) { toast.error("اختر المدينة أولاً"); return null; }
    const { data, error } = await (supabase as any).from("localities")
      .insert({ name: name.trim(), city_id: form.city_id }).select("id,name,city_id").single();
    if (error) { toast.error(error.message); return null; }
    setLocalities(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setForm(f => ({ ...f, locality_id: data.id }));
    toast.success(`تمت إضافة المحلية: ${data.name}`);
    return data.id;
  };

  const removeCity = async (cityId: string): Promise<boolean> => {
    const hasLoc = localities.some(l => l.city_id === cityId);
    if (hasLoc) { toast.error("لا يمكن حذف المدينة — تحتوي محليات"); return false; }
    const { error } = await (supabase as any).from("cities").delete().eq("id", cityId);
    if (error) { toast.error(error.message); return false; }
    setCities(prev => prev.filter(c => c.id !== cityId));
    if (form.city_id === cityId) setForm(f => ({ ...f, city_id: null, locality_id: null }));
    toast.success("تم حذف المدينة");
    return true;
  };

  const removeLocality = async (locId: string): Promise<boolean> => {
    const { error } = await (supabase as any).from("localities").delete().eq("id", locId);
    if (error) { toast.error(error.message); return false; }
    setLocalities(prev => prev.filter(l => l.id !== locId));
    if (form.locality_id === locId) setForm(f => ({ ...f, locality_id: null }));
    toast.success("تم حذف المحلية");
    return true;
  };

  const addTransporter = async (name: string): Promise<string | null> => {
    const { data, error } = await (supabase as any).from("transporters")
      .insert({ name: name.trim() }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setTransporters(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setForm(f => ({ ...f, preferred_transporter_id: data.id }));
    toast.success(`تمت إضافة الترحيل: ${data.name}`);
    return data.id;
  };

  const removeTransporter = async (id: string): Promise<boolean> => {
    const { error } = await (supabase as any).from("transporters").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    setTransporters(prev => prev.filter(t => t.id !== id));
    if (form.preferred_transporter_id === id) setForm(f => ({ ...f, preferred_transporter_id: null }));
    toast.success("تم حذف الترحيل");
    return true;
  };

  const addGroup = async (name: string): Promise<string | null> => {
    const { data, error } = await supabase.from("customer_groups")
      .insert({ name: name.trim() }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setGroups(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setForm(f => ({ ...f, group_id: data.id }));
    toast.success(`تمت إضافة المجموعة: ${data.name}`);
    return data.id;
  };

  const removeGroup = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from("customer_groups").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    setGroups(prev => prev.filter(g => g.id !== id));
    if (form.group_id === id) setForm(f => ({ ...f, group_id: null }));
    toast.success("تم حذف المجموعة");
    return true;
  };

  const addDestination = async (name: string): Promise<string | null> => {
    const { data, error } = await (supabase as any).from("destinations")
      .insert({ name: name.trim() }).select("id,name").single();
    if (error) { toast.error(error.message); return null; }
    setDestinations(prev => [...prev, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setForm(f => ({ ...f, destination_id: data.id }));
    toast.success(`تمت إضافة الوجهة: ${data.name}`);
    return data.id;
  };

  const removeDestination = async (id: string): Promise<boolean> => {
    const { error } = await (supabase as any).from("destinations").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    setDestinations(prev => prev.filter(d => d.id !== id));
    if (form.destination_id === id) setForm(f => ({ ...f, destination_id: null }));
    toast.success("تم حذف الوجهة");
    return true;
  };

  const handleEnter = (idx: number) => (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusAt(idx + 1);
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error("الاسم مطلوب"); refs.current[0]?.focus(); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        city: form.city.trim() || null,
        region_id: form.region_id,
        state_id: form.state_id,
        locality_id: form.locality_id,
        city_id: form.city_id,
        address: form.address.trim() || null,
        group_id: form.group_id,
        notes: form.notes.trim() || null,
      };
      let saved: any;
      if (form.id) {
        const { data, error } = await supabase.from("customers").update(payload).eq("id", form.id).select().single();
        if (error) throw error;
        saved = data;
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (u?.user?.id) payload.created_by_uid = u.user.id;
        const { data, error } = await supabase.from("customers").insert(payload).select().single();
        if (error) throw error;
        saved = data;
      }

      // ربط الترحيل المفضّل (جدول منفصل)
      if (form.preferred_transporter_id && saved?.id) {
        await supabase.from("customer_preferred_transporter" as any)
          .delete().eq("customer_id", saved.id);
        await supabase.from("customer_preferred_transporter" as any)
          .insert({ customer_id: saved.id, transporter_id: form.preferred_transporter_id });
      }

      // ربط الوجهة الافتراضية
      if (saved?.id) {
        if (form.destination_id) {
          // امسح كل الوجهات الحالية وضع المختارة كافتراضية
          await (supabase as any).from("customer_destinations")
            .delete().eq("customer_id", saved.id);
          await (supabase as any).from("customer_destinations")
            .insert({ customer_id: saved.id, destination_id: form.destination_id, is_default: true });
        }
      }

      toast.success(form.id ? "تم تحديث العميل" : "تم إضافة العميل");
      try { window.dispatchEvent(new Event("customers:changed")); } catch {}
      onSaved(saved);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";
  const lbl = "text-xs font-medium text-muted-foreground mb-1 block";

  let i = 0;
  const idx = () => i++;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent ref={dlgRef} style={{ ...dlgStyle, overflowY: "auto" }} dir="rtl">
        <DialogHeader>
          <DialogTitle>{form.id ? "تعديل عميل" : "عميل جديد"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
          {/* الصف 1: اسم العميل | الهاتف | هاتف الواتساب */}
          {(() => { const k = idx(); return (
            <div>
              <label className={lbl}>اسم العميل *</label>
              <input ref={el => refs.current[k] = el} value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onKeyDown={handleEnter(k)} className={inp} placeholder="أدخل اسم العميل" />
              {duplicateName && (
                <p className="text-[10px] text-yellow-500 mt-1">
                  ⚠️ يوجد عميل آخر بنفس الاسم
                </p>
              )}
            </div>
          ); })()}

          {(() => { const k = idx(); return (
            <div>
              <label className={lbl}>هاتف</label>
              <input ref={el => refs.current[k] = el} value={form.phone} dir="ltr"
                onChange={e => setForm({ ...form, phone: e.target.value })}
                onBlur={e => setForm({ ...form, phone: sanitizePhone(e.target.value) })}
                onKeyDown={handleEnter(k)} className={inp} placeholder="09xxxxxxxx" />
              {duplicatePhone && (
                <p className="text-[10px] text-yellow-500 mt-1">
                  ⚠️ الهاتف مسجل لـ: {duplicatePhone.name}
                </p>
              )}
            </div>
          ); })()}

          {(() => { const k = idx(); return (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className={lbl}>هاتف الواتساب</label>
                {form.phone && (
                  <button 
                    type="button" 
                    onClick={() => setForm({ ...form, whatsapp: form.phone })}
                    className="text-[10px] text-primary hover:underline"
                  >
                    مماثل للهاتف
                  </button>
                )}
              </div>
              <input ref={el => refs.current[k] = el} value={form.whatsapp} dir="ltr"
                onChange={e => setForm({ ...form, whatsapp: e.target.value })}
                onBlur={e => setForm({ ...form, whatsapp: sanitizePhone(e.target.value) })}
                onKeyDown={handleEnter(k)} className={inp}
                placeholder="رقم WhatsApp" />
            </div>
          ); })()}

          {/* الصف 2: الاتجاه | الولاية | المدينة */}
          {(() => { const k = idx(); return (
            <div>
              <label className={lbl}>الاتجاه</label>
              <div className={`${inp} !p-0`} style={{ minHeight: 38 }}>
                <InlineSearchSelect
                  ref={(h) => { refs.current[k] = h as Focusable; }}
                  value={form.region_id || ""}
                  options={regions.map(r => ({ value: r.id, label: r.name }))}
                  onChange={(v) => setForm({ ...form, region_id: v || null, state_id: null, locality_id: null, city_id: null })}
                  onNavigateNext={() => focusAt(k + 1)}
                  placeholder="— اختر —"
                  className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                  title="اختر الاتجاه"
                />
              </div>
            </div>
          ); })()}

          {(() => { const k = idx(); return (
            <div>
              <label className={lbl}>الولاية</label>
              <div className={`${inp} !p-0 ${!form.region_id ? "opacity-50 pointer-events-none" : ""}`} style={{ minHeight: 38 }}>
                <InlineSearchSelect
                  ref={(h) => { refs.current[k] = h as Focusable; }}
                  value={form.state_id || ""}
                  options={states.map(s => ({ value: s.id, label: s.name }))}
                  onChange={(v) => setForm({ ...form, state_id: v || null, city_id: null, locality_id: null })}
                  onNavigateNext={() => focusAt(k + 1)}
                  placeholder="— اختر —"
                  disabled={!form.region_id}
                  className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                  title="اختر الولاية"
                />
              </div>
            </div>
          ); })()}

          {(() => { const k = idx(); return (
          <div>
            <label className={lbl}>المدينة</label>
            <div className={`${inp} !p-0 ${!form.state_id ? "opacity-50 pointer-events-none" : ""}`} style={{ minHeight: 38 }}>
              <InlineSearchSelect
                ref={(h) => { refs.current[k] = h as Focusable; }}
                value={form.city_id || ""}
                options={cities.map(c => ({ value: c.id, label: c.name }))}
                onChange={(v) => setForm({ ...form, city_id: v || null, locality_id: null })}
                onAdd={addCity}
                onDelete={async (o) => await removeCity(o.value)}
                onNavigateNext={() => focusAt(k + 1)}
                placeholder="— اختر أو ابحث —"
                addLabel="إضافة مدينة"
                disabled={!form.state_id}
                className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                title="اختر المدينة"
              />
            </div>
          </div>
          ); })()}

          {/* الصف 3: العنوان | المحلية | المجموعة */}
          {(() => { const k = idx(); return (
            <div>
              <label className={lbl}>العنوان</label>
              <input ref={el => refs.current[k] = el} value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                onKeyDown={handleEnter(k)} className={inp} />
            </div>
          ); })()}

          {(() => { const k = idx(); return (
          <div>
            <label className={lbl}>المحلية</label>
            <div className={`${inp} !p-0 ${!form.city_id ? "opacity-50 pointer-events-none" : ""}`} style={{ minHeight: 38 }}>
              <InlineSearchSelect
                ref={(h) => { refs.current[k] = h as Focusable; }}
                value={form.locality_id || ""}
                options={localities.map(l => ({ value: l.id, label: l.name }))}
                onChange={(v) => setForm({ ...form, locality_id: v || null })}
                onAdd={addLocality}
                onDelete={async (o) => await removeLocality(o.value)}
                onNavigateNext={() => focusAt(k + 1)}
                placeholder="— اختر أو ابحث —"
                addLabel="إضافة محلية"
                disabled={!form.city_id}
                className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                title="اختر المحلية"
              />
            </div>
          </div>
          ); })()}

          {(() => { const k = idx(); return (
          <div>
            <label className={lbl}>المجموعة</label>
            <div className={`${inp} !p-0`} style={{ minHeight: 38 }}>
              <InlineSearchSelect
                ref={(h) => { refs.current[k] = h as Focusable; }}
                value={form.group_id || ""}
                options={groups.map(g => ({ value: g.id, label: g.name }))}
                onChange={(v) => setForm({ ...form, group_id: v || null })}
                onAdd={addGroup}
                onDelete={async (o) => await removeGroup(o.value)}
                onNavigateNext={() => focusAt(k + 1)}
                placeholder="— اختر —"
                addLabel="إضافة مجموعة"
                className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                title="اختر المجموعة"
              />
            </div>
          </div>
          ); })()}

          {/* الصف 4: الترحيلات | الوجهة | (فراغ) */}
          {(() => { const k = idx(); return (
          <div>
            <label className={lbl}>الترحيلات (المفضّلة)</label>
            <div className={`${inp} !p-0`} style={{ minHeight: 38 }}>
              <InlineSearchSelect
                ref={(h) => { refs.current[k] = h as Focusable; }}
                value={form.preferred_transporter_id || ""}
                options={transporters.map(t => ({ value: t.id, label: t.name }))}
                onChange={(v) => setForm({ ...form, preferred_transporter_id: v || null })}
                onAdd={addTransporter}
                onDelete={async (o) => await removeTransporter(o.value)}
                onNavigateNext={() => focusAt(k + 1)}
                placeholder="— بدون —"
                addLabel="إضافة ترحيل"
                className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                title="اختر الترحيل"
              />
            </div>
          </div>
          ); })()}

          {(() => { const k = idx(); return (
          <div>
            <label className={lbl}>الوجهة</label>
            <div className={`${inp} !p-0`} style={{ minHeight: 38 }}>
              <InlineSearchSelect
                ref={(h) => { refs.current[k] = h as Focusable; }}
                value={form.destination_id || ""}
                options={destinations.map(d => ({ value: d.id, label: d.name }))}
                onChange={(v) => setForm({ ...form, destination_id: v || null })}
                onAdd={addDestination}
                onDelete={async (o) => await removeDestination(o.value)}
                onNavigateNext={() => focusAt(k + 1)}
                placeholder="— بدون —"
                addLabel="إضافة وجهة"
                className="bg-transparent border-0 outline-none px-3 text-sm w-full h-full text-right truncate"
                title="اختر الوجهة"
              />
            </div>
          </div>
          ); })()}
          <div />
        </div>

        <DialogFooter className="gap-2">
          <button onClick={onClose} className="px-5 py-2 rounded-lg text-sm bg-muted text-foreground">إلغاء</button>
          <button ref={saveBtnRef} onClick={submit} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
            {saving ? "جاري الحفظ..." : (form.id ? "تحديث" : "حفظ")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
