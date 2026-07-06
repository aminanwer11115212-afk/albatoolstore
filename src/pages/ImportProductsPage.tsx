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

// ── Normalize header text: lowercase, strip diacritics/spaces/punctuation ─────
const normHeader = (h: any): string =>
  String(h ?? "")
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase()
    .trim();

// ── Column aliases (normalized) → target field ────────────────────────────────
const FIELD_ALIASES: Record<string, string[]> = {
  // products
  name: ["name", "product", "products", "item", "productname", "itemname", "اسم", "الاسم", "اسمالصنف", "اسمالمنتج", "الصنف", "المنتج", "المنتجات", "منتج", "بيان", "البيان", "وصف", "الوصف", "description"],
  sku: ["sku", "code", "barcode", "الكود", "كود", "باركود", "رمز", "الرمز", "رقمالصنف"],
  unit: ["unit", "uom", "الوحده", "وحده", "وحدهالقياس"],
  sale_price: ["saleprice", "price", "sellingprice", "سعرالبيع", "سعر", "السعر", "بيع", "سعرالمفرد", "سعرالجمله"],
  purchase_price: ["purchaseprice", "costprice", "cost", "سعرالشراء", "التكلفه", "تكلفه", "شراء", "سعرالتكلفه"],
  stock_quantity: ["stockquantity", "quantity", "qty", "stock", "الكميه", "كميه", "الرصيد", "رصيد", "المخزون", "مخزون"],
  min_stock: ["minstock", "minqty", "minimum", "حدادنى", "الحدالادنى", "اقلكميه"],
  // customers/suppliers extras
  phone: ["phone", "mobile", "tel", "الهاتف", "هاتف", "جوال", "الجوال", "موبايل", "الموبايل", "تليفون"],
  whatsapp: ["whatsapp", "wa", "الواتساب", "واتساب", "واتس", "الواتس"],
  email: ["email", "mail", "الايميل", "ايميل", "البريد", "بريدالكتروني"],
  address: ["address", "العنوان", "عنوان"],
  city: ["city", "المدينه", "مدينه"],
  company: ["company", "companyname", "الشركه", "شركه", "المؤسسه"],
  notes: ["notes", "note", "remark", "ملاحظات", "ملاحظه", "بيان"],
};

/** Build a header → field map by matching normalized aliases. */
function detectColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const nh = normHeader(h);
    if (!nh) continue;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (used.has(field)) continue;
      if (aliases.some((a) => nh === a || nh.includes(a) || a.includes(nh))) {
        map[h] = field;
        used.add(field);
        break;
      }
    }
  }
  return map;
}

const toNumber = (v: any): number => {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export default function ImportProductsPage() {
  const [mode, setMode] = useState<Mode>("products");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [deleteExisting, setDeleteExisting] = useState(false);
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

      if (rows.length === 0) throw new Error("الملف فارغ");

      // ── Auto-detect columns from headers ────────────────────────────────
      const headers = Object.keys(rows[0]);
      const colMap = detectColumns(headers);
      addLog(`الأعمدة المكتشفة:`);
      for (const [h, f] of Object.entries(colMap)) addLog(`  "${h}" → ${f}`);
      const unmapped = headers.filter((h) => !colMap[h]);
      if (unmapped.length) addLog(`أعمدة غير معروفة (سيتم تجاهلها): ${unmapped.join(", ")}`);

      // Validate required field
      const hasName = Object.values(colMap).includes("name");
      if (!hasName) throw new Error("لم يتم العثور على عمود الاسم في الملف (name / الاسم / اسم الصنف)");

      // ── Optional delete before insert ───────────────────────────────────
      if (deleteExisting) {
        const table = mode === "products" ? "products" : mode === "customers" ? "customers" : "suppliers";
        addLog(`🗑️ حذف كل السجلات القديمة من ${table}...`);
        const { error: delErr } = await supabase.from(table).delete().not("id", "is", null);
        if (delErr) throw new Error(`فشل الحذف: ${delErr.message}`);
        addLog(`✅ تم الحذف`);
      }

      // ── Map each row to target fields via colMap ────────────────────────
      const toInsert: any[] = [];
      for (const row of rows) {
        const mapped: any = {};
        for (const [h, field] of Object.entries(colMap)) {
          mapped[field] = row[h];
        }

        const name = String(mapped.name ?? "").trim();
        if (!name) continue;

        if (mode === "products") {
          toInsert.push({
            name,
            sku: mapped.sku != null ? String(mapped.sku).trim() || null : null,
            unit: mapped.unit != null ? String(mapped.unit).trim() || null : null,
            sale_price: toNumber(mapped.sale_price),
            purchase_price: toNumber(mapped.purchase_price),
            stock_quantity: toNumber(mapped.stock_quantity),
            min_stock: toNumber(mapped.min_stock),
            is_active: true,
          });
        } else if (mode === "customers") {
          toInsert.push({
            name,
            phone: cleanPhone(mapped.phone),
            whatsapp: cleanPhone(mapped.whatsapp),
            email: mapped.email ?? null,
            address: mapped.address ?? null,
            city: mapped.city ?? null,
            company: mapped.company ?? null,
            notes: mapped.notes ?? null,
          });
        } else {
          toInsert.push({
            name,
            phone: cleanPhone(mapped.phone),
            email: mapped.email ?? null,
            company: mapped.company ?? null,
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
      addLog(`❌ ${e.message}`);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6" dir="rtl">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>استيراد البيانات (XLSX / CSV) — كشف تلقائي للأعمدة</CardTitle>
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
              سيقوم النظام باكتشاف الأعمدة تلقائياً من ترويسة الملف. الحقول المدعومة:
              <br />
              {mode === "products" && "الاسم / السعر / سعر الشراء / الكمية / الحد الأدنى / الوحدة / الكود (SKU). أي مسميات مقاربة بالعربية أو الإنجليزية تعمل."}
              {mode === "customers" && "الاسم / الهاتف / الواتساب / الإيميل / العنوان / المدينة / الشركة / ملاحظات."}
              {mode === "suppliers" && "الاسم / الهاتف / الإيميل / الشركة."}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deleteExisting}
              onChange={(e) => setDeleteExisting(e.target.checked)}
              disabled={busy}
            />
            حذف كل السجلات القديمة قبل الاستيراد (لا يمكن التراجع)
          </label>

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
