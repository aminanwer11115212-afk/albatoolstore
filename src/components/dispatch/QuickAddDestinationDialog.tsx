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

export default function QuickAddDestinationDialog({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setDescription(""); };

  const save = async () => {
    if (!name.trim()) { toast.error("اسم الوجهة مطلوب"); return; }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("destinations").insert({
        name: name.trim(),
        description: description.trim() || null,
      }).select().single();
      if (error) throw error;
      toast.success("تمت إضافة الوجهة بنجاح", {
        description: `«${data?.name ?? name.trim()}» متاحة الآن في قائمة الوجهات`,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["destinations"] }),
        qc.invalidateQueries({ queryKey: ["table", "destinations"] }),
      ]);
      await qc.refetchQueries({ queryKey: ["destinations"], type: "active" });
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
          <DialogTitle>إضافة وجهة جديدة</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ds-name">اسم الوجهة *</Label>
            <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="الخرطوم / بحري…" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ds-desc">وصف</Label>
            <Textarea id="ds-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
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
