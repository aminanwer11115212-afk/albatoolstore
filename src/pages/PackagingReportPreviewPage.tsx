import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2 } from "lucide-react";
import { generatePackagingReportHTML } from "@/utils/transportPackagingPrint";
import { buildPrintWindowHtml } from "@/utils/printTemplate";

interface Props {
  docType: "invoice" | "quote";
}

/**
 * صفحة معاينة داخلية لتقرير التغليف (فاتورة / عرض سعر) —
 * تعرض نفس HTML الطباعة + شريط أدوات المعاينة (طباعة، PDF، واتساب) داخل iframe،
 * تماماً كما تفعل DocumentPreviewPage لعرض السعر/الفاتورة العادية.
 */
export default function PackagingReportPreviewPage({ docType }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isInvoice = docType === "invoice";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const { data: companyArr } = await (supabase as any)
          .from("company_settings").select("*").limit(1);
        const company = Array.isArray(companyArr) ? companyArr[0] : null;

        const tableMain = isInvoice ? "invoices" : "quotes";
        const tableHeader = isInvoice ? "invoice_packaging" : "quotes_packaging";
        const tableItems = isInvoice ? "invoices_packaging_items" : "quotes_packaging_items";
        const fkHeader = isInvoice ? "invoice_id" : "quote_id";
        const fkItem = isInvoice ? "invoice_packaging_id" : "quote_packaging_id";
        const docNumberField = isInvoice ? "invoice_number" : "quote_number";

        const { data: doc, error: dErr } = await (supabase as any)
          .from(tableMain)
          .select("*, customers(name, phone, address)")
          .eq("id", id)
          .maybeSingle();
        if (dErr) throw dErr;
        if (!doc) throw new Error(isInvoice ? "الفاتورة غير موجودة" : "عرض السعر غير موجود");

        // Headers (سجلات التغليف الرئيسية) — بدون embed (لا يوجد FK على packaging_types)
        const { data: headers } = await (supabase as any)
          .from(tableHeader)
          .select("id, packaging_type_id")
          .eq(fkHeader, id);
        const headerIds = (headers || []).map((h: any) => h.id);
        const headerTypeIds = Array.from(new Set(
          (headers || []).map((h: any) => h.packaging_type_id).filter(Boolean)
        ));
        const headerTypeIdById: Record<string, string> = {};
        (headers || []).forEach((h: any) => {
          if (h.packaging_type_id) headerTypeIdById[h.id] = h.packaging_type_id;
        });

        // Items (بنود التغليف الحقيقية) — بدون embed على packaging_types (لا يوجد FK)
        let items: any[] = [];
        if (headerIds.length) {
          const { data: rows } = await (supabase as any)
            .from(tableItems)
            .select("*")
            .in(fkItem, headerIds);
          items = rows || [];
        }

        // اجمع جميع packaging_type_id (من البنود والرؤوس) واستعلم عن أسمائها دفعة واحدة
        const allTypeIds = Array.from(new Set([
          ...items.map((r: any) => r.packaging_type_id).filter(Boolean),
          ...headerTypeIds,
        ]));
        const typeNameById: Record<string, string> = {};
        if (allTypeIds.length) {
          const { data: types } = await (supabase as any)
            .from("packaging_types").select("id, name").in("id", allTypeIds);
          (types || []).forEach((t: any) => { typeNameById[t.id] = t.name; });
        }

        const docInfo = {
          id: id,
          number: doc[docNumberField],
          date: doc.date || (doc.created_at ? String(doc.created_at).slice(0, 10) : ""),
          customerName: doc.customers?.name || "كاش",
          customerPhone: doc.customers?.phone,
          customerAddress: doc.customers?.address,
        };

        const reportHtml = generatePackagingReportHTML({
          docType,
          doc: docInfo,
          company,
          rows: items.map((r: any) => ({
            type: directTypeNameById[r.packaging_type_id] || headerTypeById[r[fkItem]] || "",
            product: r.product_name,
            quantity: r.quantity,
            packs_count: r.packs_count,
            pieces_per_pack: r.pieces_per_pack,
            weight: r.weight,
            dimensions: r.dimensions,
            cost: r.total ?? r.cost,
            notes: r.notes,
          })),
        });

        if (cancelled) return;
        const fullHtml = buildPrintWindowHtml(reportHtml, true);
        setHtml(fullHtml);
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, docType, isInvoice]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d: any = e.data;
      if (!d) return;
      if (d.type === "lov-preview-close") { navigate(-1); return; }
      if (d.type === "lov-link-online-request") {
        const reply = (payload: any) => {
          (e.source as Window | null)?.postMessage(
            { type: "lov-link-online-result", reqId: d.reqId, ...payload },
            e.origin,
          );
        };
        try {
          const { data: sess } = await supabase.auth.getSession();
          const accessToken = sess?.session?.access_token;
          if (!accessToken) throw new Error("يجب تسجيل الدخول");
          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
          const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-document-share-token`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: ANON,
            },
            body: JSON.stringify({
              doc_type: isInvoice ? "packaging-invoice" : "packaging-quote",
              doc_id: id,
              ttl_hours: 168,
              hidden_sections: Array.isArray(d.hiddenSections) ? d.hiddenSections : [],
            }),
          });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json.error || "فشل إنشاء الرابط");
          const greeting = d.customerName ? `مرحباً ${d.customerName} 👋` : "مرحباً 👋";
          const msg = `${greeting}\nتفضل رابط معاينة تقرير التغليف:\n${json.url}`;
          const { openWhatsApp } = await import("@/utils/whatsapp");
          openWhatsApp(d.phone, msg);
          reply({ ok: true, url: json.url });
        } catch (err: any) {
          reply({ ok: false, error: err?.message || String(err) });
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate, id, isInvoice]);

  const title = `معاينة تقرير تغليف ${isInvoice ? "الفاتورة" : "عرض السعر"}`;

  return (
    <div dir="rtl" style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-card">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold text-primary hover:bg-primary/10"
        >
          <ArrowRight size={16} /> رجوع
        </button>
        <div className="text-sm font-bold text-foreground">{title}</div>
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="animate-spin" size={18} /> جاري التحميل...
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-red-600 text-sm">
          {error}
        </div>
      )}
      {!loading && !error && (
        <iframe
          title={title}
          srcDoc={html}
          style={{ flex: 1, width: "100%", border: "0", background: "#fff" }}
        />
      )}
    </div>
  );
}
