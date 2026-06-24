import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowRight, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";

type Row = {
  id: string;
  old_number: string;
  new_number?: string;
  status: "pending" | "ok" | "skipped" | "error";
  reason?: string;
};

const PREFIX = "POS-";

function pad(n: number, width = 4) {
  return String(n).padStart(width, "0");
}

export default function MigratePosNumbersPage() {
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [nextSeq, setNextSeq] = useState<number>(1);
  const [doneAt, setDoneAt] = useState<Date | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setDoneAt(null);
    try {
      // 1) Old POS invoices that don't have POS- prefix
      const { data: bad, error: e1 } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("source", "pos")
        .not("invoice_number", "ilike", `${PREFIX}%`)
        .order("created_at", { ascending: true });
      if (e1) throw e1;

      // 2) Compute next POS- sequence from existing POS- numbers
      const { data: existing, error: e2 } = await supabase
        .from("invoices")
        .select("invoice_number")
        .ilike("invoice_number", `${PREFIX}%`);
      if (e2) throw e2;

      let maxSeq = 0;
      for (const r of existing ?? []) {
        const m = String(r.invoice_number || "").match(/POS-(\d+)/i);
        if (m) {
          const v = parseInt(m[1], 10);
          if (!Number.isNaN(v) && v > maxSeq) maxSeq = v;
        }
      }
      setNextSeq(maxSeq + 1);

      setRows(
        (bad ?? []).map((r) => ({
          id: r.id as string,
          old_number: String(r.invoice_number ?? ""),
          status: "pending",
        }))
      );
    } catch (err: any) {
      toast.error("فشل المسح: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  const run = useCallback(async () => {
    if (!rows.length) return;
    setRunning(true);
    const updated: Row[] = [...rows];
    let seq = nextSeq;

    // Pre-compute proposed numbers and detect conflicts
    const proposed: string[] = [];
    for (let i = 0; i < updated.length; i++) {
      proposed.push(`${PREFIX}${pad(seq + i)}`);
    }

    // Check for any conflicts with already-existing invoice numbers
    const { data: clash, error: clashErr } = await supabase
      .from("invoices")
      .select("invoice_number")
      .in("invoice_number", proposed);
    if (clashErr) {
      toast.error("تعذر التحقق من التعارض: " + clashErr.message);
      setRunning(false);
      return;
    }
    const clashSet = new Set((clash ?? []).map((c) => String(c.invoice_number)));

    for (let i = 0; i < updated.length; i++) {
      let candidate = `${PREFIX}${pad(seq)}`;
      // Skip any candidate that clashes
      while (clashSet.has(candidate)) {
        seq += 1;
        candidate = `${PREFIX}${pad(seq)}`;
      }

      try {
        const { error } = await supabase
          .from("invoices")
          .update({ invoice_number: candidate, updated_at: new Date().toISOString() })
          .eq("id", updated[i].id);
        if (error) {
          updated[i] = { ...updated[i], status: "error", reason: error.message };
        } else {
          updated[i] = { ...updated[i], status: "ok", new_number: candidate };
          clashSet.add(candidate);
          seq += 1;
        }
      } catch (err: any) {
        updated[i] = { ...updated[i], status: "error", reason: err?.message || String(err) };
      }
      setRows([...updated]);
    }

    setRunning(false);
    setDoneAt(new Date());
    const okCount = updated.filter((r) => r.status === "ok").length;
    const errCount = updated.filter((r) => r.status === "error").length;
    toast.success(`اكتمل الترحيل: ${okCount} نجاح، ${errCount} فشل`);
  }, [rows, nextSeq]);

  const okCount = rows.filter((r) => r.status === "ok").length;
  const errCount = rows.filter((r) => r.status === "error").length;
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="container mx-auto p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">ترحيل ترقيم فواتير الكاش (INV → POS)</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/invoices/cash/list">إدارة الكاش</Link>
          </Button>
          <Button variant="outline" onClick={() => void scan()} disabled={loading || running}>
            <RefreshCcw className="h-4 w-4 ml-1" /> إعادة المسح
          </Button>
          <Button onClick={() => void run()} disabled={running || loading || rows.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <ArrowRight className="h-4 w-4 ml-1" />}
            تشغيل الترحيل
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          هذه الأداة تبحث عن فواتير كاش (source=pos) أرقامها لا تبدأ بـ <code>POS-</code> وتعيد ترقيمها فقط بدون تغيير المعرفات أو أي بيانات أخرى. الترقيم يبدأ من{" "}
          <strong>{PREFIX}{pad(nextSeq)}</strong> ويتخطى أي رقم مستخدم مسبقاً.
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">للمراجعة</div><div className="text-2xl font-bold">{rows.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">قيد الانتظار</div><div className="text-2xl font-bold">{pendingCount}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">تم بنجاح</div><div className="text-2xl font-bold text-green-600">{okCount}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">فشل</div><div className="text-2xl font-bold text-red-600">{errCount}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">الرقم القديم</th>
              <th className="p-2 text-right">الرقم الجديد</th>
              <th className="p-2 text-right">الحالة</th>
              <th className="p-2 text-right">السبب</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">
                لا توجد فواتير كاش تحتاج لإعادة ترقيم. كل شيء بصيغة POS-.
              </td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{i + 1}</td>
                <td className="p-2 font-mono">{r.old_number}</td>
                <td className="p-2 font-mono">{r.new_number || "—"}</td>
                <td className="p-2">
                  {r.status === "ok" && <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> تم</span>}
                  {r.status === "error" && <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="h-4 w-4" /> فشل</span>}
                  {r.status === "pending" && <span className="text-muted-foreground">بانتظار</span>}
                  {r.status === "skipped" && <span className="text-muted-foreground">تم التخطي</span>}
                </td>
                <td className="p-2 text-xs text-muted-foreground">{r.reason || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {doneAt && (
        <p className="text-xs text-muted-foreground">آخر تشغيل: {doneAt.toLocaleString("ar-EG")}</p>
      )}
    </div>
  );
}
