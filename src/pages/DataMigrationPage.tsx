import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import * as xlsx from "xlsx";

// ترتيب الحذف: من children إلى parents لتفادي قيود FK
const DELETE_ORDER: string[] = [
  // Invoice tree
  "invoices_packaging_items",
  "invoice_packaging_items",
  "invoice_packaging",
  "invoice_transports_items",
  "invoice_transports",
  "invoice_attachments",
  "invoice_revisions",
  "deleted_invoice_items",
  "invoice_items",
  "invoices",
  // Quote tree
  "quotes_packaging_items",
  "quotes_packaging",
  "quote_transports",
  "deleted_quote_items",
  "quote_items",
  "quotes",
  // Purchases / returns / transfers
  "purchase_items",
  "purchase_orders",
  "stock_return_items",
  "stock_returns",
  "stock_transfer_items",
  "stock_transfers",
  // Product/customer relations
  "product_category_links",
  "product_brand_links",
  "customer_destinations",
  "customer_preferred_transporter",
  "customer_transporters",
  // Core entities
  "products",
  "customers",
];

const CONFIRM_PHRASE = "نعم احذف";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanPhone = (raw: any): string | null => {
  if (raw == null) return null;
  const s = String(raw).replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  const cleaned = s.replace(/[^0-9+]/g, "").trim();
  return cleaned || null;
};

export default function DataMigrationPage() {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
    // eslint-disable-next-line no-console
    console.log(msg);
  };

  // ───────────── الدفعة 1: حذف الكل ─────────────
  const wipeAll = async () => {
    addLog("════ الدفعة 1: تفريغ كل البيانات ════");
    for (const table of DELETE_ORDER) {
      addLog(`جاري تفريغ ${table}...`);
      const { error, count } = await (supabase as any)
        .from(table)
        .delete({ count: "exact" })
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        addLog(`⚠️ تخطّي ${table}: ${error.message}`);
      } else {
        addLog(`  ✓ حُذف ${count ?? "?"} صف من ${table}`);
      }
      await delay(50);
    }
    addLog("✅ اكتمل التفريغ.");
  };

  // ───────────── الدفعة 2: استيراد العملاء ─────────────
  const importCustomers = async () => {
    addLog("════ الدفعة 2: استيراد العملاء ════");
    const res = await fetch("/import/customers.xlsx");
    if (!res.ok) throw new Error("تعذّر تحميل ملف العملاء من /import/customers.xlsx");
    const buf = await res.arrayBuffer();
    const wb = xlsx.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    const toInsert: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row?.[0] ? String(row[0]).trim() : "";
      if (!name) continue;
      toInsert.push({
        name,
        whatsapp: cleanPhone(row?.[1]),
        phone: null,
        email: null,
        address: null,
        city: null,
        company: null,
        notes: null,
      });
    }

    addLog(`عدد العملاء للإدراج: ${toInsert.length}`);
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("customers").insert(batch);
      if (error) throw new Error(`خطأ إدراج العملاء عند الصف ${i}: ${error.message}`);
      inserted += batch.length;
      addLog(`  ... تم إدراج ${inserted}/${toInsert.length}`);
      await delay(80);
    }
    addLog(`✅ تم إدراج ${inserted} عميل.`);
  };

  // ───────────── الدفعة 3: استيراد المنتجات ─────────────
  const importProducts = async () => {
    addLog("════ الدفعة 3: استيراد المنتجات ════");
    const res = await fetch("/import/products.xlsx");
    if (!res.ok) throw new Error("تعذّر تحميل ملف المنتجات من /import/products.xlsx");
    const buf = await res.arrayBuffer();
    const wb = xlsx.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    const toInsert: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row?.[0] ? String(row[0]).trim() : "";
      if (!name) continue;
      const activeCell = String(row?.[1] ?? "").toLowerCase();
      const isActive = activeCell.includes("x") || activeCell.includes("✓") || activeCell === "true";
      toInsert.push({
        name,
        is_active: isActive,
        stock_quantity: 0,
        sale_price: 0,
        purchase_price: 0,
        min_stock: 0,
      });
    }

    addLog(`عدد المنتجات للإدراج: ${toInsert.length}`);
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("products").insert(batch);
      if (error) throw new Error(`خطأ إدراج المنتجات عند الصف ${i}: ${error.message}`);
      inserted += batch.length;
      addLog(`  ... تم إدراج ${inserted}/${toInsert.length}`);
      await delay(80);
    }
    addLog(`✅ تم إدراج ${inserted} منتج.`);
  };

  const runAll = async () => {
    if (confirm !== CONFIRM_PHRASE) {
      toast.error(`اكتب "${CONFIRM_PHRASE}" في الحقل للتأكيد`);
      return;
    }
    setLoading(true);
    setLogs([]);
    try {
      await wipeAll();
      await importCustomers();
      await importProducts();
      addLog("🎉 اكتملت كل الدفعات بنجاح! النظام جاهز.");
      toast.success("اكتمل ترحيل البيانات");
      // إعلام الكاش بالتحديث
      window.dispatchEvent(new Event("products:changed"));
      window.dispatchEvent(new Event("invoices:changed"));
    } catch (e: any) {
      addLog(`❌ خطأ: ${e.message}`);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runWipeOnly = async () => {
    if (confirm !== CONFIRM_PHRASE) {
      toast.error(`اكتب "${CONFIRM_PHRASE}" في الحقل للتأكيد`);
      return;
    }
    setLoading(true);
    setLogs([]);
    try {
      await wipeAll();
      toast.success("تم تفريغ النظام");
    } catch (e: any) {
      addLog(`❌ خطأ: ${e.message}`);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>ترحيل بيانات النظام — تفريغ شامل واستيراد حقيقي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>سيتم تنفيذ ٣ دفعات متسلسلة:</p>
            <ol className="list-decimal pr-6 space-y-1">
              <li>حذف كل الفواتير، عروض الأسعار، المشتريات، المرتجعات، التحويلات، المنتجات، والعملاء.</li>
              <li>استيراد ٣٠٥ عميل (الاسم + الواتساب فقط) من <code>دليل_الاسماء</code>.</li>
              <li>استيراد ٦٣٨ منتج (الاسم + التفعيل) من <code>المنتجات_عطبرة</code>.</li>
            </ol>
            <p className="text-destructive font-semibold mt-2">⚠️ العملية غير قابلة للتراجع.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              اكتب <code className="bg-muted px-1 rounded">{CONFIRM_PHRASE}</code> للتأكيد:
            </label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              placeholder={CONFIRM_PHRASE}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={runAll} disabled={loading} variant="destructive">
              {loading ? "جارٍ التنفيذ..." : "تنفيذ كل الدفعات (حذف + استيراد)"}
            </Button>
            <Button onClick={runWipeOnly} disabled={loading} variant="outline">
              تفريغ فقط (بدون استيراد)
            </Button>
          </div>

          <div className="bg-slate-900 text-green-400 p-4 rounded-md h-96 overflow-y-auto font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            {logs.length === 0 && <div className="text-slate-500">سجل العملية سيظهر هنا...</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
