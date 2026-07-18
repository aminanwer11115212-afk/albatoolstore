import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Send, Printer, Link2, Trash2, RotateCcw, AlertTriangle, ListChecks, Undo2 } from "lucide-react";
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
  /** نوع المستند */
  isInvoice: boolean;
  /** معرّف الفاتورة أو عرض السعر */
  docId: string;
  docNumber?: string;
  customerName?: string;
  customerPhone?: string;
  date?: string;
  company?: any;
  /** يُستدعى بعد عملية استرجاع لطلب إعادة قراءة بنود الفاتورة */
  onRestored?: () => void;
}

export default function UnavailableItemsPanel({
  isInvoice, docId, docNumber, customerName, customerPhone, date, company, onRestored,
}: Props) {
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const table = isInvoice ? "deleted_invoice_items" : "deleted_quote_items";
  const fkField = isInvoice ? "invoice_id" : "quote_id";

  const load = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from(table).select("*").eq(fkField, docId)
      .order("deleted_at", { ascending: false });
    if (error) {
      console.error("[unavailable]", error);
    } else {
      setRows((data || []) as DeletedRow[]);
    }
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

  const handleRestore = async (row: DeletedRow) => {
    if (!confirm(`استرجاع "${row.product_name}" إلى ${isInvoice ? "الفاتورة" : "عرض السعر"}؟`)) return;
    setBusyId(row.id);
    try {
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
      // حذف من الأرشيف بعد الاسترجاع
      await (supabase as any).from(table).delete().eq("id", row.id);
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
    if (!confirm(`حذف "${row.product_name}" نهائياً من السجل؟`)) return;
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

  const handleCopyLink = async () => {
    try {
      const url = await createUnavailableItemsShareLink({ isInvoice, docId });
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط المشاركة", { description: url });
    } catch (e: any) {
      toast.error(e?.message || "فشل إنشاء الرابط");
    }
  };

  if (!loading && rows.length === 0) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5 mb-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-right flex-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <CardTitle className="text-sm">
                  أصناف غير متوفرة من {isInvoice ? "الفاتورة" : "عرض السعر"} ({rows.length})
                </CardTitle>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            {rows.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="default" className="gap-1">
                    <Send className="h-3.5 w-3.5" />
                    إرسال للعميل
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[100]">
                  <DropdownMenuItem onClick={() => shareUnavailableItemsViaWhatsApp(shareCommonOpts)}>
                    <MessageCircle className="h-4 w-4 ml-2 text-green-600" />
                    واتساب (نص جاهز)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCopyLink}>
                    <Link2 className="h-4 w-4 ml-2 text-blue-600" />
                    نسخ رابط مشاركة
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => printUnavailableItems(shareCommonOpts)}>
                    <Printer className="h-4 w-4 ml-2 text-purple-600" />
                    طباعة / PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-right">الصنف</th>
                    <th className="p-2 text-center w-20">الكمية</th>
                    <th className="p-2 text-center w-24">السعر</th>
                    <th className="p-2 text-center w-32">تاريخ الحذف</th>
                    <th className="p-2 text-center w-32">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-accent/30">
                      <td className="p-2">{r.product_name || "—"}</td>
                      <td className="p-2 text-center tabular-nums">
                        {r.quantity ?? "—"}{r.unit ? ` ${r.unit}` : ""}
                      </td>
                      <td className="p-2 text-center tabular-nums">
                        {r.unit_price != null ? Number(r.unit_price).toLocaleString() : "—"}
                      </td>
                      <td className="p-2 text-center text-muted-foreground" style={{ fontSize: 10 }}>
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
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
                            disabled={busyId === r.id}
                            onClick={() => handleDelete(r)}
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
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
