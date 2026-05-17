import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as xlsx from "xlsx";

async function fetchAll(table: string, select = "*"): Promise<any[]> {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  while (true) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select(select)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function downloadXLSX(filename: string, sheets: Record<string, any[]>) {
  const wb = xlsx.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = xlsx.utils.json_to_sheet(rows.length ? rows : [{}]);
    xlsx.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  xlsx.writeFile(wb, filename);
}

const TABLES: { key: string; title: string; tables: string[] }[] = [
  { key: "products", title: "المنتجات", tables: ["products"] },
  { key: "customers", title: "العملاء", tables: ["customers"] },
  { key: "suppliers", title: "الموردون", tables: ["suppliers"] },
  { key: "invoices", title: "الفواتير + البنود", tables: ["invoices", "invoice_items"] },
  { key: "quotes", title: "عروض الأسعار + البنود", tables: ["quotes", "quote_items"] },
  { key: "purchases", title: "المشتريات + البنود", tables: ["purchase_orders", "purchase_items"] },
  { key: "returns", title: "المرتجعات + البنود", tables: ["stock_returns", "stock_return_items"] },
  { key: "transfers", title: "التحويلات المخزنية", tables: ["stock_transfers", "stock_transfer_items"] },
  { key: "transactions", title: "الحسابات والمعاملات", tables: ["accounts", "transactions"] },
];

const FULL_BACKUP_TABLES = [
  "products", "customers", "suppliers",
  "invoices", "invoice_items",
  "quotes", "quote_items",
  "purchase_orders", "purchase_items",
  "stock_returns", "stock_return_items",
  "stock_transfers", "stock_transfer_items",
  "accounts", "transactions",
  "product_categories", "product_companies", "warehouses",
];

export default function ExportPage() {
  const [busy, setBusy] = useState<string | null>(null);

  const runExport = async (key: string, title: string, tables: string[]) => {
    setBusy(key);
    try {
      const sheets: Record<string, any[]> = {};
      for (const t of tables) {
        sheets[t] = await fetchAll(t);
      }
      const ts = new Date().toISOString().slice(0, 10);
      downloadXLSX(`${key}_${ts}.xlsx`, sheets);
      const total = Object.values(sheets).reduce((s, r) => s + r.length, 0);
      toast.success(`تم تصدير ${title}: ${total} سجل`);
    } catch (e: any) {
      toast.error(`خطأ في تصدير ${title}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runFullBackup = async () => {
    setBusy("backup");
    try {
      const sheets: Record<string, any[]> = {};
      for (const t of FULL_BACKUP_TABLES) {
        try {
          sheets[t] = await fetchAll(t);
        } catch (e: any) {
          // skip table on error
          // eslint-disable-next-line no-console
          console.warn(`skip ${t}:`, e.message);
        }
      }
      const ts = new Date().toISOString().slice(0, 10);
      downloadXLSX(`full_backup_${ts}.xlsx`, sheets);
      toast.success("اكتمل النسخ الاحتياطي الكامل");
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>تصدير البيانات (XLSX)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            {TABLES.map((t) => (
              <div key={t.key} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.tables.join(" + ")}</div>
                </div>
                <Button
                  onClick={() => runExport(t.key, t.title, t.tables)}
                  disabled={busy !== null}
                  size="sm"
                >
                  {busy === t.key ? "جارٍ..." : "تصدير XLSX"}
                </Button>
              </div>
            ))}
          </div>
          <div className="border-t pt-3">
            <Button onClick={runFullBackup} disabled={busy !== null} variant="default" className="w-full">
              {busy === "backup" ? "جارٍ النسخ الاحتياطي..." : "📦 نسخ احتياطي كامل (كل الجداول في ملف واحد)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
