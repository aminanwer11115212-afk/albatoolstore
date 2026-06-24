import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (row: any) => void;
};

export default function QuickAddTransporterDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName(""); setPhone(""); setVehicleType(""); setVehicleNumber(""); setNotes("");
  };

  const save = async () => {
    if (!name.trim()) { toast.error("الاسم مطلوب"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("transporters").insert({
        name: name.trim(),
        phone: phone.trim() || null,
        vehicle_type: vehicleType.trim() || null,
        vehicle_number: vehicleNumber.trim() || null,
        notes: notes.trim() || null,
      }).select().single();
      if (error) throw error;
      toast.success("تمت إضافة الناقل بنجاح", {
        description: `«${data?.name ?? name.trim()}» متاح الآن في قائمة الناقلين`,
      });
      await qc.invalidateQueries({ queryKey: ["transporters"] });
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
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tr-phone">الهاتف</Label>
              <Input id="tr-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxx" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tr-vtype">نوع المركبة</Label>
              <Input id="tr-vtype" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="شاحنة / بكب…" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-vnum">رقم المركبة</Label>
            <Input id="tr-vnum" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
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
