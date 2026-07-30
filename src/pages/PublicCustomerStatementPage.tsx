import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer, Share2, Copy, Check } from "lucide-react";
import PrintVisibilityToolbar from "@/components/PrintVisibilityToolbar";
import { arQuoteStatus, arReturnStatus } from "@/utils/statusLabels";
import { openWhatsApp } from "@/utils/whatsapp";
import { buildCustomerAccountView, signedBalanceText, effectText } from "@/utils/buildCustomerAccountView";
import { netBalanceOf } from "@/utils/balanceDisplay";


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
  created_at?: string | null;
  amount: number;
  type: string;
  category?: string | null;
  description?: string | null;
  method?: string | null;
  account_id?: string | null;
  reference_id?: string | null;
  reference_no?: string | null;
  allocation?: any;
}

interface StatementData {
  customer: Customer;
  company: Company | null;
  invoices: Invoice[];
  quotes: Quote[];
  returns: StockReturn[];
  transactions: Tx[];
  accounts?: { id: string; name: string }[];
}


import { resolveLogoUrl } from "@/utils/albatoolLogo";

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** «2026-07-30 · الخميس · 14:45» */
const stampText = (x: { date: string; dayName: string; time: string }) =>
  [x.date, x.dayName, x.time].filter(Boolean).join(" · ");

