import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from "@/hooks/useData";
import { Button } from "@/components/ui/button";
import { FileText, Printer, ArrowRight, Truck, Package } from "lucide-react";
import {
  generateTransportReportHTML,
  generatePackagingReportHTML,
  openReportPrintWindow,
} from "@/utils/transportPackagingPrint";

interface Props {
  docType?: "invoice" | "quote";
  mode?: "transport" | "packaging";
}

export default function TransportPackagingReportPage({ docType = "invoice", mode = "transport" }: Props) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;

  const [doc, setDoc] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isInvoice = docType === "invoice";
  const isTransport = mode === "transport";

  const tableMain = isInvoice ? "invoices" : "quotes";
  const tableChild = isInvoice
    ? (isTransport ? "invoice_transports" : "invoice_packaging")
    : (isTransport ? "quote_transports" : "quote_packaging");
  const fkColumn = isInvoice
    ? (isTransport ? "invoice_id" : "invoice_id")
    : (isTransport ? "quote_id" : "quote_id");
  const docNumberField = isInvoice ? "invoice_number" : "quote_number";

  useEffect(() => { loadData();   }, [id, docType, mode]);

  const loadData = async () => {
    if (!id) return;
    setLoading(true);

    try {
      const docRes = await supabase
        .from(tableMain as any)
        .select("*, customers(name, phone, address)")
        .eq("id", id)
        .single();

      // فحص خطأ الاستعلام الرئيسي — وإلا الـUI يعرض "غير موجود" بدل سبب الفشل الحقيقي.
      if (docRes.error) {
        console.error("[loadData] main doc query failed:", docRes.error);
        toast.error(`تعذّر تحميل الوثيقة: ${docRes.error.message}`);
        setDoc(null);
        setRows([]);
        setLoading(false);
        return;
      }

      let childRows: any[] = [];
      if (isTransport) {
        const { data, error } = await supabase
          .from(tableChild as any)
          .select("*, transporters(name), destinations(name)")
          .eq(fkColumn, id);
        if (error) {
          console.error("[loadData] child rows (transport) failed:", error);
          toast.error(`تعذّر تحميل بيانات الترحيل: ${error.message}`);
        }
        childRows = (data as any[]) || [];
      } else {
        const headerTable = isInvoice ? "invoice_packaging" : "quotes_packaging";
        const itemsTable = isInvoice ? "invoices_packaging_items" : "quotes_packaging_items";
        const fkItem = isInvoice ? "invoice_packaging_id" : "quote_packaging_id";

        const { data: headers, error: hErr } = await (supabase as any)
          .from(headerTable).select("id").eq(fkColumn, id);
        if (hErr) {
          console.error("[loadData] packaging headers failed:", hErr);
          toast.error(`تعذّر تحميل رؤوس التغليف: ${hErr.message}`);
        }
        const headerIds = (headers || []).map((h: any) => h.id);
        if (headerIds.length) {
          const { data, error: itErr } = await (supabase as any)
            .from(itemsTable)
            .select("*, packaging_types(name)")
            .in(fkItem, headerIds);
          if (itErr) {
            console.error("[loadData] packaging items failed:", itErr);
            toast.error(`تعذّر تحميل بنود التغليف: ${itErr.message}`);
          }
          childRows = (data as any[]) || [];
        }
      }

      setDoc(docRes.data);
      setRows(childRows);
    } catch (e: any) {
      console.error("[loadData] unexpected error:", e);
      toast.error(`خطأ غير متوقع: ${e?.message || e}`);
      setDoc(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!doc) return;
    const docInfo = {
      number: (doc as any)[docNumberField],
      date: (doc as any).date || (doc as any).created_at?.slice(0, 10),
      customerName: (doc as any).customers?.name || "كاش",
      customerPhone: (doc as any).customers?.phone,
      customerAddress: (doc as any).customers?.address,
    };

    if (!isTransport) {
      // التغليف: استخدم صفحة المعاينة الداخلية (نفس تجربة معاينة عرض السعر)
      navigate(`/preview/${docType}/${id}/packaging`);
      return;
    }

    const html = generateTransportReportHTML({
      docType,
      doc: docInfo,
      company,
      rows: rows.map((r: any) => ({
        transporter: r.transporters?.name,
        destination: r.destinations?.name,
        date: r.transport_date,
        vehicle: r.vehicle_number,
        driver: r.driver_name,
        cost: r.cost,
        notes: r.notes,
      })),
    });

    openReportPrintWindow(html);
  };

  const totalCost = rows.reduce(
    (s, r) => s + Number((r as any)[isTransport ? "cost" : "total"] || 0),
    0,
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (!doc) return (
    <div className="text-center py-20 text-muted-foreground">
      <FileText size={48} className="mx-auto mb-3 opacity-30" />
      <p>{isInvoice ? "الفاتورة" : "عرض السعر"} غير موجود</p>
    </div>
  );

  const Icon = isTransport ? Truck : Package;
  const reportTitle = isTransport
    ? `تقرير ترحيل ${isInvoice ? "الفاتورة" : "عرض السعر"}`
    : `تقرير تغليف ${isInvoice ? "الفاتورة" : "عرض السعر"}`;
  const accentColor = isTransport ? "bg-green-600" : "bg-teal-600";
  const accentBg = isTransport ? "bg-green-50 dark:bg-green-900/20" : "bg-teal-50 dark:bg-teal-900/20";
  const accentText = isTransport ? "text-green-600" : "text-teal-600";
  const docNumber = (doc as any)[docNumberField];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${accentColor} rounded-lg flex items-center justify-center`}>
            <Icon className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{reportTitle}</h1>
            <p className="text-sm text-muted-foreground">
              #{docNumber} - {(doc as any).customers?.name || "كاش"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Printer size={16} /> طباعة التقرير
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(isInvoice ? `/invoices/view/${id}` : `/quotes/view/${id}`)}
            className="gap-2"
          >
            <ArrowRight size={16} /> العودة
          </Button>
        </div>
      </div>

      <div className="legacy-card card-block p-6 print:shadow-none print:border-none">
        <div className="flex items-start justify-between mb-6 pb-4 border-b border-border">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{company?.company_name || "الشركة"}</h2>
            {company?.phone && <p className="text-sm text-muted-foreground">الهاتف: {company.phone}</p>}
            {company?.address && <p className="text-sm text-muted-foreground">{company.address}</p>}
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-foreground">{reportTitle}</p>
            <p className="text-sm text-muted-foreground">رقم: {docNumber}</p>
            <p className="text-sm text-muted-foreground">التاريخ: {(doc as any).date || ""}</p>
            <p className="text-sm text-muted-foreground">العميل: {(doc as any).customers?.name || "كاش"}</p>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <Icon size={16} className={accentText} />
            {isTransport ? "سجلات الترحيل" : "سجلات التغليف"} ({rows.length})
          </h3>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center bg-muted rounded-lg">
              لا توجد سجلات {isTransport ? "ترحيل" : "تغليف"}
            </p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className={accentBg}>
                    <th className="px-3 py-2 text-right font-semibold">#</th>
                    {isTransport ? (
                      <>
                        <th className="px-3 py-2 text-right font-semibold">الناقل</th>
                        <th className="px-3 py-2 text-right font-semibold">الوجهة</th>
                        <th className="px-3 py-2 text-center font-semibold">التاريخ</th>
                        <th className="px-3 py-2 text-center font-semibold">المركبة</th>
                        <th className="px-3 py-2 text-center font-semibold">السائق</th>
                        <th className="px-3 py-2 text-center font-semibold">التكلفة</th>
                        <th className="px-3 py-2 text-right font-semibold">ملاحظات</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2 text-right font-semibold">نوع التغليف</th>
                        <th className="px-3 py-2 text-right font-semibold">الصنف</th>
                        <th className="px-3 py-2 text-center font-semibold">الكمية</th>
                        <th className="px-3 py-2 text-center font-semibold">الوزن</th>
                        <th className="px-3 py-2 text-center font-semibold">الأبعاد</th>
                        <th className="px-3 py-2 text-center font-semibold">التكلفة</th>
                        <th className="px-3 py-2 text-right font-semibold">ملاحظات</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any, i) => (
                    <tr key={r.id} className="border-b border-border">
                      <td className="px-3 py-2">{i + 1}</td>
                      {isTransport ? (
                        <>
                          <td className="px-3 py-2">{r.transporters?.name || "-"}</td>
                          <td className="px-3 py-2">{r.destinations?.name || "-"}</td>
                          <td className="px-3 py-2 text-center">{r.transport_date}</td>
                          <td className="px-3 py-2 text-center">{r.vehicle_number || "-"}</td>
                          <td className="px-3 py-2 text-center">{r.driver_name || "-"}</td>
                          <td className="px-3 py-2 text-center">{Number(r.cost || 0).toLocaleString()}</td>
                          <td className="px-3 py-2">{r.notes || "-"}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{r.packaging_types?.name || "-"}</td>
                          <td className="px-3 py-2">{r.product_name || "-"}</td>
                          <td className="px-3 py-2 text-center">
                            {(() => {
                              const packs = Number(r.packs_count ?? 1);
                              const pieces = Number(r.pieces_per_pack ?? r.quantity ?? 1);
                              return (
                                <span>
                                  {packs}
                                  <span className="text-primary font-bold mx-1">×</span>
                                  {pieces}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 text-center">{r.weight ? `${r.weight} كجم` : "-"}</td>
                          <td className="px-3 py-2 text-center">{r.dimensions || "-"}</td>
                          <td className="px-3 py-2 text-center">{Number(r.total ?? r.cost ?? 0).toLocaleString()}</td>
                          <td className="px-3 py-2">{r.notes || "-"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`${accentBg} font-bold`}>
                    <td colSpan={isTransport ? 6 : 6} className="px-3 py-2 text-right">
                      الإجمالي
                    </td>
                    <td className="px-3 py-2 text-center">{totalCost.toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex justify-between items-center text-base font-bold">
            <span>إجمالي التكاليف:</span>
            <span className="text-primary text-lg">
              {totalCost.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
