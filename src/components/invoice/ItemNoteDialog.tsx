import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  initialValue?: string;
  productName?: string;
  onSave: (text: string) => void;
  onClose: () => void;
}

export default function ItemNoteDialog({ open, initialValue, productName, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(initialValue || "");

  useEffect(() => {
    if (open) setDraft(initialValue || "");
  }, [open, initialValue]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            ملاحظة على البند {productName ? `— ${productName}` : ""}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="اكتب ملاحظة على هذا البند... (Enter لسطر جديد)"
          rows={6}
          className="resize-none"
          autoFocus
        />
        <DialogFooter className="gap-2">
          {initialValue ? (
            <Button variant="destructive" onClick={() => { onSave(""); onClose(); }}>
              حذف
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => { onSave(draft); onClose(); }}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
