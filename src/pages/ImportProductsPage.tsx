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
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase()
    .trim();

// ── Column aliases (normalized) → target field ────────────────────────────────
const FIELD_ALIASES: Record<string, string[]> = {
  // products
  name: ["name", "product", "products", "item", "productname", "itemname", "اسم", "الاسم", "اسمالصنف", "اسمالمنتج", "الصنف", "المنتج", "المنتجات", "منتج", "بيان", "البيان", "وصف", "الوصف", "description"],
  sku: ["sku", "code", "barcode", "الكود", "كود", "باركود", "رمز", "الرمز", "رقمالصنف"],
  unit: ["unit", "uom", "الوحده", "وحده", "وحدهالقياس"],
  sale_price: ["saleprice", "price", "sellingprice", "سعرالبيع", "سعر", "السعر", "بيع", "سعرالمفرد", "سعرالجمله", "السعرالمحلي", "السعرالمحلى", "سعرمحلي", "محلي", "المحلي"],
  purchase_price: ["purchaseprice", "costprice", "cost", "سعرالشراء", "التكلفه", "تكلفه", "شراء", "سعرالتكلفه"],
  foreign_price: ["foreignprice", "السعرالاجنبي", "السعرالاجنبى", "سعراجنبي", "الاجنبي", "اجنبي"],
  brand: ["brand", "الماركه", "ماركه", "البراند", "براند", "الشركه المصنعه", "الشركهالمصنعه", "manufacturer"],
  category: ["category", "الفئه", "فئه", "التصنيف", "تصنيف", "القسم", "قسم"],
  stock_quantity: ["stockquantity", "quantity", "qty", "stock", "الكميه", "كميه", "الرصيد", "رصيد", "المخزون", "مخزون"],
  min_stock: ["minstock", "minqty", "minimum", "حدادنى", "الحدالادنى", "اقلكميه"],
  // customers/suppliers extras
  phone: ["phone", "mobile", "tel", "الهاتف", "هاتف", "جوال", "الجوال", "موبايل", "الموبايل", "تليفون", "رقمهاتفالعميل1", "رقمهاتف", "رقم"],
  whatsapp: ["whatsapp", "wa", "الواتساب", "واتساب", "واتس", "الواتس"],
  email: ["email", "mail", "الايميل", "ايميل", "البريد", "بريدالكتروني"],
  address: ["address", "العنوان", "عنوان"],
  city: ["city", "المدينه", "مدينه"],
  company: ["company", "companyname", "الشركه", "شركه", "المؤسسه"],
  notes: ["notes", "note", "remark", "ملاحظات", "ملاحظه"],
};

/** Build a header → field map by matching normalized aliases. */
function detectColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const nh = normHeader(h);
    if (!nh) continue;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (field !== "name" && used.has(field)) continue;
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

/**
 * Read the first sheet as an array-of-arrays and pick the real header row.
 * Skips "junk" header rows where every cell is the same value (e.g. "Products" × N),
 * which can appear when the source exported with a merged banner row.
 */
function readRowsWithSmartHeader(buf: ArrayBuffer): any[] {
  const wb = xlsx.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  if (aoa.length === 0) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(3, aoa.length); i++) {
    const row = (aoa[i] || []).map((v) => (v == null ? "" : String(v).trim()));
    const nonEmpty = row.filter(Boolean);
    if (nonEmpty.length < 1) continue;
    const uniq = new Set(nonEmpty);
    // If every non-empty cell is identical → junk banner, skip.
    if (uniq.size === 1 && nonEmpty.length > 1) continue;
    headerIdx = i;
    break;
  }

  const headers = (aoa[headerIdx] || []).map((v, i) =>
    v == null || String(v).trim() === "" ? `col_${i}` : String(v).trim(),
  );
  // Deduplicate header names (Excel-style: name, name_1, name_2, ...)
  const seen: Record<string, number> = {};
  const uniqHeaders = headers.map((h) => {
    const n = seen[h] ?? 0;
    seen[h] = n + 1;
    return n === 0 ? h : `${h}_${n}`;
  });

  const out: any[] = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const obj: any = {};
    let hasVal = false;
    uniqHeaders.forEach((h, i) => {
      const v = row[i] ?? null;
      obj[h] = v;
      if (v != null && String(v).trim() !== "") hasVal = true;
    });
    if (hasVal) out.push(obj);
  }
  return out;
}

