import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();
  useEffect(() => { console.error("404:", location.pathname); }, [location.pathname]);
  return (
    <article className="content">
      <div className="legacy-card card-block" style={{ textAlign: "center" }}>
        <h5>404 — الصفحة غير موجودة</h5>
        <hr />
        <p style={{ color: "hsl(var(--muted-foreground))" }}>الصفحة المطلوبة غير متوفرة.</p>
        <a href="/" className="legacy-btn legacy-btn-primary">العودة للرئيسية</a>
      </div>
    </article>
  );
};

export default NotFound;
