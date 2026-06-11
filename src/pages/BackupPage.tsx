import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Download, Upload, Database, Loader2 } from "lucide-react";

/**
 * نسخ احتياطي حقيقي:
 *  - تصدير: يجلب جميع البيانات من الجداول الرئيسية ويُنزّلها كملف JSON.
 *  - استعادة: يقرأ ملف JSON ويُدخل البيانات مرة أخرى (Upsert حسب id).
 *  - لا يلمس جداول auth / storage.
 */
const TABLES = [
  "company_settings", "currencies", "exchange_rates", "accounts", "transaction_categories",
  "warehouses", "product_categories", "product_companies", "products",
  "product_category_links", "product_brand_links",
  "customer_groups", "customers", "suppliers", "employees",
  "regions", "states", "cities", "localities", "destinations",
  "transporters", "locality_transporters", "destination_transporters",
  "customer_transporters", "customer_preferred_transporter", "customer_destinations",
  "packaging_types", "billing_terms", "projects", "goals",
  "invoices", "invoice_items", "invoice_packaging", "invoices_packaging_items",
  "invoice_transports", "invoices_transports_items", "invoice_attachments", "invoice_revisions",
  "quotes", "quote_items", "quotes_packaging", "quotes_packaging_items",
  "quote_transports", "quote_attachments",
  "purchase_orders", "purchase_order_items", "purchase_attachments",
  "stock_returns", "stock_return_items", "stock_transfers",
  "transactions", "documents", "notes", "todos", "activity_log",
];

export default function BackupPage() {
  const [busy, setBusy] = useState<null | "export" | "import">(null);
  const [progress, setProgress] = useState<string>("");

  const exportAll = async () => {
    setBusy("export"); setProgress("");
    const bundle: Record<string, any[]> = {};
    let totalRows = 0;
    try {
      for (const t of TABLES) {
        setProgress(`جاري قراءة ${t}...`);
        const { data, error } = await (supabase as any).from(t).select("*");
        if (error) {
          console.warn(`[backup] skip ${t}:`, error.message);
          bundle[t] = [];
          continue;
        }
        bundle[t] = data || [];
        totalRows += (data || []).length;
      }
      const payload = {
        version: 1,
        created_at: new Date().toISOString(),
        app: "albatool-store",
        total_rows: totalRows,
        tables: bundle,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url; a.download = `albatool-backup-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${totalRows.toLocaleString()} سجل من ${TABLES.length} جدول`);
    } catch (e: any) {
      toast.error("فشل التصدير: " + (e.message || String(e)));
    } finally {
      setBusy(null); setProgress("");
    }
  };

  const importFile = async (file: File) => {
    if (!confirm(
      "⚠️ تحذير: ستتم إضافة/تحديث البيانات من الملف فوق البيانات الحالية.\n" +
      "لا يتم حذف البيانات الموجودة. هل تريد المتابعة؟"
    )) return;
    setBusy("import"); setProgress("");
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || typeof payload !== "object" || !payload.tables) {
        throw new Error("ملف غير صالح: لا يحتوي على بيانات احتياطية");
      }
      let inserted = 0;
      const failed: string[] = [];
      for (const t of TABLES) {
        const rows = payload.tables[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        setProgress(`جاري استعادة ${t} (${rows.length})...`);
        // upsert in chunks of 200 لتجنب طلبات ضخمة
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          const { error } = await (supabase as any).from(t).upsert(chunk, { onConflict: "id" });
          if (error) {
            console.warn(`[restore] ${t}:`, error.message);
            failed.push(`${t}: ${error.message}`);
            break;
          }
          inserted += chunk.length;
        }
      }
      if (failed.length) {
        toast.warning(`اكتملت الاستعادة مع تخطّي ${failed.length} جدول. أُدخل ${inserted.toLocaleString()} سجل`);
        console.warn("[restore] failures:", failed);
      } else {
        toast.success(`تمت الاستعادة بنجاح: ${inserted.toLocaleString()} سجل`);
      }
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast.error("فشل الاستعادة: " + (e.message || String(e)));
    } finally {
      setBusy(null); setProgress("");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-foreground">النسخ الاحتياطي</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10 text-primary"><Download size={22} /></div>
            <div>
              <h3 className="font-bold text-foreground">تصدير نسخة احتياطية</h3>
              <p className="text-xs text-muted-foreground">يُنزّل كل بياناتك (فواتير، عملاء، مخزون…) في ملف واحد على جهازك</p>
            </div>
          </div>
          <button
            onClick={exportAll}
            disabled={busy !== null}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50"
          >
            {busy === "export" ? <><Loader2 size={16} className="animate-spin" /> جاري التصدير...</> : <><Download size={16} /> تصدير الآن</>}
          </button>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-warning/10 text-warning"><Upload size={22} /></div>
            <div>
              <h3 className="font-bold text-foreground">استعادة من نسخة</h3>
              <p className="text-xs text-muted-foreground">اختر ملف JSON سابق لإعادة إدخال البيانات (لا تُحذف البيانات الحالية)</p>
            </div>
          </div>
          <label className="block">
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy !== null}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = ""; }}
              className="block w-full text-xs text-muted-foreground file:mr-2 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-warning/10 file:text-warning hover:file:bg-warning/20 file:cursor-pointer disabled:opacity-50"
            />
          </label>
          {busy === "import" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" /> جاري الاستعادة...</div>}
        </div>
      </div>

      {progress && (
        <div className="bg-muted rounded-lg p-3 text-xs text-foreground flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {progress}
        </div>
      )}

      <div className="bg-info/5 border border-info/20 rounded-xl p-4 text-sm text-foreground">
        <div className="flex items-start gap-2">
          <Database size={18} className="text-info mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-bold">ملاحظات مهمة:</p>
            <ul className="list-disc pr-5 text-xs text-muted-foreground space-y-1">
              <li>احتفظ بملف النسخة في مكان آمن (Google Drive، USB، البريد…) لأنّه يحوي كل بيانات نشاطك.</li>
              <li>عملية الاستعادة تُضيف وتحدّث ولا تحذف؛ السجلات الموجودة بنفس المعرف يُعاد كتابتها.</li>
              <li>يشمل النسخة {TABLES.length} جدولًا (فواتير، عروض، مشتريات، مخزون، عملاء، موردين، محاسبة، ترحيلات، تغليف…)</li>
              <li>الملفات المرفقة (الصور والـ PDF المرفوعة) لا تُنسخ هنا — تبقى محفوظة في التخزين السحابي بشكل منفصل.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
