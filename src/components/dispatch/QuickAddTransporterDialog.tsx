import { useState, useEffect } from "react";
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

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (row: any) => void;
  initialName?: string;
};

export default function QuickAddTransporterDialog({ open, onOpenChange, onCreated, initialName }: Props) {
  // تجنّب تشغيل الـ hooks الداخلية (useQuery داخل useDestinations) عند إغلاق الحوار
  // كي لا نطالب المستهلكين باستدعاء الحوار داخل QueryClientProvider دائماً.
  if (!open) {
    return null as any;
  }
  return <QuickAddTransporterDialogInner open={open} onOpenChange={onOpenChange} onCreated={onCreated} initialName={initialName} />;
}

function QuickAddTransporterDialogInner({ open, onOpenChange, onCreated, initialName }: Props) {
  const qc = useQueryClient();
  const { data: destinations } = useDestinations();
  const [name, setName] = useState(initialName || "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [destIds, setDestIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // زامن الاسم كلما فُتح الحوار باسم مبدئي جديد
  useEffect(() => { if (open) setName(initialName || ""); }, [open, initialName]);

  const reset = () => {
    setName(""); setPhone(""); setAddress(""); setDestIds([]); setNotes("");
  };

  const toggleDest = (id: string) => {
    setDestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
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
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  const destList = (destinations as any[]) || [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
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
            <Label>الوجهات التي يوصّل إليها *</Label>
            <DestinationsMultiSelect
              options={destList}
              selectedIds={destIds}
              onToggle={toggleDest}
              onClear={(id) => setDestIds((prev) => prev.filter((x) => x !== id))}
            />
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
          <Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
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
}: {
  options: any[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filtered = search.trim()
    ? options.filter((o) => startsWithMatch(o.name, search))
    : options;

  const selectedOptions = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as any[];

  if (options.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2 text-center border border-border rounded-md bg-muted/30">
        لا توجد وجهات — أضف وجهات أولاً من صفحة إدارة الوجهات.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[38px] flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-right"
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground flex-1">اختر الوجهات...</span>
        ) : (
          selectedOptions.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-xs"
            >
              {o.name}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onClear(o.id); }}
              />
            </span>
          ))
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground mr-auto" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full h-8 rounded bg-muted px-7 text-xs outline-none"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-3">لا نتائج</div>
            ) : filtered.map((o: any) => {
              const isSel = selectedIds.includes(o.id);
              return (
                <div
                  key={o.id}
                  onClick={() => onToggle(o.id)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSel ? "bg-primary border-primary" : "border-border"}`}>
                    {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
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
