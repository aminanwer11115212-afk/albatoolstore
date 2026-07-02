import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * زر عودة سريع إلى لوحة التحكم (الشاشة الرئيسية).
 * يوضع في طرف الصفحة (أعلى بداية الاتجاه = يمين في RTL) داخل عنصر مضيف position:relative.
 * التنسيق يعتمد على كلاس .home-quick-btn المعرف في index.css للاستجابة على الموبايل.
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
    >
      <Home size={14} aria-hidden />
      <span className="home-quick-btn__label">{label}</span>
    </button>
  );
}

export default HomeButton;
