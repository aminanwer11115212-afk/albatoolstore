import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Calendar, User, FileText } from "lucide-react";

/**
 * Conversion log tab — shows when a quote was converted to an invoice
 * and who performed the conversion.
 *
 * Mode "quote": pass quoteId — shows the linked invoice (if any).
 * Mode "invoice": pass invoiceId — shows the originating quote (if any).
 */
type Props =
  | { mode: "quote"; quoteId: string }
  | { mode: "invoice"; invoiceId: string };

type LogRow = {
  quote_id: string;
  quote_number: string;
  invoice_id: string;
  invoice_number: string;
  converted_at: string | null;
  converted_by: string | null;
  converter_name: string | null;
};

export default function QuoteConversionLog(props: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let quotesQ = supabase
          .from("quotes")
          .select("id, quote_number, converted_to_invoice_id, converted_at, converted_by")
          .not("converted_to_invoice_id", "is", null);

        if (props.mode === "quote") {
          quotesQ = quotesQ.eq("id", props.quoteId);
        } else {
          quotesQ = quotesQ.eq("converted_to_invoice_id", props.invoiceId);
        }

        const { data: quotes } = await quotesQ;
        if (!quotes || quotes.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        const invIds = quotes.map((q: any) => q.converted_to_invoice_id);
        const userIds = Array.from(
          new Set(quotes.map((q: any) => q.converted_by).filter(Boolean)),
        );

        const [{ data: invoices }, { data: employees }] = await Promise.all([
          supabase.from("invoices").select("id, invoice_number").in("id", invIds),
          userIds.length
            ? supabase.from("employees").select("user_id, name").in("user_id", userIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const invMap = new Map<string, string>();
        (invoices || []).forEach((i: any) => invMap.set(i.id, i.invoice_number));
        const empMap = new Map<string, string>();
        (employees || []).forEach((e: any) => empMap.set(e.user_id, e.name));

        const result: LogRow[] = quotes.map((q: any) => ({
          quote_id: q.id,
          quote_number: q.quote_number,
          invoice_id: q.converted_to_invoice_id,
          invoice_number: invMap.get(q.converted_to_invoice_id) || "(محذوفة)",
          converted_at: q.converted_at,
          converted_by: q.converted_by,
          converter_name: q.converted_by ? empMap.get(q.converted_by) || null : null,
        }));

        if (!cancelled) setRows(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.mode, (props as any).quoteId, (props as any).invoiceId]);

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;
  }
  if (!rows.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        لا يوجد سجل تحويل لهذا السند.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {rows.map((r) => (
        <Card key={r.quote_id + r.invoice_id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                to={`/quotes/view/${r.quote_id}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/70 transition"
              >
                <FileText className="w-4 h-4" />
                <span className="font-mono">{r.quote_number}</span>
              </Link>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <Link
                to={`/invoices/view/${r.invoice_id}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition"
              >
                <FileText className="w-4 h-4" />
                <span className="font-mono">{r.invoice_number}</span>
              </Link>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {r.converted_at
                  ? new Date(r.converted_at).toLocaleString("ar-EG")
                  : "—"}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {r.converter_name || (r.converted_by ? "مستخدم غير معروف" : "غير مسجل")}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
