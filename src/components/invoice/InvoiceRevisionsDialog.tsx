import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History, User, Clock } from "lucide-react";
import { toast } from "sonner";
import { useDialogSize } from "@/hooks/useDialogSize";

interface Props {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: "إنشاء", color: "bg-emerald-500" },
  update: { label: "تعديل", color: "bg-blue-500" },
  delete: { label: "حذف", color: "bg-red-500" },
  status_change: { label: "تغيير الحالة", color: "bg-amber-500" },
  payment: { label: "دفعة", color: "bg-purple-500" },
  convert: { label: "تحويل", color: "bg-cyan-500" },
};

export default function InvoiceRevisionsDialog({ invoiceId, open, onOpenChange }: Props) {
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { dlgRef, dlgStyle } = useDialogSize("invoice_revisions_dialog", open, { w: "min(680px, 96vw)", h: "80vh" });

  useEffect(() => {
    if (!open || !invoiceId) return;
    setLoading(true);
    (supabase as any).from("invoice_revisions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("revision_number", { ascending: false })
      .then(({ data }: any) => {
        setRevisions(data || []);
        setLoading(false);
      });
  }, [open, invoiceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dlgRef} style={{ ...dlgStyle, overflowY: "auto" }} dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            سجل التعديلات ({revisions.length})
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="text-center py-6 text-muted-foreground">جاري التحميل...</div>}

        {!loading && revisions.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>لا توجد تعديلات مسجّلة</p>
          </div>
        )}

        <div className="space-y-3">
          {revisions.map((rev) => {
            const meta = ACTION_LABELS[rev.action] || { label: rev.action, color: "bg-muted-foreground" };
            const changes = rev.changes as Record<string, { before: any; after: any }> | null;
            return (
              <div key={rev.id} className="border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`${meta.color} text-white`}>#{rev.revision_number} {meta.label}</Badge>
                    {rev.changed_by && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {rev.changed_by}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {new Date(rev.created_at).toLocaleString("ar-EG")}
                  </span>
                </div>

                {rev.note && <p className="text-sm text-muted-foreground mb-2">{rev.note}</p>}

                {changes && Object.keys(changes).length > 0 && (
                  <div className="bg-muted/40 rounded p-2 text-xs space-y-1">
                    {Object.entries(changes).map(([field, val]) => (
                      <div key={field} className="grid grid-cols-3 gap-2">
                        <span className="font-mono font-medium">{field}</span>
                        <span className="text-destructive line-through truncate" title={String(val.before)}>
                          {String(val.before ?? "—")}
                        </span>
                        <span className="text-emerald-600 truncate" title={String(val.after)}>
                          {String(val.after ?? "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
