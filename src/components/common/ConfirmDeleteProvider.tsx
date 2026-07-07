import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Unified confirm-delete dialog for all admin tables.
 *
 * Usage:
 *   const confirmDelete = useConfirmDelete();
 *   confirmDelete({
 *     title: "حذف الفاتورة",
 *     description: "هل أنت متأكد؟ سيتم إرجاع الكميات إلى المخزون.",
 *     onConfirm: async () => { await doDelete(id); },
 *   });
 *
 * Handles: loading spinner on confirm button, error toast on failure,
 * closes automatically on success.
 */

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  onConfirm: () => void | Promise<void>;
};

type Ctx = (opts: ConfirmOptions) => void;

const ConfirmDeleteContext = createContext<Ctx | null>(null);

export function ConfirmDeleteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const optsRef = useRef<ConfirmOptions | null>(null);

  const request = useCallback<Ctx>((o) => {
    optsRef.current = o;
    setOpts(o);
    setPending(false);
    setOpen(true);
  }, []);

  const handleConfirm = async () => {
    const o = optsRef.current;
    if (!o) return;
    setPending(true);
    try {
      await o.onConfirm();
      if (o.successMessage) toast.success(o.successMessage);
      setOpen(false);
    } catch (e: any) {
      toast.error(o.errorMessage || e?.message || "تعذّر الحذف");
      setPending(false);
    }
  };

  return (
    <ConfirmDeleteContext.Provider value={request}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!pending) setOpen(v); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title || "تأكيد الحذف"}</AlertDialogTitle>
            <AlertDialogDescription>
              {opts?.description || "هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={pending}>
              {opts?.cancelLabel || "إلغاء"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحذف...
                </span>
              ) : (opts?.confirmLabel || "حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmDeleteContext.Provider>
  );
}

export function useConfirmDelete() {
  const ctx = useContext(ConfirmDeleteContext);
  if (!ctx) throw new Error("useConfirmDelete must be used inside <ConfirmDeleteProvider>");
  return ctx;
}
