/**
 * DispatchPage — تقرير الترحيلات
 * تصميم مطابق للفيديو:
 * - فلترة بزبون أو نطاق تاريخ
 * - جدول يعرض: رقم الفاتورة | اسم الزبون | التاريخ
 * - زر "طباعة الكل" + "طباعة المحصل"
 * - تقرير مقسم حسب الزبون مع عدد القطع وتوقيعات
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings, useCustomers } from "@/hooks/useData";
import { toast } from "sonner";
import { Truck, Printer, RefreshCw, Search, Users, Calendar, X, CheckSquare, Square, PackageCheck } from "lucide-react";
import ReadyToShipPanel from "@/components/dispatch/ReadyToShipPanel";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { startsWithMatch, startsWithAny } from "@/utils/searchMatch";

// ── Helpers ─────────────────────────────────────────────────────────────────────
const fmtDateAr = (d?: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ── Build Print HTML ─────────────────────────────────────────────────────────────
function buildDispatchReportHTML(
  invoices: any[],
  company: any,
  mode: "all" | "collected"
) {
  const logoURL =
    company?.logo_url ||
    "https://vifrecsqxdbwqtcfkdyb.supabase.co/storage/v1/object/public/company-assets/logo.png";
  const dateStr = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // تجميع الفواتير حسب الزبون
  const byCustomer: Record<string, { name: string; invoices: any[] }> = {};
  invoices.forEach((inv) => {
    const custId = inv.customer_id || "cash";
    const custName = inv.customers?.name || "كاش";
    if (!byCustomer[custId]) byCustomer[custId] = { name: custName, invoices: [] };
    byCustomer[custId].invoices.push(inv);
  });

  const customerBlocks = Object.values(byCustomer)
    .map((cust) => {
      const totalPieces = cust.invoices.reduce(
        (s, inv) => s + (inv.packaging_total_pieces || 0),
        0
      );
      const itemRows = cust.invoices
        .map((inv, i) => {
          const items = (inv.invoice_items || [])
            .map(
              (it: any) =>
                `<tr style="font-size:10px">
                  <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${i + 1}</td>
                  <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${inv.invoice_number}</td>
                  <td style="border:1px solid #ccc;padding:3px 6px;text-align:right">${it.product_name || it.products?.name || "—"}</td>
                  <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${it.quantity || 0}</td>
                </tr>`
            )
            .join("");
          if (items) return items;
          return `<tr style="font-size:10px">
            <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${i + 1}</td>
            <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">${inv.invoice_number}</td>
            <td style="border:1px solid #ccc;padding:3px 6px;text-align:right">—</td>
            <td style="border:1px solid #ccc;padding:3px 6px;text-align:center">—</td>
          </tr>`;
        })
        .join("");

      return `
        <div style="margin-bottom:18px;border:2px solid #3b5bdb;border-radius:6px;overflow:hidden;page-break-inside:avoid">
          <div style="background:#3b5bdb;color:#fff;padding:6px 10px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:800;font-size:13px">اسم الزبون: ${cust.name}</span>
            <span style="font-size:11px">عدد الفواتير: ${cust.invoices.length}</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#e8edff">
                <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:center;width:35px">#</th>
                <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:center;width:90px">رقم الفاتورة</th>
                <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:right">اسم التالف</th>
                <th style="border:1px solid #ccc;padding:4px 6px;font-size:11px;text-align:center;width:60px">الكمية</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
          <div style="background:#f0f4ff;padding:5px 10px;border-top:2px solid #3b5bdb;display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:800;font-size:11px">عدد قطع الزبون: <span style="color:#c0392b;font-size:14px">${totalPieces || cust.invoices.length}</span></span>
            <span style="font-size:10px;color:#555">عدد الطلبات: ${cust.invoices.length}</span>
          </div>
        </div>`;
    })
    .join("");

  const totalInvoices = invoices.length;
  const totalCustomers = Object.keys(byCustomer).length;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>تقرير الترحيلات - ${dateStr}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    color: #1a1a1a; background: #fff; padding: 10px;
    font-size: 11px; line-height: 1.4;
  }
  .header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 3px solid #3b5bdb; padding-bottom: 8px; margin-bottom: 10px;
  }
  .header-center { text-align: center; flex: 1; }
  .header-title { font-size: 20px; font-weight: 900; color: #1a1a1a; }
  .header-sub { font-size: 11px; color: #666; margin-top: 2px; }
  .header-date { font-size: 11px; font-weight: 700; color: #3b5bdb; }
  .header-logo img { height: 60px; object-fit: contain; }
  .report-title {
    text-align: center; margin: 8px 0; padding: 6px;
    background: linear-gradient(135deg, #3b5bdb, #1c3faa);
    color: #fff; border-radius: 6px;
  }
  .report-title h1 { font-size: 18px; font-weight: 900; }
  .report-title .sub { font-size: 10px; opacity: 0.85; margin-top: 2px; }
  .meta-row {
    display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
  }
  .meta-box {
    border: 1px solid #ddd; border-radius: 5px;
    padding: 6px 14px; text-align: center; min-width: 100px;
  }
  .meta-box-label { font-size: 9px; color: #888; }
  .meta-box-value { font-size: 16px; font-weight: 800; color: #3b5bdb; }
  .signatures {
    display: flex; justify-content: space-around;
    margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd;
  }
  .sig-box { text-align: center; width: 120px; }
  .sig-line {
    border-top: 1px solid #999; margin-top: 30px; padding-top: 4px;
    font-size: 10px; color: #555; font-weight: 600;
  }
  .footer {
    text-align: center; margin-top: 15px; font-size: 9px; color: #aaa;
    border-top: 1px solid #eee; padding-top: 5px;
  }
  .mode-badge {
    display: inline-block; padding: 2px 10px;
    background: ${mode === "collected" ? "#16a34a" : "#3b5bdb"};
    color: #fff; border-radius: 10px; font-size: 10px; font-weight: 700;
    margin-right: 8px;
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-logo"><img src="${logoURL}" alt="Logo" onerror="this.style.display='none'" /></div>
  <div class="header-center">
    <div class="header-title">${company?.company_name || "الشركة"}</div>
    <div class="header-sub">${company?.address || ""}</div>
    <div class="header-sub">${company?.phone || ""}</div>
  </div>
  <div class="header-logo"><img src="${logoURL}" alt="Logo" onerror="this.style.display='none'" /></div>
</div>

<!-- Report Title -->
<div class="report-title">
  <h1>🚚 تقرير الترحيلات</h1>
  <div class="sub">
    <span class="mode-badge">${mode === "collected" ? "المحصل" : "الكل"}</span>
    التاريخ: ${dateStr}
  </div>
</div>

<!-- Meta -->
<div class="meta-row">
  <div class="meta-box">
    <div class="meta-box-label">عدد الفواتير</div>
    <div class="meta-box-value">${totalInvoices}</div>
  </div>
  <div class="meta-box">
    <div class="meta-box-label">عدد الزبائن</div>
    <div class="meta-box-value">${totalCustomers}</div>
  </div>
  <div class="meta-box">
    <div class="meta-box-label">تاريخ الطباعة</div>
    <div class="meta-box-value" style="font-size:11px">${new Date().toLocaleDateString("ar-SA")}</div>
  </div>
</div>

<!-- Customer Blocks -->
${customerBlocks}

<!-- Summary Row -->
<div style="border:2px solid #1a1a1a;border-radius:6px;padding:8px 12px;margin-top:10px;background:#f9f9f9;display:flex;justify-content:space-between">
  <span style="font-weight:800">عدد الترحيلات الإجمالي: <span style="color:#3b5bdb;font-size:15px">${totalCustomers}</span></span>
  <span style="font-weight:800">عدد الفواتير الإجمالي: <span style="color:#c0392b;font-size:15px">${totalInvoices}</span></span>
</div>

<!-- Signatures -->
<div class="signatures">
  <div class="sig-box"><div class="sig-line">توقيع المسؤول</div></div>
  <div class="sig-box"><div class="sig-line">توقيع الناقل</div></div>
  <div class="sig-box"><div class="sig-line">توقيع المستلم</div></div>
</div>

<div class="footer">تم إنشاء هذا التقرير من نظام البلتول — ${dateStr}</div>
</body>
</html>`;
}

// ── Main Component ───────────────────────────────────────────────────────────────
export default function DispatchPage() {
  const { data: companyArr } = useCompanySettings();
  const company = (companyArr as any)?.[0] || null;
  const { data: allCustomers = [] } = useCustomers();

  // Filter state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Data state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [printing, setPrinting] = useState(false);

  // جلب البيانات
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("invoices")
        .select(
          `id, invoice_number, date, total, currency_code, workflow_status,
           paid_amount, customer_id,
           customers(id, name, phone),
           invoice_items(id, product_name, quantity, products(name))`
        )
        .order("date", { ascending: false });

      if (selectedCustomerId) {
        q = q.eq("customer_id", selectedCustomerId);
      }
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);

      const { data, error } = await q;
      if (error) throw error;
      setInvoices(data || []);
      setCheckedIds(new Set());
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // فلترة قائمة الزبائن للبحث
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return (allCustomers as any[]).slice(0, 20);
    return (allCustomers as any[])
      .filter((c: any) => startsWithMatch(c.name, customerSearch))
      .slice(0, 20);
  }, [allCustomers, customerSearch]);

  const selectedCustomerName = useMemo(() => {
    if (!selectedCustomerId) return "";
    const c = (allCustomers as any[]).find((c: any) => c.id === selectedCustomerId);
    return c?.name || "";
  }, [selectedCustomerId, allCustomers]);

  // Toggle check
  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const allChecked = invoices.length > 0 && invoices.every((inv) => checkedIds.has(inv.id));
  const toggleAll = () => {
    if (allChecked) setCheckedIds(new Set());
    else setCheckedIds(new Set(invoices.map((inv) => inv.id)));
  };

  // المحصل = paid أو partial
  const collectedInvoices = invoices.filter((inv) => {
    const paid = Number(inv.paid_amount || 0);
    return paid > 0;
  });

  // طباعة
  const handlePrint = (mode: "all" | "collected") => {
    const selected = checkedIds.size > 0
      ? invoices.filter((inv) => checkedIds.has(inv.id))
      : invoices;

    const toPrint = mode === "collected"
      ? selected.filter((inv) => Number(inv.paid_amount || 0) > 0)
      : selected;

    if (toPrint.length === 0) {
      toast.error("لا توجد فواتير للطباعة");
      return;
    }

    setPrinting(true);
    try {
      const html = buildDispatchReportHTML(toPrint, company, mode);
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) { toast.error("تعذّر فتح نافذة الطباعة"); return; }
      win.document.write(html);
      win.document.close();
      win.onload = () => {
        win.print();
        win.onafterprint = () => win.close();
      };
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTimeout(() => setPrinting(false), 3000);
    }
  };

  return (
    <article className="content dispatch-v2" dir="rtl">
      <style>{`
        .dispatch-v2 { padding: 12px !important; font-size: 12px; }
        .dispatch-v2 .dv-card {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; margin-bottom: 10px; overflow: hidden;
        }
        .dispatch-v2 .dv-header {
          background: linear-gradient(135deg, #3b5bdb, #1c3faa);
          color: #fff; padding: 8px 14px;
          display: flex; align-items: center; gap: 8px;
        }
        .dispatch-v2 .dv-header h2 { font-size: 14px; font-weight: 800; margin: 0; }
        .dispatch-v2 .dv-body { padding: 12px; }
        .dispatch-v2 .filter-row {
          display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;
        }
        .dispatch-v2 .filter-group { display: flex; flex-direction: column; gap: 3px; }
        .dispatch-v2 .filter-group label { font-size: 10px; font-weight: 700; color: hsl(var(--muted-foreground)); }
        .dispatch-v2 .filter-group input,
        .dispatch-v2 .filter-group select {
          height: 28px; font-size: 11px; padding: 0 8px;
          border: 1px solid hsl(var(--input)); border-radius: 5px;
          background: hsl(var(--background)); color: hsl(var(--foreground));
          outline: none; min-width: 140px;
        }
        .dispatch-v2 .filter-group input:focus,
        .dispatch-v2 .filter-group select:focus { border-color: #3b5bdb; }
        .dispatch-v2 .cust-search-wrap { position: relative; }
        .dispatch-v2 .cust-dropdown {
          position: absolute; top: 100%; right: 0; left: 0; z-index: 100;
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 5px; max-height: 200px; overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .dispatch-v2 .cust-item {
          padding: 6px 10px; cursor: pointer; font-size: 11px;
          border-bottom: 1px solid hsl(var(--border));
          transition: background 0.1s;
        }
        .dispatch-v2 .cust-item:hover { background: hsl(var(--muted)); }
        .dispatch-v2 .cust-item.selected { background: #e8edff; color: #3b5bdb; font-weight: 700; }
        .dispatch-v2 .btn-dv {
          height: 28px; padding: 0 12px; border-radius: 5px; border: none;
          font-size: 11px; font-weight: 700; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
          transition: opacity 0.15s;
        }
        .dispatch-v2 .btn-dv:hover { opacity: 0.85; }
        .dispatch-v2 .btn-dv:disabled { opacity: 0.5; cursor: not-allowed; }
        .dispatch-v2 .btn-primary { background: #3b5bdb; color: #fff; }
        .dispatch-v2 .btn-success { background: #16a34a; color: #fff; }
        .dispatch-v2 .btn-secondary { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .dispatch-v2 .btn-refresh { background: hsl(var(--secondary)); color: hsl(var(--secondary-foreground)); }
        .dispatch-v2 .stats-row {
          display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
        }
        .dispatch-v2 .stat-box {
          flex: 1; min-width: 80px; padding: 8px 10px; border-radius: 6px;
          text-align: center; border: 1px solid;
        }
        .dispatch-v2 .stat-box .val { font-size: 20px; font-weight: 800; }
        .dispatch-v2 .stat-box .lbl { font-size: 9px; opacity: 0.85; }
        .dispatch-v2 .stat-blue { background: #e8edff; border-color: #c5d0fc; color: #3b5bdb; }
        .dispatch-v2 .stat-green { background: #dcfce7; border-color: #86efac; color: #16a34a; }
        .dispatch-v2 .stat-amber { background: #fef9c3; border-color: #fde047; color: #b45309; }
        .dispatch-v2 .inv-table { width: 100%; border-collapse: collapse; }
        .dispatch-v2 .inv-table th {
          background: #3b5bdb; color: #fff;
          padding: 6px 8px; font-size: 11px; font-weight: 700;
          text-align: right; position: sticky; top: 0; z-index: 2;
          white-space: nowrap;
        }
        .dispatch-v2 .inv-table td {
          padding: 5px 8px; font-size: 11px; border-bottom: 1px solid hsl(var(--border));
          vertical-align: middle;
        }
        .dispatch-v2 .inv-table tr:hover td { background: hsl(var(--muted) / 0.4); }
        .dispatch-v2 .inv-table tr.checked td { background: #e8edff; border-right: 3px solid #3b5bdb; }
        .dispatch-v2 .badge-paid { background: #dcfce7; color: #16a34a; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 700; }
        .dispatch-v2 .badge-partial { background: #fef9c3; color: #b45309; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 700; }
        .dispatch-v2 .badge-unpaid { background: #fee2e2; color: #dc2626; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 700; }
        .dispatch-v2 .print-row {
          display: flex; gap: 8px; justify-content: flex-start; align-items: center;
          padding: 10px; border-top: 1px solid hsl(var(--border));
          background: hsl(var(--muted) / 0.3);
        }
        .dispatch-v2 .empty-state {
          text-align: center; padding: 3rem 1rem;
          color: hsl(var(--muted-foreground));
        }
        .dispatch-v2 .clear-btn {
          background: none; border: none; cursor: pointer;
          color: hsl(var(--muted-foreground)); padding: 0 4px;
          font-size: 12px; line-height: 1;
        }
        .dispatch-v2 .clear-btn:hover { color: #dc2626; }
        .dispatch-v2 .table-wrap {
          max-height: calc(100vh - 360px); overflow-y: auto;
          border: 1px solid hsl(var(--border)); border-radius: 5px;
        }
        .dispatch-v2 .dispatch-grid {
          display: grid; grid-template-columns: 1fr; gap: 12px;
        }
        @media (min-width: 1024px) {
          .dispatch-v2 .dispatch-grid { grid-template-columns: 1fr 360px; align-items: start; }
          .dispatch-v2 .dispatch-right { position: sticky; top: 12px; max-height: calc(100vh - 24px); }
        }
        .dispatch-v2 .dispatch-right-mobile-trigger {
          position: fixed; bottom: 16px; right: 16px; z-index: 50;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          border: none; border-radius: 999px; padding: 10px 14px;
          font-size: 12px; font-weight: 800; cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.18);
        }
        @media (min-width: 1024px) {
          .dispatch-v2 .dispatch-right-mobile-trigger { display: none; }
        }
      `}</style>

      <div className="dispatch-grid">
        <div className="dispatch-left">

      {/* Filter Card */}
      <div className="dv-card">
        <div className="dv-header">
          <Truck size={16} />
          <h2>تقرير الترحيلات</h2>
        </div>
        <div className="dv-body">
          <div className="filter-row">

            {/* Customer Filter */}
            <div className="filter-group">
              <label><Users size={9} style={{ display: "inline" }} /> الزبون</label>
              <div className="cust-search-wrap">
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="text"
                    placeholder="اختر زبون أو اكتب للبحث..."
                    value={selectedCustomerName || customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setSelectedCustomerId("");
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    style={{ width: 200 }}
                  />
                  {(selectedCustomerId || customerSearch) && (
                    <button
                      className="clear-btn"
                      onClick={() => {
                        setSelectedCustomerId("");
                        setCustomerSearch("");
                        setShowCustomerDropdown(false);
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {showCustomerDropdown && (
                  <div className="cust-dropdown">
                    <div
                      className={`cust-item${!selectedCustomerId ? " selected" : ""}`}
                      onClick={() => {
                        setSelectedCustomerId("");
                        setCustomerSearch("");
                        setShowCustomerDropdown(false);
                      }}
                    >
                      — كل الزبائن —
                    </div>
                    {filteredCustomers.map((c: any) => (
                      <div
                        key={c.id}
                        className={`cust-item${selectedCustomerId === c.id ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerSearch("");
                          setShowCustomerDropdown(false);
                        }}
                      >
                        {c.name}
                        {c.phone && <span style={{ fontSize: 9, color: "#888", marginRight: 6 }}>{c.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Date From */}
            <div className="filter-group">
              <label><Calendar size={9} style={{ display: "inline" }} /> من تاريخ</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{ width: 140 }}
              />
            </div>

            {/* Date To */}
            <div className="filter-group">
              <label><Calendar size={9} style={{ display: "inline" }} /> إلى تاريخ</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{ width: 140 }}
              />
            </div>

            {/* Buttons */}
            <div className="filter-group" style={{ justifyContent: "flex-end" }}>
              <label style={{ visibility: "hidden" }}>_</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn-dv btn-primary"
                  onClick={loadData}
                  disabled={loading}
                >
                  <Search size={12} />
                  {loading ? "جارٍ..." : "بحث"}
                </button>
                <button
                  className="btn-dv btn-secondary"
                  onClick={() => {
                    setSelectedCustomerId("");
                    setCustomerSearch("");
                    setDateFrom("");
                    setDateTo("");
                    setShowCustomerDropdown(false);
                  }}
                >
                  <X size={12} />
                  مسح
                </button>
                <button
                  className="btn-dv btn-refresh"
                  onClick={loadData}
                  title="تحديث"
                >
                  <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : undefined }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Card */}
      <div className="dv-card">
        <div className="dv-body" style={{ padding: "10px 12px 0" }}>
          {/* Stats */}
          <div className="stats-row">
            <div className="stat-box stat-blue">
              <div className="val">{invoices.length}</div>
              <div className="lbl">إجمالي الفواتير</div>
            </div>
            <div className="stat-box stat-green">
              <div className="val">{collectedInvoices.length}</div>
              <div className="lbl">المحصل</div>
            </div>
            <div className="stat-box stat-amber">
              <div className="val">{invoices.length - collectedInvoices.length}</div>
              <div className="lbl">غير محصل</div>
            </div>
            <div className="stat-box stat-blue">
              <div className="val">{checkedIds.size || invoices.length}</div>
              <div className="lbl">{checkedIds.size > 0 ? "محدد" : "الكل"}</div>
            </div>
          </div>

          {/* Table Header info */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              اسحب عمود أو حدد صفوفاً للطباعة الانتقائية
            </div>
            <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
              {checkedIds.size > 0 ? `${checkedIds.size} محددة` : ""}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap" style={{ margin: "0 12px" }}>
          {loading ? (
            <div className="empty-state">
              <Truck size={36} style={{ opacity: 0.2, margin: "0 auto 8px", display: "block" }} />
              <div>جارٍ التحميل...</div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <Truck size={36} style={{ opacity: 0.15, margin: "0 auto 8px", display: "block" }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>لا توجد فواتير</div>
              <div style={{ fontSize: 10 }}>حدد فلتراً وانقر بحث</div>
            </div>
          ) : (
            <table className="inv-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: "center" }}>
                    <button
                      onClick={toggleAll}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", padding: 0 }}
                    >
                      {allChecked ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>
                  </th>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 100 }}>رقم الفاتورة</th>
                  <th>اسم الزبون</th>
                  <th style={{ width: 90 }}>التاريخ</th>
                  <th style={{ width: 110 }}>المبلغ</th>
                  <th style={{ width: 80 }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const paid = Number(inv.paid_amount || 0);
                  const total = Number(inv.total || 0);
                  const payStatus =
                    paid <= 0 ? "unpaid" : paid >= total - 0.01 ? "paid" : "partial";
                  const isChecked = checkedIds.has(inv.id);
                  return (
                    <tr
                      key={inv.id}
                      className={isChecked ? "checked" : ""}
                      onClick={() => toggleCheck(inv.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCheck(inv.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 700, color: "#3b5bdb" }}>{inv.invoice_number}</td>
                      <td style={{ fontWeight: 600 }}>{inv.customers?.name || "كاش"}</td>
                      <td>{fmtDateAr(inv.date)}</td>
                      <td style={{ fontWeight: 700 }}>
                        {Number(inv.total || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        {" "}<small style={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}>{inv.currency_code}</small>
                      </td>
                      <td>
                        <span className={`badge-${payStatus}`}>
                          {payStatus === "paid" ? "محصل" : payStatus === "partial" ? "جزئي" : "غير محصل"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Print Row */}
        {invoices.length > 0 && (
          <div className="print-row">
            <button
              className="btn-dv btn-primary"
              onClick={() => handlePrint("all")}
              disabled={printing}
              id="btn-print-all"
            >
              <Printer size={13} />
              طباعة الكل {checkedIds.size > 0 ? `(${checkedIds.size})` : `(${invoices.length})`}
            </button>
            <button
              className="btn-dv btn-success"
              onClick={() => handlePrint("collected")}
              disabled={printing}
              id="btn-print-collected"
            >
              <Printer size={13} />
              طباعة المحصل {checkedIds.size > 0
                ? `(${invoices.filter(inv => checkedIds.has(inv.id) && Number(inv.paid_amount || 0) > 0).length})`
                : `(${collectedInvoices.length})`}
            </button>
            {checkedIds.size > 0 && (
              <button
                className="btn-dv btn-secondary"
                onClick={() => setCheckedIds(new Set())}
              >
                <X size={12} />
                إلغاء التحديد
              </button>
            )}
            {printing && (
              <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                جارٍ فتح نافذة الطباعة...
              </span>
            )}
          </div>
        )}
      </div>
        </div>

        {/* Desktop right panel */}
        <aside className="dispatch-right hidden lg:block">
          <ReadyToShipPanel buildPrintHTML={buildDispatchReportHTML} company={company} />
        </aside>
      </div>

      {/* Mobile floating trigger + sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <button className="dispatch-right-mobile-trigger" type="button">
            <PackageCheck size={16} />
            الفواتير الجاهزة للرفع
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[92vw] sm:w-[420px] p-0">
          <div style={{ height: "100%", padding: 8 }}>
            <ReadyToShipPanel buildPrintHTML={buildDispatchReportHTML} company={company} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Click outside to close dropdown */}
      {showCustomerDropdown && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 99,
          }}
          onClick={() => setShowCustomerDropdown(false)}
        />
      )}
    </article>
  );
}
