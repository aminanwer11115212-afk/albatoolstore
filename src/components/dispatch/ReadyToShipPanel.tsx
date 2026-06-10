/**
 * ReadyToShipPanel — اللوحة اليمنى لصفحة الترحيلات
 * تطابق الشكل المرجعي: تبويبات + جدول مدمج بـ checkbox للفواتير
 * ذات الحالة "جاهز للرفع" (workflow_status = ready_to_ship).
 * بعد الطباعة → تحويل الحالة إلى in_transit.
 */
import { useMemo, useState, useCallback, Fragment, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Truck, Train, User, X, Printer, RefreshCw, ChevronDown, ChevronLeft } from "lucide-react";

type Props = {
  buildPrintHTML: (invoices: any[], company: any, mode: "all" | "collected") => string;
  company: any;
  /** Optional controlled selection (lifted by parent for preview pane). */
  checked?: Set<string>;
  onCheckedChange?: (next: Set<string>) => void;
  /** When true, hide the bottom "طباعة وتحويل" footer (parent shows its own actions). */
  hideFooter?: boolean;
};

const fmtDateAr = (d?: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

type Tab = "all" | "by_transport" | "by_customer";

export default function ReadyToShipPanel({ buildPrintHTML, company, checked: checkedProp, onCheckedChange, hideFooter }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [internalChecked, setInternalChecked] = useState<Set<string>>(new Set());
  const checked = checkedProp ?? internalChecked;
  const setChecked = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const next = typeof updater === "function" ? (updater as any)(checked) : updater;
    if (onCheckedChange) onCheckedChange(next);
    else setInternalChecked(next);
  };
  const [busy, setBusy] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dispatch-ready-to-ship"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select(
          `id, invoice_number, date, total, currency_code, workflow_status,
           paid_amount, customer_id, packaging_total_pieces,
           customers(id, name, phone),
           invoice_items(id, product_name, quantity, products(name)),
           invoice_transports(id, transporter_id, transporters(id, name))`
        )
        .eq("workflow_status", "ready_to_ship")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Auto-refresh whenever an invoice changes anywhere in the app
  // (status edits, packaging save, transport save, etc.)
  useEffect(() => {
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] });
    };
    window.addEventListener("invoices:changed", onChange);
    return () => window.removeEventListener("invoices:changed", onChange);
  }, [qc]);

  // Realtime: any change to workflow_status (or any invoices row) → refetch
  useEffect(() => {
    const channel = (supabase as any)
      .channel("dispatch-ready-to-ship-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] }),
      )
      .subscribe();
    return () => { try { (supabase as any).removeChannel(channel); } catch {} };
  }, [qc]);

  const invoices = data || [];

  const toggle = useCallback((id: string) => {
    setChecked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const allChecked = invoices.length > 0 && invoices.every((i) => checked.has(i.id));
  const toggleAll = () => {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(invoices.map((i) => i.id)));
  };

  // grouping
  const groups = useMemo(() => {
    if (tab === "all") return null;
    const map = new Map<string, { key: string; label: string; items: any[] }>();
    for (const inv of invoices) {
      let key = "—";
      let label = "بدون تصنيف";
      if (tab === "by_customer") {
        key = inv.customer_id || "cash";
        label = inv.customers?.name || "كاش";
      } else {
        const t = inv.invoice_transports?.[0];
        key = t?.transporter_id || "no_transporter";
        label = t?.transporters?.name || "بدون ناقل";
      }
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(inv);
    }
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [invoices, tab]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((p) => {
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };
  const toggleGroupCheck = (items: any[]) => {
    const ids = items.map((i) => i.id);
    const allIn = ids.every((id) => checked.has(id));
    setChecked((p) => {
      const n = new Set(p);
      if (allIn) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const printAndDispatch = async () => {
    const selected = invoices.filter((i) => checked.has(i.id));
    if (selected.length === 0) {
      toast.error("اختر فاتورة واحدة على الأقل");
      return;
    }
    setBusy(true);
    try {
      const html = buildPrintHTML(selected, company, "all");
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        toast.error("تعذّر فتح نافذة الطباعة");
        return;
      }
      win.document.write(html);
      win.document.close();
      win.onload = () => {
        win.print();
        win.onafterprint = () => win.close();
      };

      const ids = selected.map((i) => i.id);
      const { error } = await (supabase as any)
        .from("invoices")
        .update({ workflow_status: "in_transit" })
        .in("id", ids);
      if (error) throw error;

      toast.success(`تم تحويل ${ids.length} فاتورة إلى "في الطريق للترحيلات"`);
      setChecked(new Set());
      qc.invalidateQueries({ queryKey: ["dispatch-ready-to-ship"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-with-customers"] });
    } catch (e: any) {
      toast.error(e.message || "تعذّر إتمام العملية");
    } finally {
      setTimeout(() => setBusy(false), 1500);
    }
  };

  const TabBtn = ({ id, icon: Icon, label }: { id: Tab; icon: any; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rts-tab ${tab === id ? "active" : ""}`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );

  const renderRow = (inv: any, idx: number) => {
    const isChecked = checked.has(inv.id);
    return (
      <tr
        key={inv.id}
        className={isChecked ? "checked" : ""}
        onClick={() => toggle(inv.id)}
      >
        <td className="cell-check">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggle(inv.id)}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className="cell-num">{inv.invoice_number}</td>
        <td className="cell-name">{inv.customers?.name || "كاش"}</td>
        <td className="cell-date">{fmtDateAr(inv.date)}</td>
      </tr>
    );
  };

  return (
    <div className="rts-panel" dir="rtl">
      <style>{`
        .rts-panel {
          display: flex; flex-direction: column;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.04);
          height: 100%;
        }
        .rts-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px;
          background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.85));
          color: hsl(var(--primary-foreground));
        }
        .rts-header h3 { font-size: 13px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 6px; }
        .rts-refresh {
          background: rgba(255,255,255,0.18); color: inherit;
          border: none; border-radius: 6px; padding: 4px 6px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 700;
        }
        .rts-refresh:hover { background: rgba(255,255,255,0.28); }

        .rts-tabs {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 0; border-bottom: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.4);
        }
        .rts-tab {
          background: transparent; border: none;
          padding: 8px 4px; font-size: 11px; font-weight: 700; cursor: pointer;
          color: hsl(var(--muted-foreground));
          display: inline-flex; align-items: center; justify-content: center; gap: 4px;
          border-bottom: 2px solid transparent;
          transition: all 0.15s;
        }
        .rts-tab:hover { background: hsl(var(--muted) / 0.7); color: hsl(var(--foreground)); }
        .rts-tab.active {
          background: hsl(var(--card));
          color: hsl(var(--primary));
          border-bottom-color: hsl(var(--primary));
        }

        .rts-hint {
          padding: 6px 12px; font-size: 10.5px;
          color: hsl(var(--muted-foreground));
          background: hsl(var(--muted) / 0.25);
          border-bottom: 1px solid hsl(var(--border));
          text-align: center;
        }
        .rts-dragbar {
          padding: 4px 12px; font-size: 10px;
          color: hsl(var(--muted-foreground));
          border-bottom: 1px dashed hsl(var(--border));
          background: hsl(var(--background));
          text-align: center; letter-spacing: 0;
        }

        .rts-body { flex: 1; overflow: auto; }

        .rts-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .rts-table thead th {
          position: sticky; top: 0; z-index: 2;
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
          font-weight: 800; font-size: 10.5px;
          padding: 6px 6px; text-align: right;
          border-bottom: 1px solid hsl(var(--border));
          white-space: nowrap;
        }
        .rts-table thead th.cell-check { text-align: center; width: 32px; }
        .rts-table thead th.cell-num { width: 78px; text-align: center; }
        .rts-table thead th.cell-date { width: 88px; text-align: center; }
        .rts-table tbody td {
          padding: 5px 6px; border-bottom: 1px solid hsl(var(--border));
          vertical-align: middle;
        }
        .rts-table .cell-check { text-align: center; }
        .rts-table .cell-num { text-align: center; font-weight: 700; color: hsl(var(--primary)); font-variant-numeric: tabular-nums; }
        .rts-table .cell-name { font-weight: 700; }
        .rts-table .cell-date { text-align: center; color: hsl(var(--muted-foreground)); font-variant-numeric: tabular-nums; }
        .rts-table tbody tr { cursor: pointer; }
        .rts-table tbody tr:hover td { background: hsl(var(--muted) / 0.5); }
        .rts-table tbody tr.checked td { background: hsl(var(--primary) / 0.10); }

        .rts-group-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 10px; cursor: pointer;
          background: hsl(var(--muted) / 0.6);
          border-top: 1px solid hsl(var(--border));
          border-bottom: 1px solid hsl(var(--border));
          font-size: 11px; font-weight: 800;
        }
        .rts-group-head:hover { background: hsl(var(--muted)); }
        .rts-group-meta { display: inline-flex; align-items: center; gap: 6px; color: hsl(var(--muted-foreground)); font-weight: 700; font-size: 10px; }

        .rts-empty {
          text-align: center; padding: 36px 14px;
          color: hsl(var(--muted-foreground));
        }

        .rts-footer {
          border-top: 1px solid hsl(var(--border));
          padding: 8px 10px;
          background: hsl(var(--muted) / 0.3);
          display: flex; flex-direction: column; gap: 6px;
        }
        .rts-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
        .rts-counter { font-size: 11px; font-weight: 800; color: hsl(var(--foreground)); }
        .rts-counter b { color: hsl(var(--primary)); }
        .rts-btn {
          height: 30px; padding: 0 10px; border-radius: 6px; border: none;
          font-size: 11px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
          transition: opacity 0.15s, transform 0.05s;
        }
        .rts-btn:hover { opacity: 0.9; }
        .rts-btn:active { transform: translateY(1px); }
        .rts-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .rts-btn-primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); width: 100%; justify-content: center; height: 36px; font-size: 12px; }
        .rts-btn-ghost { background: transparent; color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); }
      `}</style>

      {/* Header */}
      <div className="rts-header">
        <h3><Truck size={15} /> تقرير الترحيلات</h3>
        <button className="rts-refresh" onClick={() => refetch()} title="تحديث">
          <RefreshCw size={12} style={{ animation: isFetching ? "spin 1s linear infinite" : undefined }} />
          تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="rts-tabs">
        <TabBtn id="all" icon={Truck} label="كل الترحيلات" />
        <TabBtn id="by_transport" icon={Train} label="حسب الترحيلات" />
        <TabBtn id="by_customer" icon={User} label="حسب اسم الزبون" />
      </div>

      {/* Hint */}
      <div className="rts-hint">الرجاء اختيار زبون أو مجموعة من الزبائن</div>
      <div className="rts-dragbar">Drag a column header here to group by that column</div>

      {/* Body */}
      <div className="rts-body">
        {isLoading ? (
          <div className="rts-empty">جارٍ التحميل…</div>
        ) : invoices.length === 0 ? (
          <div className="rts-empty">
            <Truck size={32} style={{ opacity: 0.2, margin: "0 auto 8px", display: "block" }} />
            <div style={{ fontWeight: 700 }}>لا توجد فواتير جاهزة للرفع</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>الفواتير التي تنتهي تغليفها تظهر هنا</div>
          </div>
        ) : tab === "all" ? (
          <table className="rts-table">
            <thead>
              <tr>
                <th className="cell-check">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th className="cell-num">رقم الفاتورة</th>
                <th>اسم الزبون</th>
                <th className="cell-date">تاريخ الفاتورة</th>
              </tr>
            </thead>
            <tbody>{invoices.map(renderRow)}</tbody>
          </table>
        ) : (
          <table className="rts-table">
            <thead>
              <tr>
                <th className="cell-check">#</th>
                <th className="cell-num">رقم الفاتورة</th>
                <th>اسم الزبون</th>
                <th className="cell-date">تاريخ الفاتورة</th>
              </tr>
            </thead>
            <tbody>
              {groups!.map((g) => {
                const collapsed = collapsedGroups.has(g.key);
                const allInGroup = g.items.every((i) => checked.has(i.id));
                return (
                  <Fragment key={`g-${g.key}`}>
                    <tr>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <div
                          className="rts-group-head"
                          onClick={() => toggleGroup(g.key)}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {collapsed ? <ChevronLeft size={13} /> : <ChevronDown size={13} />}
                            {g.label}
                            <span className="rts-group-meta">({g.items.length})</span>
                          </span>
                          <button
                            className="rts-btn rts-btn-ghost"
                            style={{ height: 22, padding: "0 6px", fontSize: 10 }}
                            onClick={(e) => { e.stopPropagation(); toggleGroupCheck(g.items); }}
                          >
                            {allInGroup ? "إلغاء" : "تحديد الكل"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {!collapsed && g.items.map((inv, i) => renderRow(inv, i))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      {!hideFooter && (
        <div className="rts-footer">
          <div className="rts-footer-row">
            <div className="rts-counter">
              <b>{checked.size}</b> محدد من <b>{invoices.length}</b>
            </div>
            <button
              className="rts-btn rts-btn-ghost"
              onClick={toggleAll}
              disabled={invoices.length === 0}
            >
              {allChecked ? <X size={11} /> : null}
              {allChecked ? "إلغاء التحديد" : "تحديد الكل"}
            </button>
          </div>
          <button
            className="rts-btn rts-btn-primary"
            onClick={printAndDispatch}
            disabled={busy || checked.size === 0}
          >
            <Printer size={14} />
            {busy ? "جارٍ المعالجة…" : "طباعة وتحويل إلى ترحيلات"}
          </button>
        </div>
      )}
    </div>
  );
}
