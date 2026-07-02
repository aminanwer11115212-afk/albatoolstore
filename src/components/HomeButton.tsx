import { Home } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

const HIDDEN_PATTERNS = [
  /^\/$/,
  /^\/login/,
  /^\/signup/,
  /^\/share\//,
];

/**
 * زر عائم أيقونة فقط للعودة إلى لوحة التحكم.
 * يظهر مثبتاً (position: fixed) في طرف الصفحة على كل المسارات
 * ما عدا الشاشة الرئيسية وشاشات تسجيل الدخول والمشاركة العامة.
 */
export function HomeButton({ to = "/", label = "لوحة التحكم" }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (HIDDEN_PATTERNS.some((re) => re.test(pathname))) return null;
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      title={label}
      aria-label={label}
      className="home-quick-btn"
    >
      <Home size={16} aria-hidden />
    </button>
  );
}

export default HomeButton;
