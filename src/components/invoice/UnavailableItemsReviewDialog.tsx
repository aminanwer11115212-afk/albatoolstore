import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageCircle, Printer, RotateCcw, ListChecks } from "lucide-react";
import {
  buildUnavailableItemsWhatsAppText,
  printUnavailableItems,
  type UnavailableItemRow,
  type UnavailableShareOpts,
} from "@/utils/unavailableItemsShare";
import { openWhatsApp } from "@/utils/whatsapp";

interface DeletedRowLite {
  id: string;
  product_name: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price?: number | null;
  deleted_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: DeletedRowLite[];
  shareOpts: Omit<UnavailableShareOpts, "rows">;
  /** يُستدعى بمعرّفات البنود المختارة للاسترجاع */
  onRestoreSelected: (ids: string[]) => Promise<void> | void;
  /** mode: مراجعة/إرسال أو استرجاع */
  initialMode?: "review" | "restore";
}

export default function UnavailableItemsReviewDialog({
  open, onOpenChange, rows, shareOpts, onRestoreSelected, initialMode = "review",
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"review" | "restore">(initialMode);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(new Set(rows.map(r => r.id)));
      setMode(initialMode);
    }
  }, [open, rows, initialMode]);

  const selectedRows = useMemo(
    () => rows.filter(r => selected.has(r.id)),
    [rows, selected]
  );

  const itemsForShare: UnavailableItemRow[] = useMemo(
    () => selectedRows.map(r => ({
      product_name: r.product_name || "—",
      quantity: r.quantity,
      unit: r.unit,
    })),
    [selectedRows]
  );

  useEffect(() => {
    if (!open || mode !== "review") return;
    setMessage(buildUnavailableItemsWhatsAppText({
      isInvoice: shareOpts.isInvoice,
      docNumber: shareOpts.docNumber,
      customerName: shareOpts.customerName,
      rows: itemsForShare,
      companyName: shareOpts.company?.company_name,
    }));
  }, [open, mode, itemsForShare, shareOpts]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const allChecked = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(rows.map(r => r.id)));
  };

  const handleWhatsApp = () => {
    if (selectedRows.length === 0) return;
    openWhatsApp(shareOpts.customerPhone, message);
    onOpenChange(false);
  };

  const handlePrint = () => {
    if (selectedRows.length === 0) return;
    printUnavailableItems({ ...shareOpts, rows: itemsForShare });
    onOpenChange(false);
  };

  const handleRestore = async () => {
    if (selectedRows.length === 0) return;
    setBusy(true);
    try {
      await onRestoreSelected(Array.from(selected));
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            مراجعة الأصناف غير المتوفرة ({rows.length})
          </DialogTitle>
          <DialogDescription>
            راجع البنود المحذوفة من {shareOpts.isInvoice ? "الفاتورة" : "عرض السعر"}{shareOpts.docNumber ? ` رقم ${shareOpts.docNumber}` : ""}، ثم اختر ما تريد إرساله للعميل أو إعادته للمستند.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="review">إرسال للعميل</TabsTrigger>
            <TabsTrigger value="restore">استرجاع للمستند</TabsTrigger>
          </TabsList>

          {/* قائمة البنود مشتركة */}
          <div className="border rounded mt-3 max-h-[35vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 w-10 text-center">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="تحديد الكل" />
                  </th>
                  <th className="p-2 text-right">الصنف</th>
                  <th className="p-2 text-center w-24">الكمية</th>
                  <th className="p-2 text-center w-32">تاريخ الحذف</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-accent/30">
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                        aria-label={r.product_name || ""}
                      />
                    </td>
                    <td className="p-2">{r.product_name || "—"}</td>
                    <td className="p-2 text-center tabular-nums">
                      {r.quantity ?? "—"}{r.unit ? ` ${r.unit}` : ""}
                    </td>
                    <td className="p-2 text-center text-muted-foreground" style={{ fontSize: 10 }}>
                      {new Date(r.deleted_at).toLocaleString("ar-EG", {
                        dateStyle: "short", timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground mt-1">
            المحدد: {selected.size} من {rows.length}
          </div>

          <TabsContent value="review" className="mt-3 space-y-2 overflow-y-auto">
            <label className="text-xs font-semibold">نص الرسالة (قابل للتعديل قبل الإرسال)</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="text-xs font-mono"
              dir="rtl"
            />
          </TabsContent>

          <TabsContent value="restore" className="mt-3 overflow-y-auto">
            <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-sm">
              سيتم إرجاع البنود المحددة إلى {shareOpts.isInvoice ? "الفاتورة" : "عرض السعر"}، وإزالتها من سلة المحذوفات.
              تأكد من مراجعة القائمة قبل التأكيد.
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          {mode === "review" ? (
            <>
              <Button
                variant="outline"
                onClick={handlePrint}
                disabled={selectedRows.length === 0}
              >
                <Printer className="h-4 w-4 ml-1" />
                طباعة / PDF
              </Button>
              <Button
                onClick={handleWhatsApp}
                disabled={selectedRows.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <MessageCircle className="h-4 w-4 ml-1" />
                إرسال واتساب
              </Button>
            </>
          ) : (
            <Button
              onClick={handleRestore}
              disabled={selectedRows.length === 0 || busy}
            >
              <RotateCcw className="h-4 w-4 ml-1" />
              {busy ? "جارٍ الاسترجاع..." : `استرجاع (${selectedRows.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
