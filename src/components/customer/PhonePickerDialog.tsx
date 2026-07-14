import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { normalizePhoneInput } from "@/utils/phoneNormalize";
import ContactPickerButton from "@/components/shared/ContactPickerButton";

/**
 * نافذة منبثقة صغيرة لتعديل/استيراد رقم هاتف عميل.
 * تفتح عند الضغط على خلية الهاتف في جدول العملاء.
 * - إدخال يدوي مع تطبيع فوري (أرقام لاتينية، بدون فراغات).
 * - زر «استيراد من جهات الاتصال» يفتح Contact Picker على الأجهزة المدعومة.
 * - تحقق اختياري (تكرار / صيغة واتساب) عبر prop `validate`.
 */
export type PhonePickerDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialValue?: string | null;
  customerName?: string;
  fieldLabel?: string;
  onSave: (normalized: string) => Promise<void> | void;
  validate?: (normalized: string) => string | null;
};

export default function PhonePickerDialog({
  open,
  onOpenChange,
  initialValue,
  customerName,
  fieldLabel = "رقم الهاتف",
  onSave,
  validate,
}: PhonePickerDialogProps) {
  const [value, setValue] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValue(normalizePhoneInput(initialValue || ""));
  }, [open, initialValue]);

  const error = validate ? validate(value) : null;

  const submit = async () => {
    if (error) {
      toast.error(error);
      return;
    }
    setBusy(true);
    try {
      await onSave(value);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {fieldLabel}
            {customerName ? <span className="text-muted-foreground text-sm font-normal"> — {customerName}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Label htmlFor="phone-picker-input">الرقم</Label>
          <div className="flex items-center gap-2">
            <input
              id="phone-picker-input"
              autoFocus
              dir="ltr"
              inputMode="tel"
              value={value}
              onChange={(e) => setValue(normalizePhoneInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submit(); }
              }}
              placeholder="مثال: +249912345678"
              className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-primary"
            />
            <ContactPickerButton
              onPicked={(c) => setValue(normalizePhoneInput(c.tel || ""))}
            />
          </div>
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              يمكنك الكتابة يدوياً أو استيراد الرقم من جهات الاتصال في الجهاز.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>إلغاء</Button>
          <Button onClick={submit} disabled={busy || !!error}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
