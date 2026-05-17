import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronRight, ChevronDown, Search, MapPin } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regions: any[];
  states: any[];
  localities: any[];
  cities: any[];
  customers: any[];
}

export default function GeoStructurePanel({ open, onOpenChange, regions, states, localities, cities, customers }: Props) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);

  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const isOpen = (k: string) => (allOpen ? !expanded[k] : !!expanded[k]);

  const customerCounts = useMemo(() => {
    const r: Record<string, number> = {};
    const s: Record<string, number> = {};
    const l: Record<string, number> = {};
    const c: Record<string, number> = {};
    (customers || []).forEach((cu: any) => {
      if (cu.region_id) r[cu.region_id] = (r[cu.region_id] || 0) + 1;
      if (cu.state_id) s[cu.state_id] = (s[cu.state_id] || 0) + 1;
      if (cu.locality_id) l[cu.locality_id] = (l[cu.locality_id] || 0) + 1;
      if (cu.city_id) c[cu.city_id] = (c[cu.city_id] || 0) + 1;
    });
    return { r, s, l, c };
  }, [customers]);

  const tree = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (n: string) => !term || (n || "").toLowerCase().includes(term);

    return (regions || [])
      .slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.name || "").localeCompare(b.name || ""))
      .map((r: any) => {
        const rStates = (states || []).filter(s => s.region_id === r.id).map((s: any) => {
          const sCities = (cities || []).filter(ci => ci.state_id === s.id).map((ci: any) => {
            const cLocs = (localities || []).filter(l => l.city_id === ci.id)
              .filter(l => match(l.name));
            const cityHit = match(ci.name) || cLocs.length > 0;
            return cityHit ? { ...ci, localities: cLocs, _show: true } : null;
          }).filter(Boolean) as any[];
          const stateHit = match(s.name) || sCities.length > 0;
          return stateHit ? { ...s, cities: sCities, _show: true } : null;
        }).filter(Boolean) as any[];
        const regionHit = match(r.name) || rStates.length > 0;
        return regionHit ? { ...r, states: rStates } : null;
      }).filter(Boolean) as any[];
  }, [regions, states, localities, cities, q]);

  const totalCounts = useMemo(() => ({
    regions: regions?.length || 0,
    states: states?.length || 0,
    localities: localities?.length || 0,
    cities: cities?.length || 0,
  }), [regions, states, localities, cities]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg p-0 flex flex-col" dir="rtl">
        <SheetHeader className="px-4 py-3 border-b border-border bg-card sticky top-0 z-10">
          <SheetTitle className="flex items-center gap-2 text-base">
            <MapPin size={18} className="text-primary" />
            الهيكل الجغرافي
          </SheetTitle>
          <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
            <span>الاتجاهات: {totalCounts.regions}</span>
            <span>الولايات: {totalCounts.states}</span>
            <span>المدن: {totalCounts.cities}</span>
            <span>المحليات: {totalCounts.localities}</span>
          </div>
          <div className="flex gap-2 items-center mt-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="بحث في الهيكل..."
                className="w-full bg-background border border-border rounded-md pr-7 pl-2 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={() => { setAllOpen(a => !a); setExpanded({}); }}
              className="text-xs px-2 py-1.5 rounded-md border border-border hover:bg-muted whitespace-nowrap"
            >
              {allOpen ? "طيّ الكل" : "توسيع الكل"}
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3 text-sm">
          {tree.length === 0 && (
            <div className="text-center text-muted-foreground py-8">لا توجد نتائج</div>
          )}
          {tree.map((r: any) => (
            <div key={r.id} className="mb-1">
              <button
                onClick={() => toggle(`r-${r.id}`)}
                className="w-full flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-muted text-right"
              >
                {isOpen(`r-${r.id}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rtl:rotate-180" />}
                <span className="font-semibold text-foreground flex-1">{r.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {r.states.length} ولاية · {customerCounts.r[r.id] || 0} عميل
                </span>
              </button>
              {isOpen(`r-${r.id}`) && (
                <div className="mr-4 border-r border-border/60 pr-2">
                  {r.states.map((s: any) => (
                    <div key={s.id} className="my-0.5">
                      <button
                        onClick={() => toggle(`s-${s.id}`)}
                        className="w-full flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted text-right"
                      >
                        {isOpen(`s-${s.id}`) ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rtl:rotate-180" />}
                        <span className="text-foreground flex-1">{s.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {s.cities.length} مدينة · {customerCounts.s[s.id] || 0} عميل
                        </span>
                      </button>
                      {isOpen(`s-${s.id}`) && (
                        <div className="mr-4 border-r border-border/40 pr-2">
                          {s.cities.map((ci: any) => (
                            <div key={ci.id} className="my-0.5">
                              <button
                                onClick={() => toggle(`c-${ci.id}`)}
                                className="w-full flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted text-right"
                              >
                                {isOpen(`c-${ci.id}`) ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rtl:rotate-180" />}
                                <span className="text-foreground/90 flex-1">{ci.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {ci.localities.length} محلية · {customerCounts.c[ci.id] || 0} عميل
                                </span>
                              </button>
                              {isOpen(`c-${ci.id}`) && (
                                <div className="mr-4 border-r border-border/30 pr-2 py-0.5">
                                  {ci.localities.length === 0 && (
                                    <div className="text-[11px] text-muted-foreground py-0.5 px-2">— لا محليات —</div>
                                  )}
                                  {ci.localities.map((l: any) => (
                                    <div key={l.id} className="flex items-center gap-1 px-2 py-0.5 text-[12px]">
                                      <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />
                                      <span className="flex-1">{l.name}</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {customerCounts.l[l.id] || 0} عميل
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
