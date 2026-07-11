import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronRight, ChevronDown, Search, MapPin, Plus, Pencil, X } from "lucide-react";
import { startsWithMatch } from "@/utils/searchMatch";
import DeleteGeoDialog from "@/components/shared/DeleteGeoDialog";
import {
  addGeo, renameGeo, getGeoImpact, deleteGeoOnly, deleteGeoCascade,
  EntityKind, kindLabel,
} from "@/utils/geoMutations";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  regions: any[];
  states: any[];
  localities: any[];
  cities: any[];
  customers: any[];
  onDataChanged?: () => void;
}

export default function GeoStructurePanel({
  open, onOpenChange, regions, states, localities, cities, customers, onDataChanged,
}: Props) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);
  const [delReq, setDelReq] = useState<null | {
    kind: EntityKind; id: string; name: string;
    customers: number; children: number; childrenLabel: string; customerNames: string[];
  }>(null);

  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const isOpen = (k: string) => (allOpen ? !expanded[k] : !!expanded[k]);
  const refresh = () => onDataChanged?.();

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
    const term = q.trim();
    const match = (n: string) => !term || startsWithMatch(n, term);

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

  // ── الأحداث ──
  const handleAdd = async (kind: EntityKind, parentId?: string) => {
    const label = kindLabel(kind);
    const name = window.prompt(`اسم ${label} الجديد:`, "");
    if (!name || !name.trim()) return;
    const res = await addGeo(kind, name, parentId);
    if (res) refresh();
  };

  const handleRename = async (kind: EntityKind, id: string, currentName: string) => {
    const next = window.prompt(`تعديل اسم ${kindLabel(kind)}:`, currentName);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentName) return;
    const ok = await renameGeo(kind, id, trimmed);
    if (ok) refresh();
  };

  const handleDeleteRequest = async (kind: EntityKind, id: string, name: string) => {
    const impact = await getGeoImpact(kind, id);
    if (impact.total === 0) {
      if (!window.confirm(`حذف "${name}"؟`)) return;
      const ok = await deleteGeoOnly(kind, id);
      if (ok) { toast.success(`تم حذف ${kindLabel(kind)}`); refresh(); }
      return;
    }
    setDelReq({
      kind, id, name,
      customers: impact.totalCustomers,
      children: impact.children,
      childrenLabel: impact.childrenLabel,
      customerNames: impact.customerNames,
    });
  };

  const NodeActions = ({ kind, id, name, addChildKind }: {
    kind: EntityKind; id: string; name: string; addChildKind?: EntityKind;
  }) => (
    <span className="flex items-center gap-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity">
      {addChildKind && (
        <button
          type="button"
          title={`إضافة ${kindLabel(addChildKind)}`}
          onClick={(e) => { e.stopPropagation(); handleAdd(addChildKind, id); }}
          className="p-1 rounded hover:bg-primary/15 text-primary"
        >
          <Plus size={12} />
        </button>
      )}
      <button
        type="button"
        title="تعديل الاسم"
        onClick={(e) => { e.stopPropagation(); handleRename(kind, id, name); }}
        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
      >
        <Pencil size={11} />
      </button>
      <button
        type="button"
        title="حذف"
        onClick={(e) => { e.stopPropagation(); handleDeleteRequest(kind, id, name); }}
        className="p-1 rounded hover:bg-destructive/15 text-destructive"
      >
        <X size={12} />
      </button>
    </span>
  );

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
            <button
              onClick={() => handleAdd("region")}
              className="text-xs px-2 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 whitespace-nowrap flex items-center gap-1"
              title="إضافة اتجاه جديد"
            >
              <Plus size={12} /> اتجاه
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3 text-sm">
          {tree.length === 0 && (
            <div className="text-center text-muted-foreground py-8">لا توجد نتائج</div>
          )}
          {tree.map((r: any) => (
            <div key={r.id} className="mb-1">
              <div className="group/node flex items-center gap-1 rounded-md hover:bg-muted">
                <button
                  onClick={() => toggle(`r-${r.id}`)}
                  className="flex items-center gap-1 px-2 py-1.5 text-right flex-1 min-w-0"
                >
                  {isOpen(`r-${r.id}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} className="rtl:rotate-180" />}
                  <span className="font-semibold text-foreground flex-1 truncate">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {r.states.length} ولاية · {customerCounts.r[r.id] || 0} عميل
                  </span>
                </button>
                <NodeActions kind="region" id={r.id} name={r.name} addChildKind="state" />
              </div>
              {isOpen(`r-${r.id}`) && (
                <div className="mr-4 border-r border-border/60 pr-2">
                  {r.states.map((s: any) => (
                    <div key={s.id} className="my-0.5">
                      <div className="group/node flex items-center gap-1 rounded-md hover:bg-muted">
                        <button
                          onClick={() => toggle(`s-${s.id}`)}
                          className="flex items-center gap-1 px-2 py-1 text-right flex-1 min-w-0"
                        >
                          {isOpen(`s-${s.id}`) ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rtl:rotate-180" />}
                          <span className="text-foreground flex-1 truncate">{s.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {s.cities.length} مدينة · {customerCounts.s[s.id] || 0} عميل
                          </span>
                        </button>
                        <NodeActions kind="state" id={s.id} name={s.name} addChildKind="city" />
                      </div>
                      {isOpen(`s-${s.id}`) && (
                        <div className="mr-4 border-r border-border/40 pr-2">
                          {s.cities.map((ci: any) => (
                            <div key={ci.id} className="my-0.5">
                              <div className="group/node flex items-center gap-1 rounded-md hover:bg-muted">
                                <button
                                  onClick={() => toggle(`c-${ci.id}`)}
                                  className="flex items-center gap-1 px-2 py-1 text-right flex-1 min-w-0"
                                >
                                  {isOpen(`c-${ci.id}`) ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rtl:rotate-180" />}
                                  <span className="text-foreground/90 flex-1 truncate">{ci.name}</span>
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {ci.localities.length} محلية · {customerCounts.c[ci.id] || 0} عميل
                                  </span>
                                </button>
                                <NodeActions kind="city" id={ci.id} name={ci.name} addChildKind="locality" />
                              </div>
                              {isOpen(`c-${ci.id}`) && (
                                <div className="mr-4 border-r border-border/30 pr-2 py-0.5">
                                  {ci.localities.length === 0 && (
                                    <div className="text-[11px] text-muted-foreground py-0.5 px-2">— لا محليات —</div>
                                  )}
                                  {ci.localities.map((l: any) => (
                                    <div key={l.id} className="group/node flex items-center gap-1 px-2 py-0.5 text-[12px] rounded hover:bg-muted">
                                      <span className="w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                                      <span className="flex-1 truncate">{l.name}</span>
                                      <span className="text-[10px] text-muted-foreground shrink-0">
                                        {customerCounts.l[l.id] || 0} عميل
                                      </span>
                                      <NodeActions kind="locality" id={l.id} name={l.name} />
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

        {delReq && (
          <DeleteGeoDialog
            open={!!delReq}
            onOpenChange={(v) => !v && setDelReq(null)}
            entityLabel={kindLabel(delReq.kind)}
            entityName={delReq.name}
            customers={delReq.customers}
            children={delReq.children}
            childrenLabel={delReq.childrenLabel}
            customerNames={delReq.customerNames}
            allowCascade={true}
            onDeleteOnly={async () => {
              const ok = await deleteGeoOnly(delReq.kind, delReq.id);
              if (ok) { toast.success(`تم حذف ${kindLabel(delReq.kind)} وفكّ الربط عن العملاء`); refresh(); }
              return ok;
            }}
            onDeleteCascade={async () => {
              const ok = await deleteGeoCascade(delReq.kind, delReq.id);
              if (ok) refresh();
              return ok;
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
