import { useEffect, useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LocationValue = {
  region_id: string | null;
  state_id: string | null;
  city_id: string | null;
  locality_id?: string | null;
};

interface Props {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  required?: boolean;
  className?: string;
  inputCls?: string;
}

const baseInput = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary";

export default function LocationPicker({ value, onChange, required, className, inputCls }: Props) {
  const cls = inputCls || baseInput;
  const [regions, setRegions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [localities, setLocalities] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRegions = useCallback(async () => {
    const { data } = await (supabase as any).from("regions").select("id, name, sort_order").order("sort_order");
    setRegions(data || []);
  }, []);
  const loadStates = useCallback(async (region_id: string) => {
    if (!region_id) { setStates([]); return; }
    const { data } = await (supabase as any).from("states").select("id, name, region_id").eq("region_id", region_id).order("name");
    setStates(data || []);
  }, []);
  const loadCities = useCallback(async (state_id: string) => {
    if (!state_id) { setCities([]); return; }
    const { data } = await (supabase as any).from("cities").select("id, name, state_id").eq("state_id", state_id).order("name");
    setCities(data || []);
  }, []);
  const loadLocalities = useCallback(async (city_id: string) => {
    if (!city_id) { setLocalities([]); return; }
    const { data } = await (supabase as any).from("localities").select("id, name, city_id").eq("city_id", city_id).order("name");
    setLocalities(data || []);
  }, []);

  useEffect(() => { loadRegions(); }, [loadRegions]);
  useEffect(() => { if (value.region_id) loadStates(value.region_id); else setStates([]); }, [value.region_id, loadStates]);
  useEffect(() => { if (value.state_id) loadCities(value.state_id); else setCities([]); }, [value.state_id, loadCities]);
  useEffect(() => { if (value.city_id) loadLocalities(value.city_id); else setLocalities([]); }, [value.city_id, loadLocalities]);

  const addState = async () => {
    if (!value.region_id) { toast.error("اختر الاتجاه أولاً"); return; }
    const name = window.prompt("اسم الولاية:");
    if (!name?.trim()) return;
    setLoading(true);
    const { data, error } = await (supabase as any).from("states").insert({ region_id: value.region_id, name: name.trim() }).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    await loadStates(value.region_id);
    onChange({ ...value, state_id: data.id, locality_id: null, city_id: null });
    toast.success("تمت إضافة الولاية");
  };

  const addCity = async () => {
    if (!value.state_id) { toast.error("اختر الولاية أولاً"); return; }
    const name = window.prompt("اسم المدينة:");
    if (!name?.trim()) return;
    setLoading(true);
    const { data, error } = await (supabase as any).from("cities").insert({ state_id: value.state_id, name: name.trim() }).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    await loadCities(value.state_id);
    onChange({ ...value, city_id: data.id, locality_id: null });
    toast.success("تمت إضافة المدينة");
  };

  const addLocality = async () => {
    if (!value.city_id) { toast.error("اختر المدينة أولاً"); return; }
    const name = window.prompt("اسم المحلية:");
    if (!name?.trim()) return;
    setLoading(true);
    const { data, error } = await (supabase as any).from("localities").insert({ city_id: value.city_id, name: name.trim() }).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    await loadLocalities(value.city_id);
    onChange({ ...value, locality_id: data.id });
    toast.success("تمت إضافة المحلية");
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 ${className || ""}`}>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">الاتجاه {required && <span className="text-destructive">*</span>}</label>
        <select
          value={value.region_id || ""}
          onChange={e => onChange({ region_id: e.target.value || null, state_id: null, locality_id: null, city_id: null })}
          className={cls}
        >
          <option value="">-- اختر الاتجاه --</option>
          {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
          <span>الولاية {required && <span className="text-destructive">*</span>}</span>
          <button type="button" disabled={!value.region_id || loading} onClick={addState} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1">
            <Plus size={12} /> إضافة
          </button>
        </label>
        <select
          value={value.state_id || ""}
          onChange={e => onChange({ ...value, state_id: e.target.value || null, locality_id: null, city_id: null })}
          disabled={!value.region_id}
          className={cls}
        >
          <option value="">-- اختر الولاية --</option>
          {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
          <span>المدينة {required && <span className="text-destructive">*</span>}</span>
          <button type="button" disabled={!value.state_id || loading} onClick={addCity} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1">
            <Plus size={12} /> إضافة
          </button>
        </label>
        <select
          value={value.city_id || ""}
          onChange={e => onChange({ ...value, city_id: e.target.value || null, locality_id: null })}
          disabled={!value.state_id}
          className={cls}
        >
          <option value="">-- اختر المدينة --</option>
          {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
          <span>المحلية</span>
          <button type="button" disabled={!value.city_id || loading} onClick={addLocality} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1">
            <Plus size={12} /> إضافة
          </button>
        </label>
        <select
          value={value.locality_id || ""}
          onChange={e => onChange({ ...value, locality_id: e.target.value || null })}
          disabled={!value.city_id}
          className={cls}
        >
          <option value="">-- اختر المحلية --</option>
          {localities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
    </div>
  );
}

export function validateLocation(v: LocationValue): string | null {
  if (!v.region_id) return "الاتجاه مطلوب";
  if (!v.state_id) return "الولاية مطلوبة";
  return null;
}
