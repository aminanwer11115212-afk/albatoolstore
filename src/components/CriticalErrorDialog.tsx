// components/CriticalErrorDialog.tsx
// حوار مركزي لعرض الأخطاء الحرجة برسائل عربية واضحة + تفاصيل تقنية قابلة للنسخ.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { subscribeCriticalError, type CriticalErrorPayload } from "@/utils/errorReporter";
import { AlertTriangle, Copy } from "lucide-react";

export default function CriticalErrorDialog() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<CriticalErrorPayload | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    return subscribeCriticalError((p) => {
      setPayload(p);
      setShowDetails(false);
      setOpen(true);
    });
  }, []);

  const copyDetails = async () => {
    if (!payload) return;
    const text = `${payload.title}\n${payload.message}\n\n${payload.details || ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم نسخ التفاصيل");
    } catch {
      toast.error("تعذّر النسخ — انسخ يدوياً من الحوار");
    }
  };

  if (!payload) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            {payload.title}
          </DialogTitle>
          <DialogDescription className="text-foreground text-right">
            {payload.message}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground text-right">
          يمكنك المحاولة من جديد. إذا تكرر الفشل، انسخ التفاصيل التقنية وأرسلها للدعم الفني.
        </div>

        {showDetails && payload.details && (
          <pre
            className="max-h-56 overflow-auto rounded-md border bg-muted p-2 text-[11px] leading-5 text-right whitespace-pre-wrap select-all"
            dir="ltr"
          >
            {payload.details}
          </pre>
        )}

        <DialogFooter className="gap-2 sm:justify-between flex-row-reverse">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDetails((s) => !s)}>
              {showDetails ? "إخفاء التفاصيل" : "عرض التفاصيل التقنية"}
            </Button>
            <Button variant="outline" size="sm" onClick={copyDetails}>
              <Copy className="w-3.5 h-3.5 ml-1" />
              نسخ التفاصيل
            </Button>
          </div>
          <Button onClick={() => setOpen(false)}>حسناً</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
