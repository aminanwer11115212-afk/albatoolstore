import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.png";

function translateAuthError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid_credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  if (m.includes("email not confirmed")) return "لم يتم تأكيد البريد الإلكتروني. تواصل مع المسؤول.";
  if (m.includes("too many") || m.includes("rate limit")) return "محاولات كثيرة متتالية. حاول بعد دقيقة.";
  if (m.includes("network")) return "تعذّر الاتصال بالخادم. تحقق من الإنترنت.";
  if (m.includes("user not found")) return "هذا الحساب غير موجود. تواصل مع المسؤول.";
  if (m.includes("disabled")) return "تم إيقاف هذا الحساب. تواصل مع المسؤول.";
  return msg || "حدث خطأ غير متوقع";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      toast({ title: "بيانات ناقصة", description: "يرجى إدخال البريد وكلمة المرور", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    if (error) {
      toast({ title: "تعذّر تسجيل الدخول", description: translateAuthError(error.message), variant: "destructive" });
      setLoading(false);
      return;
    }
    const uid = signInData.user?.id;

    // فحص السماح بالدخول — Aminco System
    const { data: statusData, error: statusErr } = await supabase.rpc("current_user_login_status");
    const status = (statusData as string) || "pending";

    if (statusErr) {
      await supabase.auth.signOut();
      toast({ title: "تعذّر التحقق", description: translateAuthError(statusErr.message), variant: "destructive" });
      setLoading(false);
      return;
    }

    if (status !== "allowed") {
      await supabase.auth.signOut();
      const msg =
        status === "pending"
          ? "حسابك بانتظار موافقة المسؤول. يجب أن يضيفك من صفحة الموظفين."
          : status === "disabled"
          ? "تم إيقاف حسابك. يرجى التواصل مع المسؤول."
          : "غير مصرح لك بالدخول. يرجى التواصل مع المسؤول.";
      toast({ title: "الدخول مرفوض", description: msg, variant: "destructive" });
      setLoading(false);
      return;
    }

    // مسموح — قرار التوجيه حسب الدور
    if (uid) {
      const { data: roleRow } = await supabase
        .from("user_roles").select("role").eq("user_id", uid).maybeSingle();
      if (roleRow?.role && roleRow.role !== "admin") {
        navigate("/staff");
        setLoading(false);
        return;
      }
    }
    navigate("/");
    setLoading(false);
  };


  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--muted))", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} dir="rtl">
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div className="legacy-card card-block" style={{ padding: "2rem" }}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <img src={logo} alt="البتول" style={{ height: 80, margin: "0 auto" }} />
            <h5 style={{ marginTop: 12 }}>لوحة دخول الموظفين</h5>
            <hr />
          </div>

          <form onSubmit={handleLogin} className="legacy-form-horizontal">
            <div className="legacy-form-row">
              <label className="legacy-form-label">البريد</label>
              <div className="legacy-form-control-wrap">
                <input type="email" className="legacy-control" placeholder="بريدك الإلكتروني" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label">كلمة المرور</label>
              <div className="legacy-form-control-wrap">
                <input type="password" className="legacy-control" placeholder="كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label"></label>
              <div className="legacy-form-control-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> تذكرني
                </label>
                <button type="button" style={{ background: "none", border: "none", color: "hsl(var(--primary))", fontSize: 13, cursor: "pointer" }}>هل نسيت كلمة المرور؟</button>
              </div>
            </div>
            <div className="legacy-form-row">
              <label className="legacy-form-label"></label>
              <div className="legacy-form-control-wrap">
                <button type="submit" disabled={loading} className="legacy-btn legacy-btn-primary" style={{ width: "100%" }}>
                  {loading ? "جاري الدخول..." : "تسجيل الدخول"}
                </button>
              </div>
            </div>
          </form>

          <hr style={{ marginTop: 20 }} />
          <p style={{ textAlign: "center", fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
            Aminco System — الحسابات تُنشأ من المسؤول فقط
          </p>
        </div>
      </div>
    </div>
  );
}
