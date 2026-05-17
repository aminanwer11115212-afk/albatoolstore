import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as xlsx from "xlsx";

export default function DataMigrationPage() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
    console.log(msg);
  };

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runMigration = async () => {
    if (!confirm("هل أنت متأكد من حذف جميع البيانات (العملاء، المنتجات، الفواتير، عروض الأسعار، الخ) واستيراد البيانات الجديدة؟")) {
      return;
    }
    setLoading(true);
    setLogs(["بدء تفريغ النظام..."]);

    try {
      // 1. Delete transactions and relationships
      const tablesToDelete = [
        "invoice_items", "invoice_revisions", "invoices",
        "quote_items", "quotes",
        "purchase_items", "purchases",
        "stock_return_items", "stock_returns",
        "stock_transfer_items", "stock_transfers",
        "customer_destinations", "customer_preferred_transporter", "customer_transporters",
        "product_category_links", "product_brand_links"
      ];

      for (const table of tablesToDelete) {
        addLog(`جاري تفريغ ${table}...`);
        const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          addLog(`⚠️ تحذير: خطأ في تفريغ ${table}: ${error.message}`);
        }
      }

      // 2. Delete core tables
      const coreTables = ["customers"]; // Products removed per user request
      for (const table of coreTables) {
        addLog(`جاري تفريغ ${table}...`);
        const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          addLog(`⚠️ تحذير: خطأ في تفريغ ${table}: ${error.message}`);
        }
      }

      // 3. Read and insert Customers
      addLog("تحميل ملف العملاء...");
      const custRes = await fetch("/customers_new.xlsx");
      const custBuf = await custRes.arrayBuffer();
      const custWb = xlsx.read(custBuf, { type: "array" });
      const custSheet = custWb.Sheets[custWb.SheetNames[0]];
      const custData = xlsx.utils.sheet_to_json(custSheet, { header: 1 });

      const customersToInsert: any[] = [];
      for (let i = 1; i < custData.length; i++) {
        const row = custData[i] as any[];
        if (row[0]) {
          const whatsappNum = String(row[1] || "").replace(/[^0-9+]/g, "").trim();
          customersToInsert.push({ 
            name: String(row[0]).trim(), 
            whatsapp: whatsappNum || null,
            phone: null,
            address: null,
            city: null,
            company: null,
            email: null,
            notes: null
          });
        }
      }

      addLog(`إدراج ${customersToInsert.length} عميل...`);
      let custInserted = 0;
      for (let i = 0; i < customersToInsert.length; i += 50) {
        const batch = customersToInsert.slice(i, i + 50);
        const { error } = await supabase.from("customers").insert(batch);
        if (error) throw new Error(`خطأ في إدراج العملاء: ${error.message}`);
        custInserted += batch.length;
        addLog(`... تم إدراج ${custInserted} عميل`);
        await delay(100);
      }

      // Products insertion skipped for now
      addLog("تم تخطي إدراج المنتجات في هذه المرحلة.");

      addLog("✅ اكتملت عملية الترحيل بنجاح!");
      toast.success("تم استيراد البيانات بنجاح!");
    } catch (e: any) {
      addLog(`❌ حدث خطأ: ${e.message}`);
      toast.error(`حدث خطأ: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>ترحيل بيانات النظام (Migration)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            هذه الأداة ستقوم بحذف جميع البيانات الحالية (العملاء، المنتجات، الفواتير، وكل السجلات المرتبطة) وإعادة إدخال العملاء والمنتجات من ملفات الـ Excel المرفوعة.
          </p>
          <Button onClick={runMigration} disabled={loading} variant="destructive">
            {loading ? "جاري الترحيل..." : "بدء تفريغ واستيراد البيانات"}
          </Button>

          <div className="bg-slate-900 text-green-400 p-4 rounded-md h-64 overflow-y-auto font-mono text-xs mt-4">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            {logs.length === 0 && <div className="text-slate-500">سجلات العملية ستظهر هنا...</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
