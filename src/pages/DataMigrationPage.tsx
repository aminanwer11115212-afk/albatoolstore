import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Circle } from "lucide-react";
import * as xlsx from "xlsx";

// ترتيب الحذف: من children إلى parents لتفادي قيود FK
const DELETE_ORDER: string[] = [
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
  "quotes_packaging_items",
  "quotes_packaging",
  "quote_transports",
  "deleted_quote_items",
  "quote_items",
  "quotes",
  "purchase_items",
  "purchase_orders",
  "stock_return_items",
  "stock_returns",
  "stock_transfer_items",
  "stock_transfers",
  "product_category_links",
  "product_brand_links",
  "customer_destinations",
  "customer_preferred_transporter",
  "customer_transporters",
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

type LogKind = "info" | "success" | "error" | "warn";
type LogEntry = { kind: LogKind; msg: string; at: string };
type StepStatus = "pending" | "running" | "done" | "error";
type Step = { key: string; title: string; status: StepStatus; progress: number; detail?: string };

type PreflightIssue = { row: number; field: string; message: string; severity: "error" | "warn" };
type PreflightReport = {
  fileOk: boolean;
  totalRows: number;
  validRows: number;
  emptyRows: number;
  duplicates: number;
  headers: string[];
  missingColumns: string[];
  issues: PreflightIssue[];
  error?: string;
};

const REQUIRED_CUSTOMER_COLS = ["الاسم / الجهة", "رقم الهاتف"];
const REQUIRED_PRODUCT_COLS = ["اسم المنتج", "مفعل"];

async function preflightFile(
  url: string,
  kind: "customers" | "products"
): Promise<PreflightReport> {
  const empty: PreflightReport = {
    fileOk: false, totalRows: 0, validRows: 0, emptyRows: 0,
    duplicates: 0, headers: [], missingColumns: [], issues: [],
  };
  try {
    const res = await fetch(url);
    if (!res.ok) return { ...empty, error: `تعذّر تحميل ${url} (HTTP ${res.status})` };
    const buf = await res.arrayBuffer();
    const wb = xlsx.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    if (rows.length === 0) return { ...empty, error: "الملف فارغ" };

    const headers = (rows[0] ?? []).map((h: any) => String(h ?? "").trim());
    const required = kind === "customers" ? REQUIRED_CUSTOMER_COLS : REQUIRED_PRODUCT_COLS;
    const missingColumns: string[] = [];
    // فقط نتحقق من وجود العمودين الأولين (الاسم + الحقل الثاني)
    if (!headers[0]) missingColumns.push(required[0]);
    if (!headers[1]) missingColumns.push(required[1]);

    const issues: PreflightIssue[] = [];
    const seen = new Map<string, number>();
    let validRows = 0, emptyRows = 0, duplicates = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const name = row[0] ? String(row[0]).trim() : "";
      if (!name) { emptyRows++; continue; }

      if (kind === "customers") {
        const phoneRaw = row[1];
        const phone = phoneRaw == null ? "" : String(phoneRaw).replace(/[^0-9+]/g, "");
        if (phoneRaw != null && String(phoneRaw).trim() && !phone) {
          issues.push({ row: i + 1, field: "phone", message: `هاتف غير صالح: "${phoneRaw}"`, severity: "warn" });
        }
        if (name.length > 200) {
          issues.push({ row: i + 1, field: "name", message: "الاسم أطول من 200 حرف", severity: "warn" });
        }
      } else {
        const active = String(row[1] ?? "").toLowerCase();
        if (row[1] != null && String(row[1]).trim() &&
            !["x", "✓", "true", "1", "yes", "نعم", ""].some((v) => active === v || active.includes(v))) {
          // غير حرج
        }
        if (name.length > 200) {
          issues.push({ row: i + 1, field: "name", message: "اسم المنتج أطول من 200 حرف", severity: "warn" });
        }
      }

      const key = name.toLowerCase();
      if (seen.has(key)) {
        duplicates++;
        issues.push({
          row: i + 1, field: "name",
          message: `مكرر مع الصف ${seen.get(key)}: "${name}"`,
          severity: "warn",
        });
      } else {
        seen.set(key, i + 1);
      }
      validRows++;
    }

    return {
      fileOk: true,
      totalRows: rows.length - 1,
      validRows, emptyRows, duplicates,
      headers, missingColumns, issues,
    };
  } catch (e: any) {
    return { ...empty, error: e?.message ?? String(e) };
  }
}

const INITIAL_STEPS: Step[] = [
  { key: "wipe", title: "الدفعة 1 — تفريغ كل البيانات", status: "pending", progress: 0 },
  { key: "customers", title: "الدفعة 2 — استيراد العملاء", status: "pending", progress: 0 },
  { key: "products", title: "الدفعة 3 — استيراد المنتجات", status: "pending", progress: 0 },
];

