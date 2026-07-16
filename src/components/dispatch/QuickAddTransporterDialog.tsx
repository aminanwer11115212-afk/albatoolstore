import { useState, useEffect, useRef, useMemo, useCallback, KeyboardEvent } from "react";
import { useSafeQueryClient as useQueryClient } from "@/lib/safeQueryClient";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDestinations } from "@/hooks/useData";
import { startsWithMatch } from "@/utils/searchMatch";
import { ChevronDown, X, Check, Search } from "lucide-react";

const schema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(120, "الاسم طويل جداً"),
  phone: z.string().trim().min(4, "الهاتف مطلوب").max(40, "الهاتف طويل جداً"),
  address: z.string().trim().min(1, "العنوان مطلوب").max(255, "العنوان طويل جداً"),
  destination_ids: z.array(z.string().uuid()).min(1, "اختر وجهة واحدة على الأقل"),
});

const DRAFT_KEY = "lov:quick-add-transporter:draft";

type Draft = {
  name: string;
  phone: string;
  address: string;
  notes: string;
  destIds: string[];
};

function loadDraft(): Partial<Draft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const d = JSON.parse(raw);
    return {
      name: typeof d.name === "string" ? d.name : "",
      phone: typeof d.phone === "string" ? d.phone : "",
      address: typeof d.address === "string" ? d.address : "",
      notes: typeof d.notes === "string" ? d.notes : "",
      destIds: Array.isArray(d.destIds) ? d.destIds.filter((x: any) => typeof x === "string") : [],
    };
  } catch {
    return {};
  }
}

function saveDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (row: any) => void;
  initialName?: string;
};

export default function QuickAddTransporterDialog({ open, onOpenChange, onCreated, initialName }: Props) {
  if (!open) {
    return null as any;
  }
  return <QuickAddTransporterDialogInner open={open} onOpenChange={onOpenChange} onCreated={onCreated} initialName={initialName} />;
}

