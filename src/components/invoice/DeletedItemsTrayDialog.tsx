import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";

interface TrashedItem {
  uid: string;
  product_name?: string;
  quantity?: number;
  total?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: { row: TrashedItem; at: number }[];
  onRestore: (uid: string) => void;
  onRestoreAll: () => void;
  onClearAll: () => void;
}

export default function DeletedItemsTrayDialog({
  open, onOpenChange, items, onRestore, onRestoreAll, onClearAll,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>البنود المحذوفة ({items.length})</DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            لا توجد بنود محذوفة.
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">المنتج</th>
                  <th className="p-2 text-center w-16">الكمية</th>
                  <th className="p-2 text-center w-24">المجموع</th>
                  <th className="p-2 text-center w-24">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.row.uid} className="border-t hover:bg-accent/30">
                    <td className="p-2">{t.row.product_name || "—"}</td>
                    <td className="p-2 text-center tabular-nums">{t.row.quantity ?? "—"}</td>
                    <td className="p-2 text-center tabular-nums">
                      {t.row.total != null ? Number(t.row.total).toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-center">
                      <Button size="sm" variant="outline" onClick={() => onRestore(t.row.uid)}>
                        <RotateCcw className="w-3 h-3 ml-1" />
                        استرجاع
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="gap-2">
          {items.length > 0 && (
            <>
              <Button variant="destructive" onClick={() => { onClearAll(); }}>
                <Trash2 className="w-4 h-4 ml-1" />
                إفراغ السلة
              </Button>
              <Button variant="default" onClick={() => { onRestoreAll(); onOpenChange(false); }}>
                استرجاع الكل
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
