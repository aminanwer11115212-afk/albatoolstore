import { useState } from "react";
import { Eye, EyeOff, Mail, Shield, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export default function StaffProfilePage() {
  const { user } = useAuth();
  const { role, permissions } = useUserRole();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = (() => {
    if (!pwd) return { label: "", color: "", w: 0 };
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s <= 1) return { label: "ضعيفة", color: "bg-red-500", w: 25 };
    if (s === 2) return { label: "متوسطة", color: "bg-amber-500", w: 50 };
    if (s === 3) return { label: "جيدة", color: "bg-blue-500", w: 75 };
    return { label: "قوية", color: "bg-green-500", w: 100 };
  })();

  const change = async () => {
    if (pwd.length < 6) return toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    if (pwd !== confirm) return toast.error("كلمتا المرور غير متطابقتين");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث كلمة المرور بنجاح");
    setPwd(""); setConfirm("");
  };

  const permList = [
    { key: "create_quote", label: "إنشاء عروض الأسعار" },
    { key: "create_invoice", label: "إنشاء الفواتير" },
    { key: "view_customers", label: "عرض العملاء" },
    { key: "add_customer", label: "إضافة عملاء" },
    { key: "view_products", label: "عرض المنتجات" },
  ];

  const inputCls = "w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">ملفي الشخصي</h1>

      <div className="bg-card p-6 rounded-xl border border-border space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold uppercase">
            {(user?.email || "?")[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-foreground"><Mail size={14} className="text-muted-foreground" /> <span className="truncate">{user?.email}</span></div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1"><Shield size={12} /> الدور: <span className="font-medium text-foreground">{role || "—"}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-card p-6 rounded-xl border border-border">
        <h2 className="font-semibold text-foreground mb-3">صلاحياتي</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {permList.map(p => {
            const allowed = (permissions as any)[p.key] !== false;
            return (
              <div key={p.key} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${allowed ? "border-border bg-background" : "border-border bg-muted/40 text-muted-foreground"}`}>
                <span>{p.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${allowed ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                  {allowed ? "مسموح" : "ممنوع"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card p-6 rounded-xl border border-border space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2"><KeyRound size={16} /> تغيير كلمة المرور</h2>
        <div className="relative">
          <input type={show ? "text" : "password"} placeholder="كلمة مرور جديدة" value={pwd} onChange={e => setPwd(e.target.value)} className={inputCls} />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {pwd && (
          <div className="space-y-1">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full transition-all ${strength.color}`} style={{ width: `${strength.w}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">قوة كلمة المرور: <span className="font-medium text-foreground">{strength.label}</span></div>
          </div>
        )}
        <input type={show ? "text" : "password"} placeholder="تأكيد كلمة المرور" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
        <button onClick={change} disabled={saving || !pwd || !confirm} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {saving ? "جاري التحديث..." : "تحديث كلمة المرور"}
        </button>
      </div>
    </div>
  );
}
