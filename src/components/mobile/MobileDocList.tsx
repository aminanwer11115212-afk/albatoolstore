import { ReactNode } from "react";

/**
 * بطاقة موحّدة لعرض المستند (فاتورة/عرض/مشتريات/منتج) في شاشة الهاتف.
 * تظهر فقط على شاشات < 768px ويُخفى الجدول العادي.
 */
export interface MobileDocCardProps {
  index: number;
  number: string;
  party: string;
  amount?: string;
  date?: string;
  status?: ReactNode;
  badges?: ReactNode;
  onOpen?: () => void;
  actions?: ReactNode;
}

export function MobileDocCard({
  index, number, party, amount, date, status, badges, onOpen, actions,
}: MobileDocCardProps) {
  return (
    <div
      className="mobile-doc-card"
      onClick={onOpen}
      style={{
        background: "hsl(var(--card))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        cursor: onOpen ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
          <span style={{
            background: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground))",
            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
            flexShrink: 0,
          }}>{index}</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "hsl(var(--primary))", flexShrink: 0 }}>
            {number}
          </span>
        </div>
        {status && <div style={{ flexShrink: 0 }}>{status}</div>}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {party}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12 }}>
        {date && <span style={{ color: "hsl(var(--muted-foreground))" }}>{date}</span>}
        {amount && <span style={{ fontWeight: 700, color: "hsl(var(--foreground))" }}>{amount}</span>}
      </div>

      {badges && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{badges}</div>}

      {actions && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingTop: 6, borderTop: "1px dashed hsl(var(--border))" }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * CSS مشترك يضاف داخل الصفحات لإخفاء الجدول وإظهار قائمة البطاقات في الهاتف.
 * استخدام: <style>{mobileDocListCSS}</style>
 */
export const mobileDocListCSS = `
  .mobile-doc-list { display: none; }
  @media (max-width: 767px) {
    .mobile-doc-list { display: block; }
    .desktop-table-wrap { display: none !important; }
    .desktop-toolbar { display: none !important; }
    .legacy-pagination { flex-wrap: wrap; gap: 4px; justify-content: center; }
    .legacy-pagination .page-link { font-size: 12px !important; padding: 4px 10px !important; }
    .legacy-dt-info { font-size: 11px; text-align: center; }
    .mobile-toolbar { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }
    .mobile-toolbar input, .mobile-toolbar select {
      width: 100%; height: 32px; font-size: 13px; padding: 4px 8px;
      border: 1px solid hsl(var(--border)); border-radius: 6px;
      background: hsl(var(--background)); color: hsl(var(--foreground));
    }
  }
  @media (min-width: 768px) {
    .mobile-toolbar { display: none; }
  }
`;
