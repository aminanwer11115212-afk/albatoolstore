import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  /** عنوان رئيسي للتقرير */
  title: string;
  /** عنوان فرعي اختياري (مثل اسم العميل أو الفترة) */
  subtitle?: string;
  /** نص الفترة (مثل: من 2025-01-01 إلى 2025-12-31) */
  periodText?: string;
}

interface CompanyInfo {
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  logo_url?: string | null;
  tax_number?: string | null;
}

const STYLE_TAG_ID = "__lov_report_print_styles__";

function injectGlobalReportStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = `
    .__lov_report_header {
      background: linear-gradient(135deg, #5b2c8e, #7e3eb5);
      color: #fff;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      box-shadow: 0 4px 14px rgba(91,44,142,0.18);
    }
    .__lov_report_header img.__lov_logo {
      height: 64px; width: 64px; object-fit: contain;
      background: #fff; border-radius: 10px; padding: 4px;
    }
    .__lov_report_header .__lov_company { flex: 1; min-width: 200px; }
    .__lov_report_header .__lov_company h2 { margin: 0 0 4px; font-size: 18px; font-weight: 800; }
    .__lov_report_header .__lov_company .__lov_meta { font-size: 12px; opacity: 0.92; line-height: 1.6; }
    .__lov_report_header .__lov_title-box {
      text-align: center; padding: 6px 14px;
      background: rgba(255,255,255,0.14); border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.25);
      min-width: 180px;
    }
    .__lov_report_header .__lov_title-box .__lov_t { font-size: 16px; font-weight: 800; }
    .__lov_report_header .__lov_title-box .__lov_st { font-size: 12px; opacity: 0.9; margin-top: 2px; }
    .__lov_report_header .__lov_title-box .__lov_pd { font-size: 11px; opacity: 0.85; margin-top: 4px; }

    @media print {
      @page { size: A4; margin: 12mm; }
      body { background: #fff !important; }
      .__lov_report_header {
        background: #5b2c8e !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `;
  document.head.appendChild(style);
}

export default function ReportPrintHeader({ title, subtitle, periodText }: Props) {
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    injectGlobalReportStyles();
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("company_settings")
        .select("*")
        .maybeSingle();
      if (!cancelled) setCompany(data || null);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      className="__lov_report_header"
      data-section="header"
      data-section-label="الترويسة"
      dir="rtl"
    >
      {company?.logo_url ? (
        <img src={company.logo_url} alt="logo" className="__lov_logo" />
      ) : (
        <div
          className="__lov_logo"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "#5b2c8e", fontWeight: 800 }}
        >
          {company?.company_name?.charAt(0) || "•"}
        </div>
      )}
      <div className="__lov_company">
        <h2>{company?.company_name || "اسم الشركة"}</h2>
        <div className="__lov_meta">
          {company?.phone && <div>📞 {company.phone}</div>}
          {company?.email && <div>✉️ {company.email}</div>}
          {company?.address && <div>📍 {company.address}</div>}
          {company?.tax_number && <div>🧾 الرقم الضريبي: {company.tax_number}</div>}
        </div>
      </div>
      <div className="__lov_title-box">
        <div className="__lov_t">{title}</div>
        {subtitle && <div className="__lov_st">{subtitle}</div>}
        {periodText && <div className="__lov_pd">📅 {periodText}</div>}
      </div>
    </div>
  );
}
