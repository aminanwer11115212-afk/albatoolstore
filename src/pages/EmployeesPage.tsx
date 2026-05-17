import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, UserCheck, UserX, KeyRound, ShieldCheck, Power } from "lucide-react";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";

const PERMS = [
  { key: "create_invoice", label: "إنشاء فواتير" },
  { key: "create_quote", label: "إنشاء عروض أسعار" },
  { key: "add_customer", label: "إضافة عملاء" },
  { key: "view_customers", label: "عرض العملاء" },
  { key: "view_products", label: "عرض المنتجات" },
];

export default function EmployeesPage() {
  const { data: employees, isLoading, insert, update, remove } = useEmployees();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", role: "employee", status: "active", phone: "", email: "", salary: "", notes: "" });
  const [accessFor, setAccessFor] = useState<any | null>(null);
  const [accessForm, setAccessForm] = useState({ email: "", password: "", role: "sales", permissions: { create_invoice: true, create_quote: true, add_customer: true, view_customers: true, view_products: true } as any });
  const [busy, setBusy] = useState(false);
  const [roleMap, setRoleMap] = useState<Record<string, { user_id: string; role: string; permissions: any }>>({});
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagResult, setDiagResult] = useState<string>("");
  const [diagBusy, setDiagBusy] = useState(false);

  const runDiagnostic = async () => {
    setDiagBusy(true);
    setDiagOpen(true);
    setDiagResult("جاري الاختبار...");
    const lines: string[] = [];
    try {
      const { data: { session } } = await supabase.auth.getSession();
      lines.push(`✓ المستخدم: ${session?.user?.email || "غير مسجل"}`);
      lines.push(`✓ Token: ${session?.access_token ? "موجود" : "مفقود"}`);
      lines.push(`✓ Project: ${import.meta.env.VITE_SUPABASE_PROJECT_ID}`);
      lines.push(`---`);
      lines.push(`جارٍ استدعاء create-staff-user (action: ping)...`);
      const t0 = performance.now();
      const { data, error } = await supabase.functions.invoke("create-staff-user", { body: { action: "ping" } });
      const ms = Math.round(performance.now() - t0);
      lines.push(`⏱ الاستجابة في ${ms}ms`);
      if (error) {
        lines.push(`✗ خطأ: ${error.message}`);
        const ctx: any = (error as any).context;
        if (ctx) {
          lines.push(`  status: ${ctx.status ?? "?"}`);
          try {
            if (typeof ctx.text === "function") {
              const t = await ctx.text();
              if (t) lines.push(`  body: ${t.slice(0, 500)}`);
            }
          } catch {}
        }
      } else {
        lines.push(`✓ نجح الاستدعاء`);
        lines.push(`  response: ${JSON.stringify(data).slice(0, 500)}`);
      }
    } catch (e: any) {
      lines.push(`✗ استثناء: ${e?.message || String(e)}`);
    }
    setDiagResult(lines.join("\n"));
    setDiagBusy(false);
  };

  const loadRoles = async () => {
    const { data } = await supabase.from("user_roles").select("user_id, role, employee_id, permissions");
    const map: any = {};
    (data || []).forEach((r: any) => { if (r.employee_id) map[r.employee_id] = r; });
    setRoleMap(map);
  };
  useEffect(() => { loadRoles(); }, [employees]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("الاسم مطلوب"); return; }
    try {
      const payload = { ...form, salary: Number(form.salary) || 0 };
      if (editId) { await update.mutateAsync({ id: editId, ...payload }); toast.success("تم التحديث"); }
      else { await insert.mutateAsync(payload); toast.success("تم الإضافة"); }
      setShowForm(false); setEditId(null);
      setForm({ name: "", role: "employee", status: "active", phone: "", email: "", salary: "", notes: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  const openAccess = (emp: any) => {
    const existing = roleMap[emp.id];
    setAccessFor(emp);
    setAccessForm({
      email: emp.email || "",
      password: "",
      role: existing?.role || "sales",
      permissions: existing?.permissions && Object.keys(existing.permissions).length
        ? existing.permissions
        : { create_invoice: true, create_quote: true, add_customer: true, view_customers: true, view_products: true },
    });
  };

  const handleCallError = async (error: any): Promise<never> => {
    const raw = (error?.message || "").toLowerCase();
    let title = "تعذّر تنفيذ العملية";
    let description = error?.message || "حدث خطأ غير متوقع";
    let action: { label: string; onClick: () => void } | undefined;

    // Try to extract server-provided error message first
    let serverMsg = "";
    let status: number | undefined;
    try {
      const ctx: any = error?.context;
      status = ctx?.status;
      if (ctx?.json) { const j = await ctx.json(); serverMsg = j?.error || ""; }
      else if (ctx?.text) { const t = await ctx.text(); serverMsg = t || ""; }
    } catch {}

    const isNetwork = raw.includes("failed to fetch") || raw.includes("failed to send") || raw.includes("networkerror") || raw.includes("load failed");

    if (isNetwork) {
      title = "تعذّر الاتصال بالخادم";
      description = "تحقق من اتصالك بالإنترنت ثم أعد المحاولة. إذا استمرت المشكلة جرّب إعادة تحميل الصفحة.";
      action = { label: "إعادة تحميل", onClick: () => window.location.reload() };
    } else if (status === 401 || /unauthor/i.test(serverMsg)) {
      title = "انتهت الجلسة";
      description = "يرجى إعادة تسجيل الدخول للمتابعة.";
      action = { label: "تسجيل الدخول", onClick: async () => { await supabase.auth.signOut(); window.location.href = "/login"; } };
    } else if (status === 403 || /admin|forbid|permission/i.test(serverMsg)) {
      title = "صلاحيات غير كافية";
      description = "هذه العملية متاحة لحساب المدير فقط. تأكد أنك مسجّل بحساب مدير.";
    } else if (status === 404) {
      title = "الخدمة غير متاحة";
      description = "خدمة إدارة الحسابات غير منشورة حالياً. يُرجى إعادة المحاولة بعد قليل أو التواصل مع الدعم.";
    } else if (status && status >= 500) {
      title = "خطأ في الخادم";
      description = serverMsg || "حدث خطأ داخلي أثناء معالجة الطلب.";
    } else if (serverMsg) {
      description = serverMsg;
    }

    toast.error(title, { description, action, duration: 8000 });
    throw new Error(description);
  };

  const callFn = async (body: any) => {
    try {
      const { data, error } = await supabase.functions.invoke("create-staff-user", { body });
      if (error) await handleCallError(error);
      if (data && (data as any).error) {
        toast.error("تعذّر تنفيذ العملية", { description: (data as any).error, duration: 8000 });
        throw new Error((data as any).error);
      }
      return data;
    } catch (e: any) {
      // Network failure before reaching invoke (rare) — invoke usually surfaces it as `error`.
      if (e?.message && !/تعذّر|انتهت|صلاحيات|الخدمة|خطأ/.test(e.message)) {
        await handleCallError(e);
      }
      throw e;
    }
  };

  const submitAccess = async () => {
    if (!accessFor) return;
    const existing = roleMap[accessFor.id];
    setBusy(true);
    try {
      if (existing) {
        await callFn({ action: "update_role", user_id: existing.user_id, role: accessForm.role, permissions: accessForm.permissions });
        if (accessForm.password) await callFn({ action: "reset_password", user_id: existing.user_id, password: accessForm.password });
        toast.success("تم تحديث الصلاحيات");
      } else {
        if (!accessForm.email || !accessForm.password) { toast.error("البريد وكلمة المرور مطلوبان"); setBusy(false); return; }
        await callFn({ action: "create", email: accessForm.email, password: accessForm.password, employee_id: accessFor.id, role: accessForm.role, permissions: accessForm.permissions });
        toast.success("تم إنشاء حساب الدخول");
      }
      setAccessFor(null); await loadRoles();
    } catch { /* toast already shown by callFn */ }
    setBusy(false);
  };

  const toggleLogin = async (emp: any) => {
    setBusy(true);
    try { await callFn({ action: "toggle_login", employee_id: emp.id, enabled: !emp.login_enabled }); toast.success("تم"); await loadRoles(); }
    catch { /* toast already shown */ }
    setBusy(false);
  };

  const roleLabels: Record<string, string> = { admin: "مدير", employee: "موظف", accountant: "محاسب", salesman: "مندوب مبيعات" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">إدارة الموظفين</h1>
        <div className="flex items-center gap-2">
          <button onClick={runDiagnostic} disabled={diagBusy}
            className="flex items-center gap-2 bg-amber-500 text-white px-3 py-2 rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50">
            🔧 اختبار الدالة
          </button>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", role: "employee", status: "active", phone: "", email: "", salary: "", notes: "" }); }}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90"><Plus size={16} /> إضافة موظف</button>
        </div>
      </div>

      {diagOpen && (
        <div className="bg-slate-900 text-slate-100 rounded-xl p-4 border border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-amber-400">نتيجة اختبار الدالة</h3>
            <button onClick={() => setDiagOpen(false)} className="text-slate-400 hover:text-white text-xs">إغلاق ✕</button>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-slate-200">{diagResult}</pre>
        </div>
      )}

      {showForm && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="الاسم" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary">
              <option value="admin">مدير</option><option value="employee">موظف</option><option value="accountant">محاسب</option><option value="salesman">مندوب مبيعات</option>
            </select>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary">
              <option value="active">نشط</option><option value="inactive">غير نشط</option>
            </select>
            <input placeholder="الهاتف" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
            <input placeholder="البريد الإلكتروني" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
            <input type="number" placeholder="الراتب" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} className="bg-muted rounded-lg px-4 py-2.5 text-sm text-foreground border border-border outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">{editId ? "تحديث" : "إضافة"}</button>
            <button onClick={() => setShowForm(false)} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </div>
      )}

      {accessFor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAccessFor(null)}>
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-lg shadow-2xl space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center gap-2"><ShieldCheck className="text-primary" /><h2 className="text-lg font-bold">صلاحيات دخول: {accessFor.name}</h2></div>
            <input placeholder="البريد الإلكتروني للدخول" value={accessForm.email} onChange={e => setAccessForm({ ...accessForm, email: e.target.value })} disabled={!!roleMap[accessFor.id]} className="w-full bg-muted rounded-lg px-4 py-2.5 text-sm border border-border outline-none focus:ring-2 focus:ring-primary disabled:opacity-60" />
            <input type="password" placeholder={roleMap[accessFor.id] ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : "كلمة المرور"} value={accessForm.password} onChange={e => setAccessForm({ ...accessForm, password: e.target.value })} className="w-full bg-muted rounded-lg px-4 py-2.5 text-sm border border-border outline-none focus:ring-2 focus:ring-primary" />
            <select value={accessForm.role} onChange={e => setAccessForm({ ...accessForm, role: e.target.value })} className="w-full bg-muted rounded-lg px-4 py-2.5 text-sm border border-border outline-none focus:ring-2 focus:ring-primary">
              <option value="sales">مبيعات (sales) — ينشئ ويعدّل ما أنشأه</option>
              <option value="viewer">قراءة فقط (viewer)</option>
              <option value="admin">مدير (كامل الصلاحيات)</option>
            </select>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">الصلاحيات التفصيلية</div>
              <div className="grid grid-cols-2 gap-2">
                {PERMS.map(p => (
                  <label key={p.key} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={!!accessForm.permissions[p.key]} onChange={e => setAccessForm({ ...accessForm, permissions: { ...accessForm.permissions, [p.key]: e.target.checked } })} />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={submitAccess} disabled={busy} className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{busy ? "..." : "حفظ"}</button>
              <button onClick={() => setAccessFor(null)} className="bg-muted text-muted-foreground px-6 py-2 rounded-lg text-sm">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      <div className="legacy-card card-block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 720, whiteSpace: "nowrap" }}>
            <thead><tr className="bg-muted">
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">#</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">الاسم</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">الدور</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">الهاتف</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">الحالة</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">الدخول</th>
              <th className="text-right px-3 py-3 font-semibold text-muted-foreground whitespace-nowrap">إجراءات</th>
            </tr></thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              : !(employees || []).length ? <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا يوجد موظفين</td></tr>
              : (employees || []).map((emp: any, i: number) => {
                const r = roleMap[emp.id];
                return (
                <tr key={emp.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-5 py-3 text-foreground font-medium">{emp.name}</td>
                  <td className="px-5 py-3 text-foreground">{roleLabels[emp.role] || emp.role}</td>
                  <td className="px-5 py-3 text-foreground">{emp.phone || "-"}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${emp.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {emp.status === "active" ? <UserCheck size={12} /> : <UserX size={12} />}
                      {emp.status === "active" ? "نشط" : "غير نشط"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {r ? <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">{r.role}</span> : <span className="text-xs text-muted-foreground">بدون</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openAccess(emp)} title="صلاحيات الدخول" className="p-1.5 text-primary hover:bg-primary/10 rounded"><KeyRound size={15} /></button>
                      {r && <button onClick={() => toggleLogin(emp)} title="تفعيل/تعطيل الدخول" disabled={busy} className="p-1.5 text-warning hover:bg-warning/10 rounded"><Power size={15} /></button>}
                      <button onClick={() => { setEditId(emp.id); setForm({ name: emp.name, role: emp.role, status: emp.status, phone: emp.phone || "", email: emp.email || "", salary: emp.salary || "", notes: emp.notes || "" }); setShowForm(true); }} className="p-1.5 text-warning hover:bg-warning/10 rounded"><Edit size={15} /></button>
                      <button onClick={async () => { if (!confirm("حذف؟")) return; try { if (r) await callFn({ action: "delete", user_id: r.user_id, employee_id: emp.id }); await remove.mutateAsync(emp.id); toast.success("تم"); loadRoles(); } catch (e: any) { toast.error(e.message); } }} className="p-1.5 text-destructive hover:bg-destructive/10 rounded"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
