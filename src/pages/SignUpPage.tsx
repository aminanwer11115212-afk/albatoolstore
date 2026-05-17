import { Link } from "react-router-dom";
import logo from "@/assets/logo.png";

export default function SignUpPage() {
  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--muted))", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} dir="rtl">
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div className="legacy-card card-block" style={{ padding: "2rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <img src={logo} alt="Aminco" style={{ height: 80, margin: "0 auto" }} />
            <h5 style={{ marginTop: 12 }}>التسجيل مغلق</h5>
            <hr />
          </div>
          <div className="legacy-alert legacy-alert-warning" style={{ textAlign: "center", lineHeight: 1.8 }}>
            <strong>Aminco System</strong>
            <br />
            التسجيل الذاتي مغلق في هذا النظام.
            <br />
            الحسابات تُنشأ من قِبل المسؤول فقط.
            <br />
            <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              يرجى التواصل مع مسؤول النظام لإنشاء حسابك.
            </span>
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Link to="/login" className="legacy-btn legacy-btn-primary">العودة لتسجيل الدخول</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
