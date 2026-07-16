import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Map as MapIcon, List as ListIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SudanMap from "@/components/location/SudanMap";
import LocationChips from "@/components/location/LocationChips";
import LocationBreadcrumb from "@/components/location/LocationBreadcrumb";
import { SUDAN_REGIONS, matchRegion, type MapRegion } from "@/data/sudanMap";

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
const MODE_KEY = "lov:location-picker:mode";

export default function LocationPicker({ value, onChange, required, className, inputCls }: Props) {
  const cls = inputCls || baseInput;
  const [regions, setRegions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [localities, setLocalities] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"map" | "list">(() => {
    if (typeof window === "undefined") return "map";
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === "map" || saved === "list") return saved;
    return window.innerWidth < 480 ? "list" : "map";
  });

  useEffect(() => { try { window.localStorage.setItem(MODE_KEY, mode); } catch {} }, [mode]);

  const loadRegions = useCallback(async () => {
    const { data } = await (supabase as any).from("regions").select("id, name, slug, sort_order").order("sort_order");
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

  // ربط منطقة الخريطة المحددة بالـ DB region الحالي (للتلوين)
  const selectedMapId = useMemo(() => {
    if (!value.region_id) return null;
    const dbRow = regions.find(r => r.id === value.region_id);
    if (!dbRow) return null;
    const norm = (s: string) => (s || "").trim().replace(/\s+/g, "");
    const dbKey = norm(dbRow.slug || dbRow.name);
    const hit = SUDAN_REGIONS.find(m =>
      [m.id, m.name, ...(m.aliases || [])].map(norm).includes(dbKey)
    );
    return hit?.id || null;
  }, [value.region_id, regions]);

  const onMapSelect = useCallback((r: MapRegion) => {
    const dbRow = matchRegion(regions as any, r);
    if (!dbRow) {
      toast.error(`المنطقة "${r.name}" غير موجودة في قاعدة البيانات`);
      return;
    }
    onChange({ region_id: dbRow.id, state_id: null, city_id: null, locality_id: null });
  }, [regions, onChange]);

  const addRow = async (table: "states" | "cities" | "localities", parentKey: string, parentId: string | null | undefined, promptText: string, reload: () => Promise<void>, patch: (id: string) => LocationValue) => {
    if (!parentId) { toast.error("اختر السابق أولاً"); return; }
    const name = window.prompt(promptText);
    if (!name?.trim()) return;
    setLoading(true);
    const { data, error } = await (supabase as any).from(table).insert({ [parentKey]: parentId, name: name.trim() }).select().single();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    await reload();
    onChange(patch(data.id));
    toast.success("تمت الإضافة");
  };

  const addState = () => addRow("states", "region_id", value.region_id, "اسم الولاية:", () => loadStates(value.region_id!), (id) => ({ ...value, state_id: id, city_id: null, locality_id: null }));
  const addCity = () => addRow("cities", "state_id", value.state_id, "اسم المدينة:", () => loadCities(value.state_id!), (id) => ({ ...value, city_id: id, locality_id: null }));
  const addLocality = () => addRow("localities", "city_id", value.city_id, "اسم المحلية:", () => loadLocalities(value.city_id!), (id) => ({ ...value, locality_id: id }));

  // ============ وضع القوائم القديم (fallback) ============
  if (mode === "list") {
    return (
      <div className={className}>
        <div className="flex justify-end mb-2">
          <button type="button" onClick={() => setMode("map")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <MapIcon size={12} /> عرض كخريطة
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">الاتجاه {required && <span className="text-destructive">*</span>}</label>
            <select value={value.region_id || ""} onChange={e => onChange({ region_id: e.target.value || null, state_id: null, locality_id: null, city_id: null })} className={cls}>
              <option value="">-- اختر الاتجاه --</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
              <span>الولاية {required && <span className="text-destructive">*</span>}</span>
              <button type="button" disabled={!value.region_id || loading} onClick={addState} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
            </label>
            <select value={value.state_id || ""} onChange={e => onChange({ ...value, state_id: e.target.value || null, locality_id: null, city_id: null })} disabled={!value.region_id} className={cls}>
              <option value="">-- اختر الولاية --</option>
              {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
              <span>المدينة {required && <span className="text-destructive">*</span>}</span>
              <button type="button" disabled={!value.state_id || loading} onClick={addCity} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
            </label>
            <select value={value.city_id || ""} onChange={e => onChange({ ...value, city_id: e.target.value || null, locality_id: null })} disabled={!value.state_id} className={cls}>
              <option value="">-- اختر المدينة --</option>
              {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
              <span>المحلية</span>
              <button type="button" disabled={!value.city_id || loading} onClick={addLocality} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
            </label>
            <select value={value.locality_id || ""} onChange={e => onChange({ ...value, locality_id: e.target.value || null })} disabled={!value.city_id} className={cls}>
              <option value="">-- اختر المحلية --</option>
              {localities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ============ وضع الخريطة ============
  const regionName = regions.find(r => r.id === value.region_id)?.name;
  const stateName = states.find(s => s.id === value.state_id)?.name;
  const cityName = cities.find(c => c.id === value.city_id)?.name;
  const localityName = localities.find(l => l.id === value.locality_id)?.name;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <LocationBreadcrumb
          crumbs={[
            { label: regionName || "الاتجاه", onClick: () => onChange({ region_id: null, state_id: null, city_id: null, locality_id: null }), muted: !regionName },
            ...(value.region_id ? [{ label: stateName || "الولاية", onClick: () => onChange({ ...value, state_id: null, city_id: null, locality_id: null }), muted: !stateName }] : []),
            ...(value.state_id ? [{ label: cityName || "المدينة", onClick: () => onChange({ ...value, city_id: null, locality_id: null }), muted: !cityName }] : []),
            ...(value.city_id ? [{ label: localityName || "المحلية", muted: !localityName }] : []),
          ]}
        />
        <button type="button" onClick={() => setMode("list")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
          <ListIcon size={12} /> عرض كقوائم
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start">
        <div>
          <SudanMap selectedId={selectedMapId} onSelect={onMapSelect} />
          <div className="text-[11px] text-muted-foreground text-center mt-1">
            انقر على منطقة للاختيار {required && <span className="text-destructive">*</span>}
          </div>
        </div>

        <div className="space-y-4 min-h-[200px]">
          {!value.region_id && (
            <div className="text-sm text-muted-foreground animate-fade-in">
              ابدأ باختيار اتجاه من الخريطة على اليمين لعرض الولايات.
            </div>
          )}

          {value.region_id && (
            <LocationChips
              label="الولاية"
              items={states}
              value={value.state_id}
              onChange={(id) => onChange({ ...value, state_id: id, city_id: null, locality_id: null })}
              onAdd={addState}
              disabled={loading}
              emptyHint="لا توجد ولايات — أضف واحدة"
            />
          )}

          {value.state_id && (
            <LocationChips
              label="المدينة"
              items={cities}
              value={value.city_id}
              onChange={(id) => onChange({ ...value, city_id: id, locality_id: null })}
              onAdd={addCity}
              disabled={loading}
              emptyHint="لا توجد مدن — أضف واحدة"
            />
          )}

          {value.city_id && (
            <LocationChips
              label="المحلية"
              items={localities}
              value={value.locality_id || null}
              onChange={(id) => onChange({ ...value, locality_id: id })}
              onAdd={addLocality}
              disabled={loading}
              emptyHint="لا توجد محليات — أضف واحدة"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function validateLocation(v: LocationValue): string | null {
  if (!v.region_id) return "الاتجاه مطلوب";
  if (!v.state_id) return "الولاية مطلوبة";
  return null;
}
