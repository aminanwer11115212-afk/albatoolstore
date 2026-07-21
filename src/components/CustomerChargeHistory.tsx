import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Wallet, ArrowDownCircle, PlusCircle, Download, AlertTriangle, CheckCircle2, ArrowUpDown, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { computeReconciliation, sortGroups, type SortKey } from "@/lib/chargeReconciliation";
import { ReverseChargeConfirmDialog } from "@/components/customer/ReverseChargeConfirmDialog";
import EditChargeDialog, { type EditableCharge } from "@/components/finance/EditChargeDialog";
import { useUserRole } from "@/hooks/useUserRole";
import { Pencil } from "lucide-react";

const PAGE_SIZE = 10;
const LS_KEY = (cid: string) => `albatool.chargeHistory.filters.${cid}`;

interface ChargeItem {
  invoice_id?: string; invoice_number?: string; invoice_date?: string;
  invoice_total: number; applied: number;
  paid_before: number; paid_after: number;
  remaining_before: number; remaining_after: number;
  new_status?: string;
}
interface ChargeGroup {
  groupId: string; date: string; created_at: string; method: string | null;
  accountName?: string; bankName?: string; description?: string;
  items: ChargeItem[]; surplus: number; allocated: number; total: number;
}

function readInitial(customerId: string, sp: URLSearchParams) {
  const fromUrl = {
    from: sp.get("chFrom") || "",
    to: sp.get("chTo") || "",
    method: sp.get("chMethod") || "all",
    sort: (sp.get("chSort") as SortKey) || "date_desc",
  };
  if (fromUrl.from || fromUrl.to || fromUrl.method !== "all" || fromUrl.sort !== "date_desc") return fromUrl;
  try {
    const raw = localStorage.getItem(LS_KEY(customerId));
    if (raw) return { ...fromUrl, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return fromUrl;
}

export default function CustomerChargeHistory({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = useMemo(() => readInitial(customerId, searchParams), [customerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [methodFilter, setMethodFilter] = useState<string>(initial.method);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [reconMsg, setReconMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reversingGroupId, setReversingGroupId] = useState<string | null>(null);
  const [pendingReverse, setPendingReverse] = useState<ChargeGroup | null>(null);

  async function executeReverse(g: ChargeGroup) {
    setReversingGroupId(g.groupId);
    try {
      const { data, error } = await (supabase as any).rpc("reverse_customer_charge", { _group_id: g.groupId });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.reason || "فشل إلغاء الشحنة");

      // Audit log — record who reversed, invoice numbers, group_id, when, and reason.
      try {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email || null;
        const uid = userData?.user?.id || null;
        await (supabase as any).from("activity_log").insert({
          entity_type: "customer_charge",
          entity_id: customerId,
          action: "reverse_charge",
          user_email: email,
          user_name: email,
          changed_by: uid,
          table_name: "transactions",
          record_id: null,
          details: {
            group_id: g.groupId,
            charge_date: g.date,
            method: g.method,
            total: g.total,
            allocated: g.allocated,
            surplus: g.surplus,
            invoices: g.items.map((it) => ({
              invoice_id: it.invoice_id || null,
              invoice_number: it.invoice_number || null,
              applied: it.applied,
              paid_before: it.paid_before,
              paid_after: it.paid_after,
            })),
            rpc_result: data,
            reason: "manual_reverse_from_customer_detail",
            executed_at: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.warn("[reverse_customer_charge] audit log failed (non-fatal)", auditErr);
      }

      await qc.invalidateQueries({ queryKey: ["customer-charge-history", customerId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      await qc.invalidateQueries({ queryKey: ["customer-audit-log", customerId] });

      const invLine = g.items.length
        ? ` — تأثّرت ${g.items.length} فاتورة (${g.items.map((i) => i.invoice_number || "?").slice(0, 3).join("، ")}${g.items.length > 3 ? "…" : ""})`
        : "";
      const surLine = g.surplus > 0.01 ? ` وحُذف ${fmt(g.surplus)} من الرصيد الدائن` : "";
      toast.success(`تم إلغاء شحنة ${fmt(g.total)}${invLine}${surLine}`, { duration: 6000 });
      setPendingReverse(null);
    } catch (e: any) {
      // فشل عام → أعِد تحميل كل مصادر البيانات لضمان عدم بقاء تغييرات جزئية في الواجهة.
      await qc.invalidateQueries({ queryKey: ["customer-charge-history", customerId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      await qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.error(`تعذّر إلغاء الشحنة: ${e?.message || "خطأ غير معروف"} — تم إعادة تحميل البيانات، حالة الفواتير لم تتغيّر.`, { duration: 8000 });
    } finally {
      setReversingGroupId(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ["customer-charge-history", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, date, method, description, category, allocation, reference_id, created_at, account_id, accounts(name, bank_name)")
        .eq("customer_id", customerId)
        .in("category", ["customer_payment", "customer_credit"])
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Persist filters (URL + localStorage) so reload keeps the same view.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string, def: string) => {
      if (v && v !== def) next.set(k, v); else next.delete(k);
    };
    setOrDel("chFrom", fromDate, "");
    setOrDel("chTo", toDate, "");
    setOrDel("chMethod", methodFilter, "all");
    setOrDel("chSort", sort, "date_desc");
    setSearchParams(next, { replace: true });
    try {
      localStorage.setItem(LS_KEY(customerId), JSON.stringify({ from: fromDate, to: toDate, method: methodFilter, sort }));
    } catch { /* ignore quota */ }
  }, [fromDate, toDate, methodFilter, sort, customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: any new/updated/deleted transaction or invoice for this customer → refetch.
  useEffect(() => {
    const channel = supabase
      .channel(`charge-history:${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `customer_id=eq.${customerId}` }, () => {
        qc.invalidateQueries({ queryKey: ["customer-charge-history", customerId] });
        qc.invalidateQueries({ queryKey: ["customer", customerId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `customer_id=eq.${customerId}` }, () => {
        qc.invalidateQueries({ queryKey: ["customer-charge-history", customerId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customerId, qc]);

  const groups: ChargeGroup[] = useMemo(() => {
    const map = new Map<string, ChargeGroup>();
    let orphanIdx = 0;
    for (const row of data || []) {
      const alloc: any = (row as any).allocation || {};
      const gid = alloc.group_id || `orphan-${(row as any).id || orphanIdx++}`;
      if (!map.has(gid)) {
        map.set(gid, {
          groupId: gid, date: (row as any).date, created_at: (row as any).created_at,
          method: (row as any).method,
          accountName: (row as any).accounts?.name, bankName: (row as any).accounts?.bank_name,
          description: (row as any).description,
          items: [], surplus: 0, allocated: 0, total: 0,
        });
      }
      const g = map.get(gid)!;
      if (alloc.kind === "surplus" || (row as any).category === "customer_credit") {
        g.surplus += Number((row as any).amount || 0);
      } else {
        const invoiceTotal = Number(alloc.invoice_total || 0);
        const paidBefore = Number(alloc.paid_before ?? 0);
        const applied = Number(alloc.applied ?? (row as any).amount ?? 0);
        const paidAfter = Number(alloc.paid_after ?? (paidBefore + applied));
        g.items.push({
          invoice_id: alloc.invoice_id || (row as any).reference_id,
          invoice_number: alloc.invoice_number, invoice_date: alloc.invoice_date,
          invoice_total: invoiceTotal, applied,
          paid_before: paidBefore, paid_after: paidAfter,
          remaining_before: Math.max(invoiceTotal - paidBefore, 0),
          remaining_after: Number(alloc.remaining_after ?? Math.max(invoiceTotal - paidAfter, 0)),
          new_status: alloc.new_status,
        });
        g.allocated += applied;
      }
      g.total = g.allocated + g.surplus;
    }
    return Array.from(map.values());
  }, [data]);

  const filtered = useMemo(() => {
    const f = groups.filter((g) => {
      if (fromDate && (g.date || "") < fromDate) return false;
      if (toDate && (g.date || "") > toDate) return false;
      if (methodFilter !== "all" && (g.method || "") !== methodFilter) return false;
      return true;
    });
    return sortGroups(f, sort);
  }, [groups, fromDate, toDate, methodFilter, sort]);

  const paged = useMemo(() => filtered.slice(0, visible), [filtered, visible]);

  useEffect(() => setVisible(PAGE_SIZE), [fromDate, toDate, methodFilter, sort]);

  // Reconciliation banner — runs whenever the underlying tx list changes or filters change.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const [{ data: cust }, { data: invs }] = await Promise.all([
        supabase.from("customers").select("balance, credit_balance").eq("id", customerId).maybeSingle(),
        supabase.from("invoices").select("total, paid_amount, status, source").eq("customer_id", customerId),
      ]);
      if (cancelled) return;
      const r = computeReconciliation({ customer: cust, invoices: invs || [], groups });
      setReconMsg({ ok: r.ok, text: r.text });
      if (!r.ok) toast.error(r.text);
    })();
    return () => { cancelled = true; };
  }, [data, groups, customerId]);

  const methodLabel = (m: string | null) =>
    m === "bank_transfer" || m === "bank" ? "تحويل بنكي" : m === "cash" ? "نقدي" : m || "—";

  const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const invoiceStateLabel = (remaining: number, status?: string) => {
    if (remaining <= 0.01 || status === "paid") return { label: "مسددة", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
    if (status === "partial") return { label: "عليه (جزئية)", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
    return { label: "عليه", cls: "bg-destructive/15 text-destructive" };
  };

  const exportCsv = () => {
    const header = ["group_id","date","method","account","total_charge","allocated","surplus","invoice_number","invoice_date","invoice_total","paid_before","paid_after","applied","remaining_before","remaining_after","new_status"];
    const rows: string[] = [header.join(",")];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g,'""')}"`;
    for (const g of filtered) {
      const meta = [g.groupId, g.date, methodLabel(g.method), g.bankName ? `${g.bankName} - ${g.accountName || ""}` : (g.accountName || ""), g.total, g.allocated, g.surplus];
      if (!g.items.length) {
        rows.push([...meta, "", "", "", "", "", "", "", "", g.surplus > 0.01 ? "surplus_only" : ""].map(esc).join(","));
      } else {
        for (const it of g.items) {
          rows.push([...meta, it.invoice_number || "", it.invoice_date || "", it.invoice_total, it.paid_before, it.paid_after, it.applied, it.remaining_before, it.remaining_after, it.new_status || ""].map(esc).join(","));
        }
      }
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `charge-history-${customerId}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-3 space-y-3" data-testid="charge-history-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const methodOptions = Array.from(new Set((groups.map((g) => g.method).filter(Boolean)) as string[]));

  return (
    <div className="p-3 space-y-3">
      {reconMsg && (
        <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${reconMsg.ok ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-destructive/40 bg-destructive/10 text-destructive"}`} data-testid="reconciliation-banner">
          {reconMsg.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{reconMsg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">من تاريخ</label>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">إلى تاريخ</label>
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">طريقة الدفع</label>
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الطرق</SelectItem>
              {methodOptions.map((m) => (<SelectItem key={m} value={m}>{methodLabel(m)}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpDown size={12} /> ترتيب</label>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">التاريخ (الأحدث)</SelectItem>
              <SelectItem value="date_asc">التاريخ (الأقدم)</SelectItem>
              <SelectItem value="method_asc">طريقة الدفع (أ→ي)</SelectItem>
              <SelectItem value="method_desc">طريقة الدفع (ي→أ)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(fromDate || toDate || methodFilter !== "all" || sort !== "date_desc") && (
          <Button size="sm" variant="ghost" onClick={() => { setFromDate(""); setToDate(""); setMethodFilter("all"); setSort("date_desc"); }}>مسح الفلاتر</Button>
        )}
        <div className="mr-auto flex items-center gap-3">
          <div className="text-sm text-muted-foreground">النتائج: <span className="font-bold text-foreground">{filtered.length}</span>{filtered.length !== groups.length && <span className="text-muted-foreground"> / {groups.length}</span>}</div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length} data-testid="export-charge-history-csv">
            <Download size={14} className="ml-1" /> تصدير CSV
          </Button>
        </div>
      </div>

      {!filtered.length && (
        <div className="p-8 text-center text-muted-foreground text-sm" data-testid="charge-history-empty">
          {groups.length ? "لا نتائج تطابق الفلاتر الحالية — جرّب تعديل التاريخ أو طريقة الدفع." : "لا يوجد سجل شحن رصيد لهذا العميل بعد."}
        </div>
      )}

      {paged.map((g) => (
        <div key={g.groupId} className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 text-primary font-bold"><Wallet size={16} /> شحن رصيد</div>
            <div className="text-xs text-muted-foreground">{g.date}</div>
            <div className="text-xs text-muted-foreground">•</div>
            <div className="text-xs text-muted-foreground">{methodLabel(g.method)}</div>
            {g.accountName && <><div className="text-xs text-muted-foreground">•</div><div className="text-xs text-muted-foreground">{g.bankName ? `${g.bankName} - ${g.accountName}` : g.accountName}</div></>}
            <div className="mr-auto flex items-center gap-3 text-sm">
              <div className="tabular-nums">الإجمالي: <span className="font-bold text-foreground">{fmt(g.total)}</span></div>
              {g.allocated > 0.01 && (<div className="tabular-nums text-emerald-600">سُدِّد: <span className="font-bold">{fmt(g.allocated)}</span></div>)}
              {g.surplus > 0.01 && (<div className="tabular-nums text-primary">فائض: <span className="font-bold">{fmt(g.surplus)}</span></div>)}
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setPendingReverse(g)}
                disabled={reversingGroupId === g.groupId}
                data-testid="reverse-charge-btn"
                title="إلغاء هذه الشحنة وإعادة الأرصدة"
              >
                {reversingGroupId === g.groupId ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                إلغاء الشحنة
              </Button>
            </div>
          </div>

          {g.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 text-xs text-muted-foreground">
                    <th className="text-right px-3 py-2 font-semibold">رقم الفاتورة</th>
                    <th className="text-right px-3 py-2 font-semibold">تاريخ الفاتورة</th>
                    <th className="text-right px-3 py-2 font-semibold">الإجمالي</th>
                    <th className="text-right px-3 py-2 font-semibold">مدفوع قبل</th>
                    <th className="text-right px-3 py-2 font-semibold">مدفوع بعد</th>
                    <th className="text-right px-3 py-2 font-semibold">المطبَّق</th>
                    <th className="text-right px-3 py-2 font-semibold">متبقي قبل</th>
                    <th className="text-right px-3 py-2 font-semibold">متبقي بعد</th>
                    <th className="text-right px-3 py-2 font-semibold">الحالة</th>
                    <th className="text-right px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it, i) => (
                    <tr key={`${g.groupId}-${it.invoice_id}-${i}`} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {it.invoice_id ? (<Link to={`/invoices/view/${it.invoice_id}`} className="text-primary hover:underline">{it.invoice_number || "—"}</Link>) : (it.invoice_number || "—")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{it.invoice_date || "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(it.invoice_total)}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmt(it.paid_before)}</td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{fmt(it.paid_after)}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-600 font-semibold">+ {fmt(it.applied)}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmt(it.remaining_before)}</td>
                      <td className={`px-3 py-2 tabular-nums font-semibold ${it.remaining_after > 0.01 ? "text-destructive" : "text-emerald-700"}`}>{fmt(it.remaining_after)}</td>
                      <td className="px-3 py-2" data-testid="invoice-state">
                        {(() => { const s = invoiceStateLabel(it.remaining_after, it.new_status); return (
                          <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>
                        ); })()}
                      </td>
                      <td className="px-3 py-2">
                        {it.invoice_id && (<Link to={`/invoices/view/${it.invoice_id}`} className="text-muted-foreground hover:text-primary inline-flex"><ExternalLink size={14} /></Link>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : g.surplus > 0.01 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <PlusCircle size={14} className="text-primary" />
              لا فواتير غير مسددة — الشحن كامل ({fmt(g.surplus)}) أُضيف كرصيد دائن للعميل.
            </div>
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground">لا توجد تفاصيل توزيع محفوظة لهذه العملية.</div>
          )}

          {g.description && (
            <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/10 flex items-center gap-1">
              <ArrowDownCircle size={12} /> {g.description}
            </div>
          )}
        </div>
      ))}

      {visible < filtered.length && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)} data-testid="load-more-charges">
            تحميل المزيد ({filtered.length - visible} متبقي)
          </Button>
        </div>
      )}

      <ReverseChargeConfirmDialog
        open={!!pendingReverse}
        group={pendingReverse}
        pending={reversingGroupId === pendingReverse?.groupId}
        onConfirm={() => pendingReverse && executeReverse(pendingReverse)}
        onCancel={() => setPendingReverse(null)}
      />
    </div>
  );
}
