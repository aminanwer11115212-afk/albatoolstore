import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, RotateCcw, Send, Printer, Link2, ListChecks, Undo2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  printUnavailableItems,
  createUnavailableItemsShareLink,
  type UnavailableItemRow,
} from "@/utils/unavailableItemsShare";
import UnavailableItemsReviewDialog from "./UnavailableItemsReviewDialog";

interface DeletedRow {
  id: string;
  product_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  deleted_at: string;
  deleted_by: string | null;
  full_data?: any;
}

interface Props {
  isInvoice: boolean;
  docId: string;
  docNumber?: string;
  customerName?: string;
  customerPhone?: string;
  date?: string;
  company?: any;
  onRestored?: () => void;
  /** موضع الزر — inline (افتراضي) أو floating عائم */
  variant?: "inline" | "floating";
}

export default function UnavailableItemsPanel({
  isInvoice, docId, docNumber, customerName, customerPhone, date, company, onRestored,
  variant = "inline",
}: Props) {
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<"review" | "restore">("review");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [emptying, setEmptying] = useState(false);
  const emptyingRef = useRef(false);

  const table = isInvoice ? "deleted_invoice_items" : "deleted_quote_items";
  const fkField = isInvoice ? "invoice_id" : "quote_id";

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from(table).select("*").eq(fkField, docId)
      .order("deleted_at", { ascending: false });
    if (error) console.error("[unavailable]", error);
    else setRows((data || []) as DeletedRow[]);
    setLoading(false);
  }, [docId, table, fkField]);

  useEffect(() => { load(); }, [load]);

  const itemsForShare: UnavailableItemRow[] = useMemo(
    () => rows.map((r) => ({
      product_name: r.product_name || "—",
      quantity: r.quantity,
      unit: r.unit,
    })),
    [rows]
  );

  const shareCommonOpts = useMemo(() => ({
    isInvoice, docId, docNumber, customerName, customerPhone, date,
    rows: itemsForShare,
    company: company ? {
      company_name: company.company_name,
      phone: company.phone,
      address: company.address,
      logo_url: company.logo_url,
    } : null,
  }), [isInvoice, docId, docNumber, customerName, customerPhone, date, itemsForShare, company]);

  const restoreOneRow = async (row: DeletedRow) => {
    const targetTable = isInvoice ? "invoice_items" : "quote_items";
    const payload: any = {
      product_id: row.full_data?.product_id ?? null,
      product_name: row.product_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      discount: row.full_data?.discount ?? 0,
      discount_value: row.full_data?.discount_value ?? 0,
      format_discount: row.full_data?.format_discount ?? "percent",
      foreign_price: row.full_data?.foreign_price ?? null,
      unit: row.unit ?? null,
      tax_status: row.full_data?.tax_status ?? "default",
      total: row.total,
    };
    payload[fkField] = docId;
    const { error: insErr } = await (supabase as any).from(targetTable).insert(payload);
    if (insErr) throw insErr;
    await (supabase as any).from(table).delete().eq("id", row.id);
  };

  const handleRestore = async (row: DeletedRow) => {
    if (!confirm(`استرجاع "${row.product_name}"؟`)) return;
    setBusyId(row.id);
    try {
      await restoreOneRow(row);
      toast.success("تمت الاستعادة");
      await load();
      onRestored?.();
    } catch (e: any) {
      toast.error(e?.message || "فشلت الاستعادة");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: DeletedRow) => {
    if (!confirm(`حذف "${row.product_name}" نهائياً؟`)) return;
    setBusyId(row.id);
    try {
      const { error } = await (supabase as any).from(table).delete().eq("id", row.id);
      if (error) throw error;
      toast.success("تم الحذف النهائي");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحذف");
    } finally {
      setBusyId(null);
    }
  };

  const handleEmptyAll = async () => {
    if (emptyingRef.current) return;
    emptyingRef.current = true;
    setEmptying(true);
    try {
      const { error } = await (supabase as any)
        .from(table).delete().eq(fkField, docId);
      if (error) throw error;
      toast.success(`تم إفراغ سلة المحذوفات (${rows.length} صنف)`);
      setEmptyConfirmOpen(false);
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "فشل إفراغ السلة");
    } finally {
      emptyingRef.current = false;
      setEmptying(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = await createUnavailableItemsShareLink({ isInvoice, docId });
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط المشاركة", { description: url });
    } catch (e: any) {
      toast.error(e?.message || "فشل إنشاء الرابط");
    }
  };

  const handleRestoreSelected = async (ids: string[]) => {
    setBulkBusy(true);
    let ok = 0, fail = 0;
    try {
      for (const id of ids) {
        const row = rows.find(r => r.id === id);
        if (!row) continue;
        try { await restoreOneRow(row); ok++; }
        catch (e: any) { console.error("[restore]", e); fail++; }
      }
      if (ok > 0) toast.success(`تم استرجاع ${ok} صنف${fail ? ` (فشل ${fail})` : ""}`);
      else if (fail > 0) toast.error(`فشل استرجاع ${fail} صنف`);
      await load();
      onRestored?.();
    } finally {
      setBulkBusy(false);
    }
  };

  // إخفاء تام إن لم توجد أصناف محذوفة
  if (!loading && rows.length === 0) return null;

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className={
        variant === "floating"
          ? "fixed bottom-20 left-4 z-40 h-12 w-12 rounded-full p-0 shadow-lg border-destructive/40 bg-background hover:bg-destructive/10"
          : "gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      }
      aria-label={`سلة المحذوفات — ${rows.length}`}
      title={`سلة المحذوفات (${rows.length})`}
    >
      <div className="relative flex items-center gap-2">
        <Trash2 className="h-4 w-4" />
        {variant === "inline" && <span className="text-xs font-semibold">سلة المحذوفات</span>}
        <span
          className={
            "absolute -top-2 -end-2 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
          }
        >
          {rows.length}
        </span>
      </div>
    </Button>
  );

  return (
    <>
      {triggerButton}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Trash2 className="h-5 w-5 text-destructive" />
              سلة المحذوفات ({rows.length})
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm" variant="outline" className="gap-1"
              onClick={() => { setReviewMode("restore"); setReviewOpen(true); }}
              disabled={bulkBusy || rows.length === 0}
            >
              <Undo2 className="h-3.5 w-3.5" /> استرجاع الكل
            </Button>
            <Button
              size="sm" variant="secondary" className="gap-1"
              onClick={() => { setReviewMode("review"); setReviewOpen(true); }}
              disabled={rows.length === 0}
            >
              <ListChecks className="h-3.5 w-3.5" /> مراجعة و إرسال
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="gap-1" disabled={rows.length === 0}>
                  <Send className="h-3.5 w-3.5" /> إرسال
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[100]">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Link2 className="h-4 w-4 ml-2" />
                  نسخ رابط مشاركة عام
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => printUnavailableItems(shareCommonOpts)}>
                  <Printer className="h-4 w-4 ml-2" />
                  طباعة / PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setEmptyConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  إفراغ السلة نهائياً
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="max-h-[55vh] overflow-auto border border-border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-right">الصنف</th>
                  <th className="p-2 text-center w-20">الكمية</th>
                  <th className="p-2 text-center w-24">السعر</th>
                  <th className="p-2 text-center w-32">تاريخ الحذف</th>
                  <th className="p-2 text-center w-24">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-accent/30">
                    <td className="p-2">{r.product_name || "—"}</td>
                    <td className="p-2 text-center tabular-nums">
                      {r.quantity ?? "—"}{r.unit ? ` ${r.unit}` : ""}
                    </td>
                    <td className="p-2 text-center tabular-nums">
                      {r.unit_price != null ? Number(r.unit_price).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-center text-muted-foreground text-[10px]">
                      {new Date(r.deleted_at).toLocaleString("ar-EG", {
                        dateStyle: "short", timeStyle: "short",
                      })}
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm" variant="outline" className="h-7 px-2"
                          disabled={busyId === r.id}
                          onClick={() => handleRestore(r)}
                          title="استرجاع"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          disabled={busyId === r.id}
                          onClick={() => handleDelete(r)}
                          title="حذف نهائي"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={emptyConfirmOpen} onOpenChange={setEmptyConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إفراغ سلة المحذوفات نهائياً؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف {rows.length} صنف نهائياً من السجل ولن يمكن استرجاعها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptying}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleEmptyAll(); }}
              disabled={emptying}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {emptying ? <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جارٍ الإفراغ...</> : "إفراغ نهائياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnavailableItemsReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        rows={rows.map(r => ({
          id: r.id,
          product_name: r.product_name,
          quantity: r.quantity,
          unit: r.unit,
          unit_price: r.unit_price,
          deleted_at: r.deleted_at,
        }))}
        shareOpts={shareCommonOpts}
        onRestoreSelected={handleRestoreSelected}
        initialMode={reviewMode}
      />
    </>
  );
}