export default function ImportProductsPage() {
  const [mode, setMode] = useState<Mode>("products");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [deleteExisting, setDeleteExisting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addLog = (m: string) => setLogs((p) => [...p, m]);

  // Cache for brand/category lookups during a run
  const brandCache = new Map<string, string>();
  const categoryCache = new Map<string, string>();

  async function getOrCreateBrand(name: string): Promise<string | null> {
    const key = name.trim();
    if (!key) return null;
    if (brandCache.has(key)) return brandCache.get(key)!;
    const { data: existing } = await supabase
      .from("product_companies").select("id").eq("name", key).maybeSingle();
    if (existing?.id) { brandCache.set(key, existing.id); return existing.id; }
    const { data: created, error } = await supabase
      .from("product_companies").insert({ name: key }).select("id").single();
    if (error) throw new Error(`تعذّر إنشاء ماركة "${key}": ${error.message}`);
    brandCache.set(key, created.id);
    return created.id;
  }

  async function getOrCreateCategory(name: string): Promise<string | null> {
    const key = name.trim();
    if (!key) return null;
    if (categoryCache.has(key)) return categoryCache.get(key)!;
    const { data: existing } = await supabase
      .from("product_categories").select("id").eq("name", key).maybeSingle();
    if (existing?.id) { categoryCache.set(key, existing.id); return existing.id; }
    const { data: created, error } = await supabase
      .from("product_categories").insert({ name: key }).select("id").single();
    if (error) throw new Error(`تعذّر إنشاء فئة "${key}": ${error.message}`);
    categoryCache.set(key, created.id);
    return created.id;
  }

  const handleImport = async () => {
    if (!file) return toast.error("اختر ملف أولاً");
    setBusy(true);
    setLogs([]);
    brandCache.clear();
    categoryCache.clear();
    try {
      const buf = await file.arrayBuffer();
      const rows = readRowsWithSmartHeader(buf);
      addLog(`عدد الصفوف المقروءة: ${rows.length}`);
      if (rows.length === 0) throw new Error("الملف فارغ");

      const headers = Object.keys(rows[0]);
      const colMap = detectColumns(headers);
      addLog(`الأعمدة المكتشفة:`);
      for (const [h, f] of Object.entries(colMap)) addLog(`  "${h}" → ${f}`);
      const unmapped = headers.filter((h) => !colMap[h]);
      if (unmapped.length) addLog(`أعمدة غير معروفة (سيتم تجاهلها): ${unmapped.join(", ")}`);

      const hasName = Object.values(colMap).includes("name");
      if (!hasName) throw new Error("لم يتم العثور على عمود الاسم في الملف");

      // ── Optional delete before insert ───────────────────────────────────
      if (deleteExisting) {
        if (mode === "products") {
          addLog(`🗑️ حذف روابط الماركات والفئات...`);
          await supabase.from("product_brand_links").delete().not("product_id", "is", null);
          await supabase.from("product_category_links").delete().not("product_id", "is", null);
          addLog(`🗑️ حذف كل المنتجات القديمة...`);
          const { error } = await supabase.from("products").delete().not("id", "is", null);
          if (error) throw new Error(`فشل الحذف: ${error.message}`);
        } else {
          const table = mode === "customers" ? "customers" : "suppliers";
          addLog(`🗑️ حذف كل السجلات القديمة من ${table}...`);
          const { error } = await supabase.from(table).delete().not("id", "is", null);
          if (error) throw new Error(`فشل الحذف: ${error.message}`);
        }
        addLog(`✅ تم الحذف`);
      }

      // Collect headers per field (name may appear multiple times).
      const nameHeaders = Object.entries(colMap).filter(([, f]) => f === "name").map(([h]) => h);
      const otherEntries = Object.entries(colMap).filter(([, f]) => f !== "name");

      type ProductRow = {
        name: string;
        sku: string | null;
        unit: string | null;
        sale_price: number;
        purchase_price: number;
        foreign_price: number;
        stock_quantity: number;
        min_stock: number;
        _brand?: string | null;
        _category?: string | null;
      };
      const toInsert: any[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const shared: any = {};
        for (const [h, field] of otherEntries) shared[field] = row[h];

        for (const nh of nameHeaders) {
          const name = String(row[nh] ?? "").trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          if (mode === "products") {
            const p: ProductRow = {
              name,
              sku: shared.sku != null ? String(shared.sku).trim() || null : null,
              unit: shared.unit != null ? String(shared.unit).trim() || null : null,
              sale_price: toNumber(shared.sale_price),
              purchase_price: toNumber(shared.purchase_price),
              foreign_price: toNumber(shared.foreign_price),
              stock_quantity: toNumber(shared.stock_quantity),
              min_stock: toNumber(shared.min_stock),
              _brand: shared.brand ? String(shared.brand).trim() : null,
              _category: shared.category ? String(shared.category).trim() : null,
            };
            toInsert.push(p);
          } else if (mode === "customers") {
            toInsert.push({
              name,
              phone: cleanPhone(shared.phone),
              whatsapp: cleanPhone(shared.whatsapp),
              email: shared.email ?? null,
              address: shared.address ?? null,
              city: shared.city ?? null,
              company: shared.company ?? null,
              notes: shared.notes ?? null,
            });
          } else {
            toInsert.push({
              name,
              phone: cleanPhone(shared.phone),
              email: shared.email ?? null,
              company: shared.company ?? null,
            });
          }
        }
      }
      addLog(`صفوف صالحة للإدراج: ${toInsert.length}`);

      if (mode === "products") {
        // Pre-create all distinct brands/categories once (avoids per-row roundtrips).
        const brandNames = Array.from(new Set(toInsert.map((p: any) => p._brand).filter(Boolean))) as string[];
        const catNames = Array.from(new Set(toInsert.map((p: any) => p._category).filter(Boolean))) as string[];
        addLog(`ماركات مميّزة: ${brandNames.length} — فئات مميّزة: ${catNames.length}`);
        for (const b of brandNames) await getOrCreateBrand(b);
        for (const c of catNames) await getOrCreateCategory(c);

        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += 50) {
          const batch = toInsert.slice(i, i + 50);
          const rowsToInsert = batch.map((p: any) => ({
            name: p.name,
            sku: p.sku,
            unit: p.unit,
            sale_price: p.sale_price,
            purchase_price: p.purchase_price,
            foreign_price: p.foreign_price,
            stock_quantity: p.stock_quantity,
            min_stock: p.min_stock,
            company_id: p._brand ? brandCache.get(p._brand) ?? null : null,
            category_id: p._category ? categoryCache.get(p._category) ?? null : null,
          }));
          const { data: createdRows, error } = await supabase
            .from("products").insert(rowsToInsert).select("id");
          if (error) { addLog(`❌ خطأ عند الصف ${i}: ${error.message}`); throw error; }

          // Create link rows so the many-to-many tables stay in sync.
          const brandLinks: any[] = [];
          const catLinks: any[] = [];
          (createdRows || []).forEach((r: any, idx: number) => {
            const src = batch[idx];
            const bId = src._brand ? brandCache.get(src._brand) : null;
            const cId = src._category ? categoryCache.get(src._category) : null;
            if (bId) brandLinks.push({ product_id: r.id, brand_id: bId });
            if (cId) catLinks.push({ product_id: r.id, category_id: cId });
          });
          if (brandLinks.length) await supabase.from("product_brand_links").insert(brandLinks);
          if (catLinks.length) await supabase.from("product_category_links").insert(catLinks);

          inserted += batch.length;
          addLog(`  ... ${inserted}/${toInsert.length}`);
          await delay(60);
        }
        addLog(`✅ تم إدراج ${inserted} منتج.`);
        toast.success(`تم استيراد ${inserted} منتج`);
        window.dispatchEvent(new Event("products:changed"));
      } else {
        const table = mode === "customers" ? "customers" : "suppliers";
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += 50) {
          const batch = toInsert.slice(i, i + 50);
          const { error } = await supabase.from(table).insert(batch);
          if (error) { addLog(`❌ خطأ عند الصف ${i}: ${error.message}`); throw error; }
          inserted += batch.length;
          addLog(`  ... ${inserted}/${toInsert.length}`);
          await delay(60);
        }
        addLog(`✅ تم إدراج ${inserted} سجل في ${table}.`);
        toast.success(`تم استيراد ${inserted} سجل`);
      }
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
              سيقوم النظام باكتشاف الأعمدة تلقائياً من ترويسة الملف، ويتخطى صفوف الترويسة الزائفة (مثل Products×N).
              <br />
              {mode === "products" && "الحقول المدعومة: الاسم / السعر المحلى (بيع) / السعر الأجنبى / سعر الشراء / الكمية / الحد الأدنى / الوحدة / الكود / الماركة / الفئة."}
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
