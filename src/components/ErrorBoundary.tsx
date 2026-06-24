import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

/**
 * ErrorBoundary عام يلتقط أخطاء العرض في شجرة React.
 * يعرض رسالة عربية بسيطة مع زرّ إعادة تحميل.
 * النص قائم بذاته (لا يستورد من باقي التطبيق) كي يظل قابلاً للعرض
 * حتى لو كان السبب module-init failure في أحد الـ providers.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // نطبع الخطأ الكامل (مع stack) ليلتقطه أي مراقب أخطاء خارجي.
    console.error("[ErrorBoundary] render error:", error, info);
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  handleGoHome = () => {
    try {
      window.location.href = "/";
    } catch {
      // ignore
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const msg = this.state.error?.message || "خطأ غير معروف";

    return (
      <div
        dir="rtl"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily: "Cairo, system-ui, -apple-system, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
            نعتذر، تعطّل عرض الصفحة. حاول إعادة التحميل أو العودة للرئيسية.
          </p>
          <details
            style={{
              textAlign: "right",
              fontSize: 11,
              color: "#475569",
              background: "#f1f5f9",
              padding: "8px 10px",
              borderRadius: 8,
              marginBottom: 14,
              overflow: "auto",
              maxHeight: 120,
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>تفاصيل تقنية</summary>
            <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 10 }}>
              {msg}
            </pre>
          </details>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: "8px 16px",
                background: "#f97316",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              إعادة التحميل
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                padding: "8px 16px",
                background: "#fff",
                color: "#0f172a",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
