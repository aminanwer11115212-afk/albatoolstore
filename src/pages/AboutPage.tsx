import logo from "@/assets/logo.png";

export default function AboutPage() {
  return (
    <article className="content">
      <div className="legacy-card card-block" style={{ textAlign: "center" }}>
        <img src={logo} alt="البتول" style={{ height: "80px", margin: "0 auto 12px" }} />
        <h5>نظام البتول</h5>
        <hr />
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "13px", lineHeight: 1.7 }}>
          نظام البتول هو نظام إدارة أعمال متكامل مصمم خصيصاً لإدارة المبيعات، المخزون، الفواتير،
          العملاء، والمحاسبة. يوفر النظام أدوات متقدمة لتسهيل العمليات التجارية اليومية وتحسين كفاءة الأعمال.
        </p>
        <p style={{ marginTop: "16px", fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
          الإصدار 2.0.0 — © {new Date().getFullYear()} جميع الحقوق محفوظة
        </p>
      </div>
    </article>
  );
}