export default function DataMigrationPage() {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [overall, setOverall] = useState(0);
  const [stats, setStats] = useState({ success: 0, errors: 0, warnings: 0 });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [preflight, setPreflight] = useState<null | {
    customers: PreflightReport;
    products: PreflightReport;
  }>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // مؤقّت الوقت المنقضي
  useEffect(() => {
    if (!startedAt || !loading) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [startedAt, loading]);

  // تمرير تلقائي للسجل
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (kind: LogKind, msg: string) => {
    const at = new Date().toLocaleTimeString("ar-EG", { hour12: false });
    setLogs((p) => [...p, { kind, msg, at }]);
    setStats((s) => ({
      success: s.success + (kind === "success" ? 1 : 0),
      errors: s.errors + (kind === "error" ? 1 : 0),
      warnings: s.warnings + (kind === "warn" ? 1 : 0),
    }));
    // eslint-disable-next-line no-console
    console.log(`[${kind}]`, msg);
  };

  const updateStep = (key: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const recomputeOverall = (curSteps: Step[]) => {
    const total = curSteps.reduce((sum, s) => sum + s.progress, 0) / curSteps.length;
    setOverall(Math.round(total));
  };

  const setStepProgress = (key: string, progress: number, detail?: string) => {
    setSteps((prev) => {
      const next = prev.map((s) => (s.key === key ? { ...s, progress, detail: detail ?? s.detail } : s));
      recomputeOverall(next);
      return next;
    });
  };

  // ───────── الدفعة 1 ─────────
  const wipeAll = async () => {
    updateStep("wipe", { status: "running", progress: 0, detail: "بدء التفريغ..." });
    addLog("info", "════ الدفعة 1: تفريغ كل البيانات ════");
    const total = DELETE_ORDER.length;
    for (let i = 0; i < total; i++) {
      const table = DELETE_ORDER[i];
      try {
        const { error, count } = await (supabase as any)
          .from(table)
          .delete({ count: "exact" })
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (error) {
          addLog("warn", `تخطّي ${table}: ${error.message}`);
        } else {
          addLog("success", `حُذف ${count ?? "?"} صف من ${table}`);
        }
      } catch (e: any) {
        addLog("error", `فشل ${table}: ${e?.message ?? e}`);
      }
      setStepProgress("wipe", Math.round(((i + 1) / total) * 100), `${i + 1}/${total} — ${table}`);
      await delay(40);
    }
    updateStep("wipe", { status: "done", progress: 100, detail: "اكتمل التفريغ" });
    addLog("success", "✅ اكتمل التفريغ.");
  };

  // ───────── الدفعة 2 ─────────
  const importCustomers = async () => {
    updateStep("customers", { status: "running", progress: 0, detail: "قراءة الملف..." });
    addLog("info", "════ الدفعة 2: استيراد العملاء ════");
    const res = await fetch("/import/customers.xlsx");
    if (!res.ok) throw new Error("تعذّر تحميل /import/customers.xlsx");
    const buf = await res.arrayBuffer();
    const wb = xlsx.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    const toInsert: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = row?.[0] ? String(row[0]).trim() : "";
      if (!name) continue;
      toInsert.push({ name, whatsapp: cleanPhone(row?.[1]), phone: null, email: null, address: null, city: null, company: null, notes: null });
    }
    addLog("info", `سيتم إدراج ${toInsert.length} عميل`);
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("customers").insert(batch);
      if (error) {
        addLog("error", `خطأ عند الصف ${i}: ${error.message}`);
        throw new Error(error.message);
      }
      inserted += batch.length;
      setStepProgress("customers", Math.round((inserted / toInsert.length) * 100), `${inserted}/${toInsert.length}`);
      addLog("success", `أُدرج ${inserted}/${toInsert.length} عميل`);
      await delay(60);
    }
    updateStep("customers", { status: "done", progress: 100, detail: `${inserted} عميل` });
  };

  // ───────── الدفعة 3 ─────────
  const importProducts = async () => {
    updateStep("products", { status: "running", progress: 0, detail: "قراءة الملف..." });
    addLog("info", "════ الدفعة 3: استيراد المنتجات ════");
    const res = await fetch("/import/products.xlsx");
    if (!res.ok) throw new Error("تعذّر تحميل /import/products.xlsx");
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
      toInsert.push({ name, is_active: isActive, stock_quantity: 0, sale_price: 0, purchase_price: 0, min_stock: 0 });
    }
    addLog("info", `سيتم إدراج ${toInsert.length} منتج`);
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("products").insert(batch);
      if (error) {
        addLog("error", `خطأ عند الصف ${i}: ${error.message}`);
        throw new Error(error.message);
      }
      inserted += batch.length;
      setStepProgress("products", Math.round((inserted / toInsert.length) * 100), `${inserted}/${toInsert.length}`);
      addLog("success", `أُدرج ${inserted}/${toInsert.length} منتج`);
      await delay(60);
    }
    updateStep("products", { status: "done", progress: 100, detail: `${inserted} منتج` });
  };

  const reset = () => {
    setLogs([]);
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })));
    setOverall(0);
    setStats({ success: 0, errors: 0, warnings: 0 });
    setElapsed(0);
  };

  const runPreflight = async () => {
    setPreflightBusy(true);
    try {
      const [customers, products] = await Promise.all([
        preflightFile("/import/customers.xlsx", "customers"),
        preflightFile("/import/products.xlsx", "products"),
      ]);
      setPreflight({ customers, products });
      const totalIssues = customers.issues.length + products.issues.length;
      const blocked =
        !customers.fileOk || !products.fileOk ||
        customers.missingColumns.length > 0 || products.missingColumns.length > 0;
      if (blocked) toast.error("توجد مشاكل تمنع التنفيذ");
      else if (totalIssues > 0) toast.warning(`اكتمل التحقق مع ${totalIssues} تنبيه`);
      else toast.success("الملفات صالحة للاستيراد");
    } finally {
      setPreflightBusy(false);
    }
  };

  const preflightBlocked = !!preflight && (
    !preflight.customers.fileOk || !preflight.products.fileOk ||
    preflight.customers.missingColumns.length > 0 ||
    preflight.products.missingColumns.length > 0
  );

  const runAll = async () => {
    if (confirm !== CONFIRM_PHRASE) {
      toast.error(`اكتب "${CONFIRM_PHRASE}" للتأكيد`);
      return;
    }
    reset();
    setLoading(true);
    setStartedAt(Date.now());
    try {
      await wipeAll();
      await importCustomers();
      await importProducts();
      addLog("success", "🎉 اكتملت كل الدفعات بنجاح!");
      toast.success("اكتمل ترحيل البيانات");
      window.dispatchEvent(new Event("products:changed"));
      window.dispatchEvent(new Event("invoices:changed"));
    } catch (e: any) {
      addLog("error", `❌ توقّف التنفيذ: ${e.message}`);
      // ضع الخطوة الحالية في حالة خطأ
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runWipeOnly = async () => {
    if (confirm !== CONFIRM_PHRASE) {
      toast.error(`اكتب "${CONFIRM_PHRASE}" للتأكيد`);
      return;
    }
    reset();
    setLoading(true);
    setStartedAt(Date.now());
    try {
      await wipeAll();
      // اعتبر باقي الخطوات متجاهلة
      updateStep("customers", { status: "done", progress: 100, detail: "تم التخطي" });
      updateStep("products", { status: "done", progress: 100, detail: "تم التخطي" });
      toast.success("تم تفريغ النظام");
    } catch (e: any) {
      addLog("error", `❌ ${e.message}`);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const StepIcon = ({ status }: { status: StepStatus }) => {
    if (status === "done") return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    if (status === "error") return <XCircle className="w-5 h-5 text-destructive" />;
    if (status === "running") return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
    return <Circle className="w-5 h-5 text-muted-foreground" />;
  };

  const logColor = (k: LogKind) =>
    k === "success" ? "text-green-400"
    : k === "error" ? "text-red-400"
    : k === "warn" ? "text-yellow-400"
    : "text-slate-300";

  return (
    <div className="p-6" dir="rtl">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>ترحيل بيانات النظام — تتبع التقدم خطوة بخطوة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* شريط التقدم الإجمالي */}
          <div className="space-y-2 p-4 rounded-lg border bg-card">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold">التقدم الإجمالي</span>
              <span className="font-mono tabular-nums">{overall}%</span>
            </div>
            <Progress value={overall} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>الوقت المنقضي: {fmtTime(elapsed)}</span>
              <span>
                <span className="text-green-600">✓ {stats.success}</span>
                {" · "}
                <span className="text-yellow-600">⚠ {stats.warnings}</span>
                {" · "}
                <span className="text-destructive">✕ {stats.errors}</span>
              </span>
            </div>
          </div>

          {/* الخطوات */}
          <div className="space-y-3">
            {steps.map((s) => (
              <div key={s.key} className="border rounded-lg p-3 bg-card">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <StepIcon status={s.status} />
                    <span className="font-medium text-sm">{s.title}</span>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-muted-foreground">{s.progress}%</span>
                </div>
                <Progress value={s.progress} className="h-2" />
                {s.detail && <div className="text-xs text-muted-foreground mt-1.5">{s.detail}</div>}
              </div>
            ))}
          </div>

          {/* التأكيد والأزرار */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              اكتب <code className="bg-muted px-1 rounded">{CONFIRM_PHRASE}</code> للتأكيد:
            </label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} placeholder={CONFIRM_PHRASE} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={runAll} disabled={loading} variant="destructive">
              {loading ? "جارٍ التنفيذ..." : "تنفيذ كل الدفعات"}
            </Button>
            <Button onClick={runWipeOnly} disabled={loading} variant="outline">
              تفريغ فقط
            </Button>
            <Button onClick={reset} disabled={loading} variant="ghost">
              إعادة تعيين
            </Button>
          </div>

          {/* السجل */}
          <div>
            <div className="text-sm font-medium mb-2">سجل التنفيذ ({logs.length})</div>
            <div ref={logRef} className="bg-slate-900 p-4 rounded-md h-80 overflow-y-auto font-mono text-xs space-y-0.5">
              {logs.map((l, i) => (
                <div key={i} className={logColor(l.kind)}>
                  <span className="text-slate-500">[{l.at}]</span> {l.msg}
                </div>
              ))}
              {logs.length === 0 && <div className="text-slate-500">سجل العملية سيظهر هنا...</div>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
