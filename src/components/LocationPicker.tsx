import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Plus, Map as MapIcon, List as ListIcon, Search, X, Copy, Download, Upload, Clock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SudanMap from "@/components/location/SudanMap";
import LocationChips from "@/components/location/LocationChips";
import LocationBreadcrumb from "@/components/location/LocationBreadcrumb";
import { SUDAN_REGIONS, matchRegion, type MapRegion } from "@/data/sudanMap";
import {
  encodeLocationValue,
  decodeLocationValue,
  loadRecent,
  pushRecent,
  LOCATION_QUERY_PARAM,
  type RecentLocationEntry,
} from "@/components/location/locationSerialization";

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
  /** استيراد أولي من نص JSON مُشفَّر (مثلاً من رابط مشاركة) — يطبَّق مرة واحدة إذا كانت value فارغة. */
  initialFromString?: string | null;
  /** المزامنة مع query param (`?loc=…`) — استيراد على mount + تصدير عند التغيير. */
  syncQueryParam?: boolean;
}

const baseInput = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary";
const MODE_KEY = "lov:location-picker:mode";

export default function LocationPicker({ value, onChange, required, className, inputCls, initialFromString, syncQueryParam }: Props) {
  const cls = inputCls || baseInput;
  const [regions, setRegions] = useState<any[]>([]);
  const [states, setStates] = useState<any[]>([]);
  const [localities, setLocalities] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<RecentLocationEntry[]>(() => loadRecent());
  const [searchParams, setSearchParams] = useSearchParams();
  const importedOnceRef = useRef(false);
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

  // استيراد أولي من prop أو query param — مرة واحدة، فقط إذا لم يوجد اختيار بعد.
  useEffect(() => {
    if (importedOnceRef.current) return;
    const hasAny = !!(value.region_id || value.state_id || value.city_id || value.locality_id);
    if (hasAny) { importedOnceRef.current = true; return; }
    const source = initialFromString || (syncQueryParam ? searchParams.get(LOCATION_QUERY_PARAM) : null);
    if (!source) return;
    const parsed = decodeLocationValue(source);
    if (parsed) {
      onChange({
        region_id: parsed.region_id ?? null,
        state_id: parsed.state_id ?? null,
        city_id: parsed.city_id ?? null,
        locality_id: parsed.locality_id ?? null,
      });
      importedOnceRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFromString, syncQueryParam]);

  // تصدير للـ query param عند التغيير (opt-in).
  useEffect(() => {
    if (!syncQueryParam) return;
    const hasAny = !!(value.region_id || value.state_id || value.city_id || value.locality_id);
    const next = new URLSearchParams(searchParams);
    if (hasAny) next.set(LOCATION_QUERY_PARAM, encodeLocationValue(value));
    else next.delete(LOCATION_QUERY_PARAM);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.region_id, value.state_id, value.city_id, value.locality_id, syncQueryParam]);

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

  // فلترة موحّدة تُستخدم في الوضعين
  const q = search.trim();
  const filterList = <T extends { name: string }>(arr: T[]) =>
    !q ? arr : arr.filter(x => (x.name || "").includes(q));
  const fStates = filterList(states);
  const fCities = filterList(cities);
  const fLocalities = filterList(localities);

  // ---------- الأحدث ----------
  const regionName = regions.find(r => r.id === value.region_id)?.name;
  const stateName = states.find(s => s.id === value.state_id)?.name;
  const cityName = cities.find(c => c.id === value.city_id)?.name;
  const localityName = localities.find(l => l.id === value.locality_id)?.name;

  // تسجيل اختيار مكتمل في «الأحدث» (يشترط region + state على الأقل).
  useEffect(() => {
    if (!value.region_id || !value.state_id) return;
    if (!regionName || !stateName) return;
    const label = [regionName, stateName, cityName, localityName].filter(Boolean).join(" › ");
    const entry: RecentLocationEntry = {
      region_id: value.region_id,
      state_id: value.state_id,
      city_id: value.city_id ?? null,
      locality_id: value.locality_id ?? null,
      label,
      ts: Date.now(),
    };
    setRecent(pushRecent(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.region_id, value.state_id, value.city_id, value.locality_id, regionName, stateName, cityName, localityName]);

  const applyRecent = (r: RecentLocationEntry) => {
    onChange({
      region_id: r.region_id,
      state_id: r.state_id,
      city_id: r.city_id ?? null,
      locality_id: r.locality_id ?? null,
    });
    toast.success("تم استعادة الاختيار السابق");
  };

  // ---------- تصدير/استيراد JSON ----------
  const handleCopyJson = async () => {
    const text = encodeLocationValue(value);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم نسخ JSON للاختيار");
    } catch {
      window.prompt("انسخ الاختيار يدوياً:", text);
    }
  };
  const handleImport = () => {
    const raw = window.prompt("ألصق JSON الاختيار هنا:");
    if (!raw) return;
    const parsed = decodeLocationValue(raw);
    if (!parsed) { toast.error("JSON غير صالح"); return; }
    onChange({
      region_id: parsed.region_id ?? null,
      state_id: parsed.state_id ?? null,
      city_id: parsed.city_id ?? null,
      locality_id: parsed.locality_id ?? null,
    });
    toast.success("تم استيراد الاختيار");
  };

  // ---------- شارات مساعدة (Recent + IO) ----------
  const RecentBar = recent.length > 0 && (
    <div className="mb-3 animate-fade-in">
      <div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
        <Clock size={12} /> الأحدث
      </div>
      <div className="flex flex-wrap gap-1.5" role="list" aria-label="آخر المواقع المستخدمة">
        {recent.map((r) => (
          <button
            key={`${r.region_id}-${r.state_id}-${r.city_id}-${r.locality_id}-${r.ts}`}
            type="button"
            role="listitem"
            onClick={() => applyRecent(r)}
            title={r.label}
            className="max-w-[260px] truncate px-2.5 py-1 rounded-full text-xs border border-border bg-background hover:border-primary/60 hover:bg-accent transition-colors"
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );

  const IOBar = (
    <div className="flex items-center gap-2 text-xs">
      <button type="button" onClick={handleCopyJson} className="inline-flex items-center gap-1 text-primary hover:underline" aria-label="نسخ JSON للاختيار الحالي">
        <Copy size={12} /> نسخ JSON
      </button>
      <button type="button" onClick={handleImport} className="inline-flex items-center gap-1 text-primary hover:underline" aria-label="استيراد JSON">
        <Upload size={12} /> استيراد
      </button>
    </div>
  );

  const SearchBar = (
    <div className="relative mb-3">
      <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ابحث في الولايات والمدن والمحليات…"
        className={`${baseInput} pr-9 pl-8`}
        aria-label="بحث في المواقع"
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch("")}
          className="absolute top-1/2 -translate-y-1/2 left-2 p-1 rounded-md hover:bg-muted text-muted-foreground"
          aria-label="مسح البحث"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );

  // ============ وضع القوائم القديم (fallback) ============
  if (mode === "list") {
    return (
      <div className={className}>
        <div className="flex justify-between items-center mb-2 gap-2 flex-wrap">
          {IOBar}
          <button type="button" onClick={() => setMode("map")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <MapIcon size={12} /> عرض كخريطة
          </button>
        </div>
        {RecentBar}
        {SearchBar}
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
              <span>
                الولاية {required && <span className="text-destructive">*</span>}
                <span className="mx-1 text-[10px] text-primary" role="status" aria-live="polite" aria-atomic="true" data-testid="states-counter">
                  {search && fStates.length !== states.length ? `(${fStates.length}/${states.length})` : ""}
                </span>
              </span>
              <button type="button" disabled={!value.region_id || loading} onClick={addState} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
            </label>
            <select value={value.state_id || ""} onChange={e => onChange({ ...value, state_id: e.target.value || null, locality_id: null, city_id: null })} disabled={!value.region_id} className={cls}>
              <option value="">-- اختر الولاية --</option>
              {fStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
              <span>
                المدينة {required && <span className="text-destructive">*</span>}
                <span className="mx-1 text-[10px] text-primary" role="status" aria-live="polite" aria-atomic="true" data-testid="cities-counter">
                  {search && fCities.length !== cities.length ? `(${fCities.length}/${cities.length})` : ""}
                </span>
              </span>
              <button type="button" disabled={!value.state_id || loading} onClick={addCity} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
            </label>
            <select value={value.city_id || ""} onChange={e => onChange({ ...value, city_id: e.target.value || null, locality_id: null })} disabled={!value.state_id} className={cls}>
              <option value="">-- اختر المدينة --</option>
              {fCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1 flex items-center justify-between">
              <span>
                المحلية
                <span className="mx-1 text-[10px] text-primary" role="status" aria-live="polite" aria-atomic="true" data-testid="localities-counter">
                  {search && fLocalities.length !== localities.length ? `(${fLocalities.length}/${localities.length})` : ""}
                </span>
              </span>
              <button type="button" disabled={!value.city_id || loading} onClick={addLocality} className="text-primary hover:underline disabled:opacity-40 inline-flex items-center gap-1"><Plus size={12} /> إضافة</button>
            </label>
            <select value={value.locality_id || ""} onChange={e => onChange({ ...value, locality_id: e.target.value || null })} disabled={!value.city_id} className={cls}>
              <option value="">-- اختر المحلية --</option>
              {fLocalities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ============ وضع الخريطة ============
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <LocationBreadcrumb
          crumbs={[
            { label: regionName || "الاتجاه", onClick: () => onChange({ region_id: null, state_id: null, city_id: null, locality_id: null }), muted: !regionName },
            ...(value.region_id ? [{ label: stateName || "الولاية", onClick: () => onChange({ ...value, state_id: null, city_id: null, locality_id: null }), muted: !stateName }] : []),
            ...(value.state_id ? [{ label: cityName || "المدينة", onClick: () => onChange({ ...value, city_id: null, locality_id: null }), muted: !cityName }] : []),
            ...(value.city_id ? [{ label: localityName || "المحلية", muted: !localityName }] : []),
          ]}
        />
        <div className="flex items-center gap-3">
          {IOBar}
          <button type="button" onClick={() => setMode("list")} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <ListIcon size={12} /> عرض كقوائم
          </button>
        </div>
      </div>

      {RecentBar}
      {SearchBar}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 items-start">
        <div>
          <SudanMap selectedId={selectedMapId} onSelect={onMapSelect} />
          <div className="text-[11px] text-muted-foreground text-center mt-1">
            انقر أو استخدم الأسهم ثم Enter {required && <span className="text-destructive">*</span>}
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
              filter={search}
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
              filter={search}
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
              filter={search}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export { encodeLocationValue, decodeLocationValue } from "@/components/location/locationSerialization";

export function validateLocation(v: LocationValue): string | null {
  if (!v.region_id) return "الاتجاه مطلوب";
  if (!v.state_id) return "الولاية مطلوبة";
  return null;
}