function QuickAddTransporterDialogInner({ open, onOpenChange, onCreated, initialName }: Props) {
  const qc = useQueryClient();
  const { data: destinations } = useDestinations();

  // Restore persisted draft on first mount
  const initial = useMemo(() => loadDraft(), []);
  const [name, setName] = useState(initialName || initial.name || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [address, setAddress] = useState(initial.address || "");
  const [destIds, setDestIds] = useState<string[]>(initial.destIds || []);
  const [notes, setNotes] = useState(initial.notes || "");
  const [busy, setBusy] = useState(false);
  const [destError, setDestError] = useState<string | null>(null);

  useEffect(() => { if (open && initialName) setName(initialName); }, [open, initialName]);

  // Persist draft whenever fields change
  useEffect(() => {
    saveDraft({ name, phone, address, notes, destIds });
  }, [name, phone, address, notes, destIds]);

  const reset = () => {
    setName(""); setPhone(""); setAddress(""); setDestIds([]); setNotes("");
    setDestError(null);
  };

  const toggleDest = (id: string) => {
    setDestError(null);
    setDestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    if (destIds.length === 0) {
      setDestError("اختر وجهة واحدة على الأقل");
      toast.error("اختر وجهة واحدة على الأقل");
      return;
    }
    const parsed = schema.safeParse({ name, phone, address, destination_ids: destIds });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message || "بيانات غير صحيحة");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("transporters").insert({
        name: parsed.data.name,
        phone: parsed.data.phone,
        address: parsed.data.address,
        notes: notes.trim() || null,
      }).select().single();
      if (error) throw error;

      if (data?.id) {
        const links = parsed.data.destination_ids.map((destination_id, idx) => ({
          transporter_id: data.id,
          destination_id,
          position: idx,
        }));
        const { error: linkErr } = await (supabase as any)
          .from("destination_transporters")
          .insert(links);
        if (linkErr) throw linkErr;
      }

      toast.success("تمت إضافة الناقل بنجاح", {
        description: `«${data?.name ?? parsed.data.name}» متاح الآن في قائمة الناقلين`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transporters"] }),
        qc.invalidateQueries({ queryKey: ["destination_transporters"] }),
      ]);
      await qc.refetchQueries({ queryKey: ["transporters"], type: "active" });
      try { window.dispatchEvent(new Event("customer-logistics:changed")); } catch {}
      onCreated?.(data);
      reset();
      clearDraft();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const destList = (destinations as any[]) || [];
  const canSave = destIds.length > 0 && name.trim().length > 0 && phone.trim().length >= 4 && address.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة ناقل جديد</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="tr-name">الاسم *</Label>
            <Input id="tr-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="اسم الناقل" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-phone">الهاتف *</Label>
            <Input id="tr-phone" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxx" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-address">العنوان *</Label>
            <Input id="tr-address" value={address} maxLength={255} onChange={(e) => setAddress(e.target.value)} placeholder="يظهر في تقرير الترحيلات" />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label id="dest-label">الوجهات التي يوصّل إليها *</Label>
              {destList.length > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setDestError(null); setDestIds(destList.map((d: any) => d.id)); }}
                    className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"
                    aria-label="تحديد كل الوجهات"
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestIds([])}
                    className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"
                    aria-label="مسح كل الوجهات المحددة"
                    disabled={destIds.length === 0}
                  >
                    مسح الكل
                  </button>
                </div>
              )}
            </div>
            <DestinationsMultiSelect
              options={destList}
              selectedIds={destIds}
              onToggle={toggleDest}
              onClear={(id) => setDestIds((prev) => prev.filter((x) => x !== id))}
              onSelectAll={() => { setDestError(null); setDestIds(destList.map((d: any) => d.id)); }}
              onClearAll={() => setDestIds([])}
              ariaLabelledBy="dest-label"
              invalid={!!destError}
            />
            {destError && (
              <div role="alert" className="text-[11px] text-destructive">{destError}</div>
            )}
            {destIds.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                الترتيب: {destIds
                  .map((id) => destList.find((x: any) => x.id === id)?.name)
                  .filter(Boolean)
                  .join(" ← ")}
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-notes">ملاحظات</Label>
            <Textarea id="tr-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>إلغاء</Button>
          <Button onClick={save} disabled={busy || !canSave}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestinationsMultiSelect({
  options,
  selectedIds,
  onToggle,
  onClear,
  onSelectAll,
  onClearAll,
  ariaLabelledBy,
  invalid,
}: {
  options: any[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  ariaLabelledBy?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = "dest-listbox";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  const filtered = useMemo(
    () => (search.trim() ? options.filter((o) => startsWithMatch(o.name, search)) : options),
    [options, search],
  );

  useEffect(() => { setActiveIdx(0); }, [search, open]);

  const selectedOptions = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as any[];

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false); setSearch("");
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    // Backspace on trigger removes last chip
    if ((e.key === "Backspace" || e.key === "Delete") && !open && selectedIds.length > 0) {
      e.preventDefault();
      onClear(selectedIds[selectedIds.length - 1]);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); closeAndFocusTrigger(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Home") { e.preventDefault(); setActiveIdx(0); return; }
    if (e.key === "End") { e.preventDefault(); setActiveIdx(Math.max(filtered.length - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) onToggle(item.id);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false); setSearch("");
    }
  };

  if (options.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center border border-border rounded-md bg-muted/30">
        لا توجد وجهات — أضف وجهات أولاً من صفحة إدارة الوجهات.
      </div>
    );
  }

  const activeId = filtered[activeIdx] ? `dest-opt-${filtered[activeIdx].id}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={invalid || undefined}
        className={`w-full min-h-[38px] flex flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring ${invalid ? "border-destructive" : "border-border"}`}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground flex-1">اختر الوجهات...</span>
        ) : (
          selectedOptions.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-xs"
            >
              <span>{o.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear(o.id); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " " || e.key === "Backspace" || e.key === "Delete") {
                    e.preventDefault(); e.stopPropagation();
                    onClear(o.id);
                  }
                }}
                aria-label={`إزالة الوجهة ${o.name}`}
                className="rounded-full hover:bg-primary/20 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground mr-auto" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchRef}
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onSearchKey}
                placeholder="بحث..."
                aria-label="ابحث عن وجهة"
                aria-controls={listboxId}
                aria-activedescendant={activeId}
                className="w-full h-8 rounded bg-muted px-7 text-xs outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <button
                type="button"
                onClick={onSelectAll}
                className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={onClearAll}
                className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-accent"
                disabled={selectedIds.length === 0}
              >
                مسح الكل
              </button>
              <span className="text-[10px] text-muted-foreground mr-auto">
                {selectedIds.length} / {options.length}
              </span>
            </div>
          </div>
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby={ariaLabelledBy}
            className="max-h-48 overflow-y-auto"
          >
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-3">لا نتائج</div>
            ) : filtered.map((o: any, idx: number) => {
              const isSel = selectedIds.includes(o.id);
              const isActive = idx === activeIdx;
              return (
                <div
                  key={o.id}
                  id={`dest-opt-${o.id}`}
                  role="option"
                  aria-selected={isSel}
                  onClick={() => onToggle(o.id)}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer ${isActive ? "bg-accent" : "hover:bg-accent"}`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                    {isSel && <Check className="h-3 w-3 text-primary-foreground" aria-hidden="true" />}
                  </div>
                  <span>{o.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
