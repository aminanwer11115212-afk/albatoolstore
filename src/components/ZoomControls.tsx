import { ZoomIn, ZoomOut } from "lucide-react";
import { useItemsZoom } from "@/hooks/useItemsZoom";

/**
 * أزرار تكبير/تصغير حجم البنود — تستخدم نفس الـ hook ومتغير CSS
 * المشترك (`--items-zoom`) المُستخدم في صفحات إنشاء الفاتورة/عرض السعر/المشتريات.
 */
export default function ZoomControls({ className = "" }: { className?: string }) {
  const { zoom, inc, dec } = useItemsZoom();
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <button
        type="button"
        onClick={dec}
        className="legacy-btn legacy-btn-default btn-sm"
        title="تصغير"
      >
        <ZoomOut />
      </button>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          minWidth: 38,
          textAlign: "center",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={inc}
        className="legacy-btn legacy-btn-default btn-sm"
        title="تكبير"
      >
        <ZoomIn />
      </button>
    </span>
  );
}
