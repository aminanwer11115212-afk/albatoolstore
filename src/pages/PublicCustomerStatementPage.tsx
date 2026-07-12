import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, Share2, Copy, Check } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import { arInvoiceStatus, arQuoteStatus, arReturnStatus } from "@/utils/statusLabels";
import { openWhatsApp } from "@/utils/whatsapp";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  company?: string | null;
  balance?: number | null;
  credit_balance?: number | null;
  net_balance?: number | null;
}

interface Company {
  company_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  currency?: string;
  tax_number?: string;
  website?: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date?: string | null;
  total: number;
  paid_amount: number;
  due_amount: number;
  status?: string;
  workflow_status?: string;
  type?: string;
}

interface Quote {
  id: string;
  quote_number: string;
  date: string;
  valid_until?: string | null;
  total: number;
  status?: string;
}

interface StockReturn {
  id: string;
  return_number: string;
  date: string;
  total: number;
  status?: string;
}

interface Tx {
  id: string;
  date: string;
  amount: number;
  type: string;
  description?: string | null;
  method?: string | null;
}

interface StatementData {
  customer: Customer;
  company: Company | null;
  invoices: Invoice[];
  quotes: Quote[];
  returns: StockReturn[];
  transactions: Tx[];
}

import { resolveLogoUrl } from "@/utils/albatoolLogo";

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function PublicCustomerStatementPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("رابط غير صالح");
      setLoading(false);
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${supabaseUrl}/functions/v1/customer-statement?token=${encodeURIComponent(token)}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          if (r.status === 410) throw new Error("انتهت صلاحية الرابط");
          if (r.status === 401) throw new Error("الرابط غير صالح");
          throw new Error(body.error || "خطأ");
        }
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const totals = useMemo(() => {
    if (!data) return { sales: 0, paid: 0, due: 0, unpaid: 0, returns: 0, payments: 0, net: 0 };
    const sales = data.invoices.reduce((s, i) => s + Number(i.total || 0), 0);
    const paid = data.invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const due = data.invoices.reduce((s, i) => s + Math.max(0, Number(i.due_amount || 0)), 0);
    const unpaid = data.invoices.filter((i) => Number(i.due_amount || 0) > 0).length;
    const returns = data.returns.reduce((s, r) => s + Number(r.total || 0), 0);
    const payments = data.transactions
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    // الصافي الحقيقي على العميل = المديونية من الفواتير − رصيده الدائن.
    // نستخدم net_balance من الخادم إن توفّر، وإلا نحسبه محلياً.
    const custNet = data.customer.net_balance !== null && data.customer.net_balance !== undefined
      ? Number(data.customer.net_balance)
      : Number(data.customer.balance || 0) - Number(data.customer.credit_balance || 0);
    return { sales, paid, due, unpaid, returns, payments, net: custNet };
  }, [data]);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const handleShare = async () => {
    const text = `كشف حساب العميل - ${data?.customer.name || ""}\n${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "كشف حساب", text, url: shareUrl });
        return;
      } catch {
        /* fallthrough */
      }
    }
    openWhatsApp(undefined, text);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100" dir="rtl">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-700" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6" dir="rtl">
        <div className="bg-white p-6 rounded-lg shadow text-center">
          <h2 className="text-lg font-bold text-red-600 mb-2">تعذّر فتح كشف الحساب</h2>
          <p className="text-sm text-gray-600">{error || "بيانات غير متاحة"}</p>
        </div>
      </div>
    );
  }

  const { customer, company, invoices, quotes, returns, transactions } = data;
  const logoURL = resolveLogoUrl(company?.logo_url);

  return (
    <div dir="rtl" lang="ar" className="public-statement min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <style>{`
        .public-statement { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; color: #1a1a1a; line-height: 1.5; font-size: 14px; }
        .ps-page { max-width: 800px; margin: 0 auto; background: #fff; padding: 20px; }

        /* === HEADER (matches printTemplate.ts) === */
        .ps-header { text-align: center; padding-bottom: 10px; border-bottom: 3px solid #4a7c59; margin-bottom: 10px; position: relative; }
        .ps-header-logos { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .ps-header-logo img { height: 75px; object-fit: contain; }
        .ps-header-title { font-size: 22px; font-weight: 900; color: #c0392b; margin-bottom: 4px; }
        .ps-header-address { font-size: 13px; color: #333; line-height: 1.6; }
        .ps-header-phones { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }

        /* === DOC TITLE === */
        .ps-doc-title { text-align: center; margin: 14px 0 10px; }
        .ps-doc-title h1 { font-size: 22px; color: #2c3e50; font-weight: 800; display: inline-block; border-bottom: 3px solid #5b2c8e; padding-bottom: 3px; }

        /* === INFO ROW (flex right/left like print template) === */
        .ps-info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px; flex-wrap: wrap; gap: 8px; }
        .ps-info-row .right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .ps-info-row .left { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .ps-info-label { color: #1a1a1a; font-weight: 700; }
        .ps-info-value { color: #c0392b; font-weight: 700; }
        .ps-info-value-blue { color: #2980b9; font-weight: 800; }

        /* === SUMMARY BOXES (matches print template) === */
        .ps-summary-row { display: flex; justify-content: center; gap: 16px; margin: 16px 0; flex-wrap: wrap; }
        .ps-summary-box { border: 2px solid #1a1a1a; border-radius: 6px; padding: 12px 24px; text-align: center; min-width: 170px; flex: 1; }
        .ps-summary-box-title { font-size: 13px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
        .ps-summary-box-value { font-size: 20px; font-weight: 900; color: #2c3e50; }
        .ps-summary-box.blue { border-color: #2980b9; }
        .ps-summary-box.blue .ps-summary-box-value { color: #2980b9; }
        .ps-summary-box.red { border-color: #c0392b; }
        .ps-summary-box.red .ps-summary-box-value { color: #c0392b; }
        .ps-summary-box.green { border-color: #16a34a; }
        .ps-summary-box.green .ps-summary-box-value { color: #16a34a; }

        /* === SECTIONS & TABLES === */
        .ps-section-title { font-size: 14px; font-weight: 800; color: #5b2c8e; border-bottom: 2px dashed #5b2c8e; padding-bottom: 4px; margin: 18px 0 8px; }
        .ps-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 2px solid #1a1a1a; }
        .ps-table thead th { background: #5b4cad; color: white; padding: 8px 10px; font-size: 13px; font-weight: 700; text-align: center; border: 1px solid #1a1a1a; }
        .ps-table tbody td { padding: 7px 10px; text-align: center; font-size: 13px; border: 1px solid #999; }
        .ps-table tbody tr:nth-child(even) { background: #f8f8f8; }
        .ps-empty { text-align: center; padding: 12px; color: #888; font-size: 13px; background: #fafafa; border: 1px dashed #ccc; border-radius: 6px; margin-bottom: 12px; }

        /* === FINAL BALANCE === */
        .ps-final { margin-top: 20px; padding: 14px; border: 2px solid #2980b9; border-radius: 8px; text-align: center; background: #ecf6fc; }
        .ps-final .t { font-size: 14px; font-weight: 800; color: #1a1a1a; }
        .ps-final .v { font-size: 26px; font-weight: 900; color: #c0392b; margin-top: 4px; }

        /* === ACTIONS / THANKS === */
        .ps-actions { max-width: 800px; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: flex-end; padding: 0 20px; }
        .ps-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
        .ps-btn-primary { background: #2980b9; color: white; }
        .ps-btn-default { background: white; color: #1a1a1a; border-color: #d1d5db; }
        .ps-thanks { text-align: center; margin-top: 18px; font-size: 13px; color: #555; font-style: italic; }

        @media print {
          .ps-actions { display: none !important; }
          .public-statement { background: #fff !important; padding: 0 !important; }
          .ps-page { box-shadow: none !important; padding: 8mm !important; max-width: 100% !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="ps-actions">
        <button className="ps-btn ps-btn-default" onClick={() => window.print()}>
          <Printer size={16} /> طباعة
        </button>
        <button className="ps-btn ps-btn-default" onClick={handleCopy}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "تم النسخ" : "نسخ الرابط"}
        </button>
        <button className="ps-btn ps-btn-primary" onClick={handleShare}>
          <Share2 size={16} /> مشاركة
        </button>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 20px" }}>
        <PrintVisibilityToolbar
          storageKey={`public-statement-${customer.id}`}
          containerSelector=".ps-page"
          sections={[
            { key: "ps-header", label: "الترويسة" },
            { key: "ps-customer-details", label: "بيانات العميل التفصيلية" },
            { key: "ps-quotes", label: "عروض الأسعار" },
            { key: "ps-returns", label: "المرتجعات" },
            { key: "ps-final", label: "الرصيد النهائي" },
          ]}
          shareTitle={`كشف حساب — ${customer.name}`}
          shareSummary={`الرصيد المستحق: ${fmt(totals.due)} ${company?.currency || ""}`}
          pdfFilename={`كشف-حساب-${customer.name}`}
          showWhatsApp={false}
        />
      </div>

      <div className="ps-page shadow print:shadow-none">
        {/* Header — identical to printTemplate.ts */}
        <div data-section="ps-header" data-section-label="الترويسة" className="ps-header">
          <div className="ps-header-logos">
            <div className="ps-header-logo"><img src={logoURL} alt="Logo" /></div>
            <div style={{ flex: 1 }}>
              <div className="ps-header-title">{company?.company_name || "الشركة"}</div>
              {company?.address && <div className="ps-header-address">{company.address}</div>}
              {company?.phone && <div className="ps-header-phones">{company.phone}</div>}
            </div>
            <div className="ps-header-logo"><img src={logoURL} alt="Logo" /></div>
          </div>
        </div>

        {/* Document Title */}
        <div className="ps-doc-title">
          <h1>كشف حساب العميل</h1>
        </div>

        {/* Info Row 1 — name (right) + date (left), like print template */}
        <div className="ps-info-row">
          <div className="right">
            <span className="ps-info-label">اسم العميل:</span>
            <span className="ps-info-value">{customer.name}</span>
          </div>
          <div className="left">
            <span className="ps-info-label">التاريخ:</span>
            <span className="ps-info-value">{new Date().toLocaleDateString("ar-EG")}</span>
          </div>
        </div>

        <div data-section="ps-customer-details" data-section-label="بيانات العميل التفصيلية">
          {/* Info Row 2 — phone/address (right) + customer code (left) */}
          <div className="ps-info-row">
            <div className="right">
              {customer.phone && <>
                <span className="ps-info-label">الهاتف:</span>
                <span className="ps-info-value">{customer.phone}</span>
              </>}
              {customer.address && <>
                <span className="ps-info-label" style={{ marginRight: 15 }}>العنوان:</span>
                <span className="ps-info-value">{customer.address}</span>
              </>}
            </div>
            <div className="left">
              <span className="ps-info-label">رقم الكشف:</span>
              <span className="ps-info-value-blue">{customer.id.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>

          {(customer.email || customer.company || customer.city) && (
            <div className="ps-info-row">
              <div className="right">
                {customer.company && <>
                  <span className="ps-info-label">الشركة:</span>
                  <span className="ps-info-value">{customer.company}</span>
                </>}
                {customer.city && <>
                  <span className="ps-info-label" style={{ marginRight: 15 }}>المدينة:</span>
                  <span className="ps-info-value">{customer.city}</span>
                </>}
              </div>
              <div className="left">
                {customer.email && <>
                  <span className="ps-info-label">البريد:</span>
                  <span className="ps-info-value">{customer.email}</span>
                </>}
              </div>
            </div>
          )}
        </div>

        {/* Summary boxes — same style as print template */}
        <div className="ps-summary-row">
          <div className="ps-summary-box blue">
            <div className="ps-summary-box-title">إجمالي المبيعات</div>
            <div className="ps-summary-box-value">{fmt(totals.sales)}</div>
          </div>
          <div className="ps-summary-box green">
            <div className="ps-summary-box-title">المدفوع</div>
            <div className="ps-summary-box-value">{fmt(totals.paid + totals.payments)}</div>
          </div>
          <div className={`ps-summary-box ${totals.net > 0 ? "red" : totals.net < 0 ? "green" : ""}`}>
            <div className="ps-summary-box-title">
              {totals.net > 0 ? "الصافي المستحق (عليه)" : totals.net < 0 ? "رصيد دائن (له)" : "الحساب مسوّى"}
            </div>
            <div className="ps-summary-box-value">{fmt(Math.abs(totals.net))}</div>
          </div>
          <div className="ps-summary-box">
            <div className="ps-summary-box-title">فواتير غير مسددة</div>
            <div className="ps-summary-box-value">{totals.unpaid}</div>
          </div>
        </div>

        {/* Invoices */}
        <div className="ps-section-title">الفواتير ({invoices.length})</div>
        {invoices.length ? (
          <table className="ps-table">
            <thead>
              <tr>
                <th style={{ width: 35 }}>#</th>
                <th>رقم الفاتورة</th>
                <th style={{ width: 100 }}>التاريخ</th>
                <th style={{ width: 110 }}>الإجمالي</th>
                <th style={{ width: 110 }}>المدفوع</th>
                <th style={{ width: 110 }}>المتبقي</th>
                <th style={{ width: 90 }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={inv.id}>
                  <td>{i + 1}</td>
                  <td style={{ fontWeight: 700 }}>{inv.invoice_number}</td>
                  <td>{inv.date}</td>
                  <td>{fmt(inv.total)}</td>
                  <td style={{ color: "#16a34a" }}>{fmt(inv.paid_amount)}</td>
                  <td style={{ color: "#c0392b", fontWeight: 700 }}>{fmt(inv.due_amount)}</td>
                  <td>{arInvoiceStatus(inv.workflow_status || inv.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ps-empty">لا توجد فواتير</div>
        )}

        {/* Quotes */}
        <div data-section="ps-quotes" data-section-label="عروض الأسعار">
          <div className="ps-section-title">عروض الأسعار ({quotes.length})</div>
          {quotes.length ? (
            <table className="ps-table">
              <thead>
                <tr>
                  <th style={{ width: 35 }}>#</th>
                  <th>رقم العرض</th>
                  <th style={{ width: 100 }}>التاريخ</th>
                  
                  <th style={{ width: 130 }}>الإجمالي</th>
                  <th style={{ width: 90 }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q, i) => (
                  <tr key={q.id}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 700 }}>{q.quote_number}</td>
                    <td>{q.date}</td>
                    
                    <td>{fmt(q.total)}</td>
                    <td>{arQuoteStatus(q.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ps-empty">لا توجد عروض أسعار</div>
          )}
        </div>

        {/* Returns */}
        <div data-section="ps-returns" data-section-label="المرتجعات">
          <div className="ps-section-title">المرتجعات ({returns.length})</div>
          {returns.length ? (
            <table className="ps-table">
              <thead>
                <tr>
                  <th style={{ width: 35 }}>#</th>
                  <th>رقم المرتجع</th>
                  <th style={{ width: 100 }}>التاريخ</th>
                  <th style={{ width: 130 }}>الإجمالي</th>
                  <th style={{ width: 90 }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 700 }}>{r.return_number}</td>
                    <td>{r.date}</td>
                    <td>{fmt(r.total)}</td>
                    <td>{arReturnStatus(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="ps-empty">لا توجد مرتجعات</div>
          )}
        </div>

        {/* Payments / Transactions */}
        <div className="ps-section-title">الدفعات والمعاملات ({transactions.length})</div>
        {transactions.length ? (
          <table className="ps-table">
            <thead>
              <tr>
                <th style={{ width: 35 }}>#</th>
                <th style={{ width: 100 }}>التاريخ</th>
                <th style={{ width: 80 }}>النوع</th>
                <th style={{ width: 120 }}>المبلغ</th>
                <th style={{ width: 100 }}>الطريقة</th>
                <th>الوصف</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={t.id}>
                  <td>{i + 1}</td>
                  <td>{t.date}</td>
                  <td>{t.type === "income" ? "قبض" : t.type === "expense" ? "صرف" : t.type}</td>
                  <td style={{ fontWeight: 700, color: t.type === "income" ? "#16a34a" : "#c0392b" }}>{fmt(t.amount)}</td>
                  <td>{t.method || "-"}</td>
                  <td style={{ textAlign: "right" }}>{t.description || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="ps-empty">لا توجد دفعات</div>
        )}

        {/* Final balance */}
        <div data-section="ps-final" data-section-label="الرصيد النهائي" className="ps-final">
          <div className="t">
            {totals.net > 0 ? "الصافي المستحق على العميل" : totals.net < 0 ? "رصيد دائن للعميل" : "الحساب مسوّى"}
          </div>
          <div className="v">{fmt(Math.abs(totals.net))} {data.company?.currency || ""}</div>
        </div>

        <div className="ps-thanks">شكراً لتعاملكم معنا</div>
      </div>
    </div>
  );
}
