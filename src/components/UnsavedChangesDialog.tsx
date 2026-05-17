import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  saving?: boolean;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

export default function UnsavedChangesDialog({
  open,
  saving = false,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
  title = "بيانات غير محفوظة",
  description = "لديك بيانات لم تُحفظ بعد. ماذا تريد أن تفعل قبل المغادرة؟",
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            إلغاء
          </Button>
          <Button type="button" variant="outline" onClick={onDiscardAndContinue} disabled={saving}>
            متابعة بدون حفظ
          </Button>
          <Button type="button" onClick={onSaveAndContinue} disabled={saving}>
            {saving ? "جارٍ الحفظ…" : "حفظ ومتابعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
