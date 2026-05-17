import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import * as xlsx from "xlsx";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Mode = "products" | "customers" | "suppliers";

const cleanPhone = (raw: any): string | null => {
  if (raw == null) return null;
  const s = String(raw).replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  const cleaned = s.replace(/[^0-9+]/g, "").trim();
  return cleaned || null;
};

export default function ImportProductsPage() {
  const [mode, setMode] = useState<Mode>("products");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = (m: string) => setLogs((p) => [...p, m]);

  const handleImport = async () => {
    if (!file) return toast.error("اختر ملف أولاً");
    setBusy(true);
    setLogs([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json<any>(sheet, { defval: null });
      addLog(`عدد الصفوف المقروءة: ${rows.length}`);

      const toInsert: any[] = [];
      for (const row of rows) {
        if (mode === "products") {
          const name = String(row.name ?? row["اسم الصنف"] ?? row["الاسم"] ?? "").trim();
          if (!name) continue;
          toInsert.push({
            name,
            sku: row.sku ?? null,
            unit: row.unit ?? null,
            sale_price: Number(row.sale_price ?? row["سعر البيع"] ?? 0) || 0,
            purchase_price: Number(row.purchase_price ?? row["سعر الشراء"] ?? 0) || 0,
            stock_quantity: Number(row.stock_quantity ?? row["الكمية"] ?? 0) || 0,
            min_stock: Number(row.min_stock ?? 0) || 0,
            is_active: true,
          });
        } else if (mode === "customers") {
          const name = String(row.name ?? row["الاسم"] ?? row["اسم العميل"] ?? "").trim();
          if (!name) continue;
          toInsert.push({
            name,
            phone: cleanPhone(row.phone ?? row["الهاتف"]),
            whatsapp: cleanPhone(row.whatsapp ?? row["الواتساب"]),
            email: row.email ?? null,
            address: row.address ?? null,
            city: row.city ?? null,
            company: row.company ?? null,
            notes: row.notes ?? null,
          });
        } else {
          const name = String(row.name ?? row["الاسم"] ?? "").trim();
          if (!name) continue;
          toInsert.push({
            name,
            phone: cleanPhone(row.phone ?? row["الهاتف"]),
            email: row.email ?? null,
            company: row.company ?? null,
          });
        }
      }
      addLog(`صفوف صالحة للإدراج: ${toInsert.length}`);

      const table = mode === "products" ? "products" : mode === "customers" ? "customers" : "suppliers";
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += 50) {
        const batch = toInsert.slice(i, i + 50);
        const { error } = await supabase.from(table).insert(batch);
        if (error) {
          addLog(`❌ خطأ عند الصف ${i}: ${error.message}`);
          throw error;
        }
        inserted += batch.length;
        addLog(`  ... ${inserted}/${toInsert.length}`);
        await delay(60);
      }
      addLog(`✅ تم إدراج ${inserted} سجل في ${table}.`);
      toast.success(`تم استيراد ${inserted} سجل`);
      if (mode === "products") window.dispatchEvent(new Event("products:changed"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>استيراد البيانات (XLSX / CSV)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {(["products", "customers", "suppliers"] as Mode[]).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "default" : "outline"}
                size="sm"
                onClick={() => setMode(m)}
                disabled={busy}
              >
                {m === "products" ? "منتجات" : m === "customers" ? "عملاء" : "موردون"}
              </Button>
            ))}
          </div>

          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="block w-full text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              الأعمدة المدعومة (يقبل الإنجليزية والعربية):
              {mode === "products" && " name/اسم الصنف، sku، unit، sale_price، purchase_price، stock_quantity"}
              {mode === "customers" && " name/الاسم، phone/الهاتف، whatsapp/الواتساب، email، address، city، company"}
              {mode === "suppliers" && " name/الاسم، phone/الهاتف، email، company"}
            </p>
          </div>

          <Button onClick={handleImport} disabled={!file || busy}>
            {busy ? "جارٍ الاستيراد..." : "بدء الاستيراد"}
          </Button>

          <div className="bg-slate-900 text-green-400 p-3 rounded-md h-64 overflow-y-auto font-mono text-xs">
            {logs.map((l, i) => <div key={i}>{l}</div>)}
            {logs.length === 0 && <div className="text-slate-500">السجل سيظهر هنا...</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
