import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import StatusButton, { QUOTE_STATUS_OPTIONS } from "@/components/StatusButton";

interface Props {
  quotes: any[];
  isLoading: boolean;
}

export default function DashboardRecentQuotes({ quotes, isLoading }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [localQuotes, setLocalQuotes] = useState<any[]>(quotes);

  useEffect(() => { setLocalQuotes(quotes); }, [quotes]);

  const handleStatusChange = async (quoteId: string, newStatus: string) => {
    const prev = localQuotes;
    setLocalQuotes((qs) => qs.map((q) => (q.id === quoteId ? { ...q, status: newStatus } : q)));
    const { error } = await supabase.from("quotes").update({ status: newStatus }).eq("id", quoteId);
    if (error) {
      setLocalQuotes(prev);
      toast.error(error.message || "تعذر تحديث الحالة");
      return;
    }
    toast.success("تم تحديث الحالة");
    queryClient.invalidateQueries({ queryKey: ["quotes-with-customers"] });
  };

  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader className="p-4 pb-2 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-bold">عروض الأسعار الأخيرة</CardTitle>
          <div className="flex gap-1.5">
            <Button size="sm" className="text-[10.5px] h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => navigate("/quotes/create")}>
              عرض أسعار جديد
            </Button>
            <Button size="sm" variant="outline" className="text-[10.5px] h-7 rounded-full bg-green-600 text-white border-green-600 hover:bg-green-700" onClick={() => navigate("/quotes")}>
              إدارة عروض الأسعار
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div className="overflow-auto h-full">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-10" style={{ background: "#3b82f6" }}>
              <tr className="border-b border-border">
                <th className="text-right px-1.5 py-1 font-semibold text-[10.5px] whitespace-nowrap" style={{ color: "#ffffff" }}>عرض#</th>
                <th className="text-right px-1.5 py-1 font-semibold text-[10.5px] whitespace-nowrap" style={{ color: "#ffffff" }}>معلومات العميل</th>
                <th className="text-right px-1.5 py-1 font-semibold text-[10.5px] whitespace-nowrap" style={{ color: "#ffffff" }}>الحالة</th>
                <th className="text-right px-1.5 py-1 font-semibold text-[10.5px] whitespace-nowrap" style={{ color: "#ffffff" }}>التاريخ</th>
                <th className="text-right px-1.5 py-1 font-semibold text-[10.5px] whitespace-nowrap" style={{ color: "#ffffff" }}>مبلغ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-[10.5px]">جاري التحميل...</td></tr>
              ) : localQuotes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-muted-foreground text-[10.5px]">
                    لا توجد عروض أسعار بعد - <button onClick={() => navigate("/quotes/create")} className="text-primary hover:underline">أضف عرض سعر جديد</button>
                  </td>
                </tr>
              ) : localQuotes.slice(0, 10).map((q: any, idx: number) => (
                <tr key={q.id} onClick={() => navigate(`/quotes/view/${q.id}`)} className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}>
                  <td className="px-1.5 py-1 text-[10.5px] font-medium text-foreground whitespace-nowrap">{q.quote_number}</td>
                  <td className="px-1.5 py-1 text-foreground text-[10.5px] truncate max-w-[110px]">{q.customers?.name || "-"}</td>
                  <td className="px-1.5 py-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <StatusButton
                      statuses={QUOTE_STATUS_OPTIONS}
                      current={q.status || "draft"}
                      onChange={(v) => handleStatusChange(q.id, v)}
                    />
                  </td>
                  <td className="px-1.5 py-1 text-muted-foreground text-[10.5px] whitespace-nowrap">{q.date}</td>
                  <td className="px-1.5 py-1 text-[10.5px] whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/quotes/view/${q.id}`); }}
                      className="font-semibold text-primary hover:underline cursor-pointer"
                      title="فتح عرض السعر"
                    >
                      {Number(q.total || 0).toLocaleString()}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
