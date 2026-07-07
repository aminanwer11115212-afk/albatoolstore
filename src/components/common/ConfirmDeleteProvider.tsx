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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Unified confirm-delete dialog for all admin tables.
 *
 * Basic usage:
 *   const confirmDelete = useConfirmDelete();
 *   confirmDelete({
 *     title: "حذف الفاتورة",
 *     description: "هل أنت متأكد؟ سيتم إرجاع الكميات إلى المخزون.",
 *     onConfirm: async () => { await doDelete(id); },
 *   });
 *
 * With an optional extra checkbox (e.g. "also delete auxiliary products"):
 *   confirmDelete({
 *     title: "حذف أمر الشراء",
 *     description: "...",
 *     extraCheckbox: {
 *       label: `احذف أيضاً ${n} منتج أُضيف عبر هذا الأمر ولا يُستخدم في مكان آخر`,
 *       defaultChecked: false,
 *     },
 *     onConfirm: async ({ extraChecked }) => { ... },
 *   });
 */

type ExtraCheckbox = {
  label: string;
  defaultChecked?: boolean;
  hint?: string;
};

type ConfirmContext = { extraChecked: boolean };

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  extraCheckbox?: ExtraCheckbox;
  onConfirm: (ctx: ConfirmContext) => void | Promise<void>;
};

type Ctx = (opts: ConfirmOptions) => void;

const ConfirmDeleteContext = createContext<Ctx | null>(null);

export function ConfirmDeleteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [extraChecked, setExtraChecked] = useState(false);
  const optsRef = useRef<ConfirmOptions | null>(null);

  const request = useCallback<Ctx>((o) => {
    optsRef.current = o;
    setOpts(o);
    setExtraChecked(!!o.extraCheckbox?.defaultChecked);
    setPending(false);
    setOpen(true);
  }, []);

  const handleConfirm = async () => {
    const o = optsRef.current;
    if (!o) return;
    setPending(true);
    try {
      await o.onConfirm({ extraChecked });
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

          {opts?.extraCheckbox ? (
            <label
              className="mt-2 flex items-start gap-3 rounded-md border border-border/60 bg-muted/40 p-3 cursor-pointer select-none"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={extraChecked}
                onCheckedChange={(v) => setExtraChecked(v === true)}
                disabled={pending}
                className="mt-0.5"
              />
              <div className="flex-1 text-sm leading-relaxed">
                <div className="font-semibold">{opts.extraCheckbox.label}</div>
                {opts.extraCheckbox.hint ? (
                  <div className="mt-1 text-xs text-muted-foreground">{opts.extraCheckbox.hint}</div>
                ) : null}
              </div>
            </label>
          ) : null}

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

