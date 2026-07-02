import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * زر عودة سريع إلى لوحة التحكم (الشاشة الرئيسية).
 * يُوضع في طرف الصفحة (أعلى اليسار في تخطيط RTL) داخل عنصر مضيف position:relative.
 */
export function HomeButton({ to = "/", label = "لوحة التحكم" }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      title={label}
      aria-label={label}
      className="home-quick-btn"
      style={{
        position: "absolute",
        top: 6,
        left: 6,
        zIndex: 5,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        minHeight: 32,
        borderRadius: 6,
        border: "1px solid hsl(var(--border))",
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      <Home size={14} />
      <span>{label}</span>
    </button>
  );
}

export default HomeButton;
