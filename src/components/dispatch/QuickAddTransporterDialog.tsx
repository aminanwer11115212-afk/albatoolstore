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
            <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 bg-muted/30">
              {destList.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2 text-center">
                  لا توجد وجهات — أضف وجهات أولاً من صفحة إدارة الوجهات.
                </div>
              ) : destList.map((d: any) => (
                <label key={d.id} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={destIds.includes(d.id)}
                    onChange={() => toggleDest(d.id)}
                    className="w-4 h-4"
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
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