function toneCell({ text, tone }: { text: string; tone: "debit" | "credit" | "settled" }) {
  const color = tone === "credit" ? "#16a34a" : tone === "debit" ? "#c0392b" : "#666";
  return <span style={{ color, fontWeight: 800, whiteSpace: "nowrap" }}>{text}</span>;
}
/** رصيد بلغة «له/عليه» — للأرصدة والمتبقي. */
const signedCell = (value: number) => toneCell(signedBalanceText(value));
/** دلتا حركة موقّعة — لا تصف رصيداً فلا تستعمل «له/عليه». */
const effectCell = (value: number) => toneCell(effectText(value));

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

  /**
   * كشف مجمّع حسب الفاتورة: كل فاتورة سطر مستقل بقيمتها، وتحتها مباشرة أي
   * تسوية استهلكت من متبقيها عبر شحن رصيد لاحق. حلّ محل السجل المسطّح الذي
   * كان يخلط الفواتير والدفعات في تسلسل زمني واحد يصعب على العميل قراءته.
   * المنطق الحسابي كما هو (buildCustomerLedger/classifyCreditRow) — العرض فقط تغيّر.
   */
  const account = useMemo(() => {
    if (!data) return null;
    return buildCustomerAccountView({
      invoices: data.invoices,
      transactions: data.transactions,
      accountNameById: new Map((data.accounts || []).map((a) => [a.id, a.name])),
      netBalance: netBalanceOf(data.customer as any),
    });
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

  const { customer, company, quotes, returns } = data;
  const logoURL = resolveLogoUrl(company?.logo_url);
  // رقم واحد في كل الصفحة: الصناديق والصندوق النهائي تقرأ نفس ما يجمعه الجدول،
  // فلا يرى العميل مجموعين مختلفين لو انحرف الرصيد المخزَّن.
  const accountNet = account?.accountTotal ?? 0;

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

        /* === SUMMARY BOXES — نفس مقاسات وألوان قالب طباعة الفاتورة ===
           الإطار أسود دائماً والقيمة وحدها ملوّنة (كما في printTemplate)، مع
           min-width مرن حتى لا تتكسّر الصناديق على الشاشات الصغيرة. */
        .ps-summary-row { display: flex; justify-content: center; gap: 30px; margin: 16px 0; flex-wrap: wrap; }
        /* flex: 0 1 auto مطابق لقالب الطباعة — الصندوق يأخذ حجمه الطبيعي ولا
           يتمدّد بانياً شريطاً عريضاً حين ينزل وحده على سطر جديد. */
        .ps-summary-box { border: 2px solid #1a1a1a; border-radius: 6px; padding: 12px 30px; text-align: center; min-width: min(220px, 100%); flex: 0 1 auto; }
        .ps-summary-box-title { font-size: 15px; font-weight: 800; color: #1a1a1a; margin-bottom: 4px; }
        .ps-summary-box-value { font-size: 20px; font-weight: 900; }
        .ps-summary-box.blue .ps-summary-box-value { color: #2980b9; }
        .ps-summary-box.red .ps-summary-box-value { color: #c0392b; }
        .ps-summary-box.green .ps-summary-box-value { color: #16a34a; }

        /* === SECTIONS & TABLES === */
        .ps-section-title { font-size: 14px; font-weight: 800; color: #5b2c8e; border-bottom: 2px dashed #5b2c8e; padding-bottom: 4px; margin: 18px 0 8px; }
        .ps-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 2px solid #1a1a1a; }
        .ps-table thead th { background: #5b4cad; color: white; padding: 8px 10px; font-size: 13px; font-weight: 700; text-align: center; border: 1px solid #1a1a1a; }
        .ps-table tbody td { padding: 7px 10px; text-align: center; font-size: 13px; border: 1px solid #999; }
        .ps-table tbody tr:nth-child(even) { background: #f8f8f8; }
        .ps-empty { text-align: center; padding: 12px; color: #888; font-size: 13px; background: #fafafa; border: 1px dashed #ccc; border-radius: 6px; margin-bottom: 12px; }

        /* === العرض المجمّع حسب الفاتورة === */
        .ps-by-invoice tbody tr:nth-child(even) { background: transparent; }
        .ps-by-invoice .ps-inv-row td { background: #fff; border-top: 2px solid #1a1a1a; }
        .ps-by-invoice .ps-settle-row td { background: #f6f8fb; font-size: 12px; color: #33475b; }
        .ps-settle-arrow { color: #5b4cad; font-weight: 900; margin-left: 4px; }
        .ps-settle-surplus { color: #16a34a; font-weight: 700; }
        /* صفوف المجاميع بنفس هوية .total-row في قالب طباعة الفاتورة */
        .ps-by-invoice .ps-total-row td { background: #f0f0f0; font-weight: 800; font-size: 14px; border: 2px solid #1a1a1a; }
        .ps-by-invoice .ps-closing-row td { background: #e8eef7; font-weight: 900; font-size: 15px; border: 2px solid #1a1a1a; }

        /* === FINAL BALANCE — بألوان صف «رصيد العميل الحالي» في قالب الفاتورة === */
        .ps-final { margin-top: 20px; padding: 14px; border: 2px solid #1a1a1a; border-radius: 6px; text-align: center; background: #e8eef7; }
        .ps-final .t { font-size: 15px; font-weight: 800; color: #1a1a1a; }
        .ps-final .v { font-size: 26px; font-weight: 900; color: #c0392b; margin-top: 4px; }
        .ps-final.credit .v { color: #16a34a; }

        /* === SIGNATURES (identical to printTemplate.ts) === */
        .ps-signatures { display: flex; justify-content: space-between; padding: 20px 50px 10px; margin-top: 20px; flex-wrap: wrap; gap: 12px; }
        .ps-sig-box { text-align: center; width: 150px; }
        .ps-sig-line { border-top: 1px solid #999; margin-top: 45px; padding-top: 5px; font-size: 12px; color: #555; font-weight: 600; }

        /* === ACTIONS / THANKS === */
        .ps-actions { max-width: 800px; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: flex-end; padding: 0 20px; }
        .ps-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; }
        .ps-btn-primary { background: #2980b9; color: white; }
        .ps-btn-default { background: white; color: #1a1a1a; border-color: #d1d5db; }
        .ps-thanks { text-align: center; margin-top: 18px; font-size: 13px; color: #555; font-style: italic; }

        /* على الشاشات الضيقة تمرّر الجداول أفقياً داخل حاويتها بدل أن تُعصر
           فتنكسر الكلمات حرفاً حرفاً — الصفحة نفسها لا تمرّر أفقياً أبداً. */
        .ps-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 640px) {
          .ps-table { min-width: 560px; }
          /* جدول الفواتير 7 أعمدة — يحتاج عرضاً أكبر وإلا انكسر البيان حرفاً حرفاً */
          .ps-table.ps-by-invoice { min-width: 780px; }
          .ps-by-invoice td, .ps-by-invoice th { white-space: nowrap; }
          .ps-page { padding: 12px; }
          .ps-summary-box { padding: 10px 16px; }
        }

        @media print {
          .ps-actions { display: none !important; }
          .public-statement { background: #fff !important; padding: 0 !important; }
          .ps-page { box-shadow: none !important; padding: 8mm !important; max-width: 100% !important; }
          /* الطباعة تُظهر الجدول كاملاً — لا تمرير ولا عرض أدنى */
          .ps-table-scroll { overflow: visible !important; }
          .ps-table { min-width: 0 !important; }
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
            { key: "ps-charges", label: "شحنات الرصيد" },
            { key: "ps-quotes", label: "عروض الأسعار" },
            { key: "ps-returns", label: "المرتجعات" },
            { key: "ps-final", label: "الرصيد النهائي" },
            { key: "ps-signatures", label: "التواقيع" },
          ]}
          shareTitle={`كشف حساب — ${customer.name}`}
          shareSummary={`الصافي: ${fmt(Math.abs(accountNet))} ${company?.currency || ""}${accountNet > 0 ? " عليه" : accountNet < 0 ? " له" : ""}`}
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
            <div className="ps-summary-box-value">{fmt(account?.totalInvoiced ?? 0)}</div>
          </div>
          <div className="ps-summary-box green">
            <div className="ps-summary-box-title">المدفوع على الفواتير</div>
            <div className="ps-summary-box-value">{fmt(account?.totalPaid ?? 0)}</div>
          </div>
          <div className={`ps-summary-box ${accountNet > 0 ? "red" : accountNet < 0 ? "green" : ""}`}>
            <div className="ps-summary-box-title">
              {accountNet > 0 ? "الصافي المستحق (عليه)" : accountNet < 0 ? "رصيد دائن (له)" : "الحساب خالص"}
            </div>
            <div className="ps-summary-box-value">{fmt(Math.abs(accountNet))}</div>
          </div>
          <div className="ps-summary-box">
            <div className="ps-summary-box-title">فواتير غير مسددة</div>
            <div className="ps-summary-box-value">
              {(account?.blocks || []).filter((b) => b.remaining > 0.009).length}
            </div>
          </div>
        </div>

        {/* الفواتير — كل فاتورة سطر مستقل تتبعه حركاتها المرتبطة بها فقط */}
        <div className="ps-section-title">الفواتير وحركاتها ({account?.blocks.length || 0})</div>
        {account && account.blocks.length ? (
          <div className="ps-table-scroll"><table className="ps-table ps-by-invoice">
            <thead>
              <tr>
                <th style={{ width: 35 }}>#</th>
                <th style={{ width: 150 }}>التاريخ واليوم والساعة</th>
                <th>البيان</th>
                <th style={{ width: 100 }}>الإجمالي</th>
                <th style={{ width: 100 }}>المدفوع</th>
                <th style={{ width: 120 }}>المتبقي</th>
                <th style={{ width: 130 }}>حساب العميل بعدها</th>
              </tr>
            </thead>
            <tbody>
              {account.blocks.map((b, i) => (
                <Fragment key={b.invoiceId}>
                  <tr className="ps-inv-row">
                    <td>{i + 1}</td>
                    <td>{stampText(b)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>فاتورة {b.invoiceNumber}</td>
                    <td style={{ fontWeight: 700 }}>{fmt(b.total)}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{b.paid ? fmt(b.paid) : "—"}</td>
                    <td>{signedCell(b.remaining)}</td>
                    <td>{signedCell(b.runningAtCreation)}</td>
                  </tr>
                  {b.movements.map((m) => (
                    <tr key={m.id} className="ps-settle-row">
                      <td />
                      <td>{stampText(m)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className="ps-settle-arrow">↳</span> {m.label}
                        <span style={{ color: "#667" }}> — {m.detail}</span>
                      </td>
                      <td>—</td>
                      <td style={{ color: "#16a34a", fontWeight: 700 }}>
                        {m.effect ? fmt(Math.abs(m.effect)) : "—"}
                      </td>
                      <td>{effectCell(m.effect)}</td>
                      <td>{signedCell(m.runningBalance)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}

              <tr className="ps-total-row">
                <td colSpan={3} style={{ textAlign: "right", fontWeight: 800 }}>مجموع الفواتير</td>
                <td style={{ fontWeight: 800 }}>{fmt(account.totalInvoiced)}</td>
                <td style={{ fontWeight: 800, color: "#16a34a" }}>{fmt(account.totalPaid)}</td>
                <td>{signedCell(account.totalRemaining)}</td>
                <td />
              </tr>
              {account.creditPoolTotal > 0.009 && (
                <tr className="ps-total-row">
                  <td colSpan={5} style={{ textAlign: "right", fontWeight: 800 }}>
                    يُخصم منه رصيد العميل القابل للتوزيع
                  </td>
                  <td style={{ fontWeight: 800, color: "#16a34a" }}>+{fmt(account.creditPoolTotal)}</td>
                  <td />
                </tr>
              )}
              <tr className="ps-closing-row">
                <td colSpan={5} style={{ textAlign: "right", fontWeight: 900 }}>إجمالي حساب العميل</td>
                <td colSpan={2}>{signedCell(account.accountTotal)}</td>
              </tr>
            </tbody>
          </table></div>
        ) : (
          <div className="ps-empty">لا توجد فواتير</div>
        )}

        {/* رصيد العميل القابل للتوزيع — لا يُوزَّع تلقائياً على أي فاتورة */}
        {account && account.creditPool.length > 0 && (
          <div data-section="ps-charges" data-section-label="رصيد العميل">
            <div className="ps-section-title">رصيد العميل القابل للتوزيع ({account.creditPool.length})</div>
            <div className="ps-table-scroll"><table className="ps-table">
              <thead>
                <tr>
                  <th style={{ width: 35 }}>#</th>
                  <th style={{ width: 150 }}>التاريخ واليوم والساعة</th>
                  <th>البيان</th>
                  <th style={{ width: 120 }}>المبلغ</th>
                  <th style={{ width: 130 }}>حساب العميل بعدها</th>
                </tr>
              </thead>
              <tbody>
                {account.creditPool.map((e, i) => (
                  <tr key={e.id}>
                    <td>{i + 1}</td>
                    <td>{stampText(e)}</td>
                    <td style={{ textAlign: "right" }}>
                      {e.label}<span style={{ color: "#667" }}> — {e.detail}</span>
                    </td>
                    <td>{effectCell(e.effect)}</td>
                    <td>{signedCell(e.runningBalance)}</td>
                  </tr>
                ))}
                <tr className="ps-total-row">
                  <td colSpan={3} style={{ textAlign: "right", fontWeight: 800 }}>المتاح للتوزيع</td>
                  <td style={{ fontWeight: 800, color: "#16a34a" }}>+{fmt(account.creditPoolTotal)}</td>
                  <td>{signedCell(account.accountTotal)}</td>
                </tr>
              </tbody>
            </table></div>
          </div>
        )}

        {/* Final balance */}
        <div
          data-section="ps-final"
          data-section-label="الرصيد النهائي"
          className={`ps-final ${accountNet < 0 ? "credit" : ""}`}
        >
          <div className="t">
            {accountNet > 0 ? "الصافي المستحق على العميل" : accountNet < 0 ? "رصيد دائن للعميل" : "الحساب خالص"}
          </div>
          <div className="v">{fmt(Math.abs(accountNet))} {company?.currency || ""}</div>
        </div>

        {/* التواقيع — نفس كتلة قالب طباعة الفاتورة وعرض السعر */}
        <div data-section="ps-signatures" data-section-label="التواقيع" className="ps-signatures">
          <div className="ps-sig-box"><div className="ps-sig-line">توقيع المستلم</div></div>
          <div className="ps-sig-box"><div className="ps-sig-line">توقيع المسؤول</div></div>
        </div>

        <div className="ps-thanks">شكراً لتعاملكم معنا</div>
      </div>
    </div>
  );
}
