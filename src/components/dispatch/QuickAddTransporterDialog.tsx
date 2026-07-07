import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDestinations } from "@/hooks/useData";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (row: any) => void;
};

export default function QuickAddTransporterDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const { data: destinations } = useDestinations();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [destIds, setDestIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName(""); setPhone(""); setAddress(""); setDestIds(new Set()); setNotes("");
  };

  const toggleDest = (id: string) => {
    setDestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) { toast.error("الاسم مطلوب"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("transporters").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      }).select().single();
      if (error) throw error;

      if (data?.id && destIds.size > 0) {
        const links = Array.from(destIds).map((destination_id) => ({
          transporter_id: data.id,
          destination_id,
        }));
        const { error: linkErr } = await (supabase as any).from("destination_transporters").insert(links);
        if (linkErr) throw linkErr;
      }

      toast.success("تمت إضافة الناقل بنجاح", {
        description: `«${data?.name ?? name.trim()}» متاح الآن في قائمة الناقلين`,
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
            <Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الناقل" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-phone">الهاتف</Label>
            <Input id="tr-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxx" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-address">العنوان</Label>
            <Input id="tr-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان الذي يظهر في تقارير الترحيل" />
          </div>
          <div className="grid gap-1.5">
            <Label>الوجهات التي يوصّل إليها</Label>
            <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 bg-muted/30">
              {destList.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2 text-center">لا توجد وجهات بعد</div>
              ) : destList.map((d: any) => (
                <label key={d.id} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={destIds.has(d.id)}
                    onChange={() => toggleDest(d.id)}
                    className="w-4 h-4"
                  />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-notes">ملاحظات</Label>
            <Textarea id="tr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
