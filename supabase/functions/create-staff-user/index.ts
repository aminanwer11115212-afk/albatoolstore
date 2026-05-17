import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admins only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { action } = body;

    if (action === "ping") {
      return new Response(JSON.stringify({ ok: true, pong: true, user_id: user.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create") {
      const { email, password, employee_id, role, permissions } = body;
      if (!email || !password || !role) {
        return new Response(JSON.stringify({ error: "email, password, role required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (cErr) throw cErr;
      const newUid = created.user!.id;

      const { error: rErr } = await admin.from("user_roles").insert({
        user_id: newUid, role, employee_id: employee_id || null, permissions: permissions || {},
      });
      if (rErr) throw rErr;

      if (employee_id) {
        await admin.from("employees").update({ user_id: newUid, login_enabled: true, email }).eq("id", employee_id);
      }
      return new Response(JSON.stringify({ ok: true, user_id: newUid }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "reset_password") {
      const { user_id, password } = body;
      if (!user_id || !password) return new Response(JSON.stringify({ error: "user_id, password required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { error } = await admin.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "toggle_login") {
      const { employee_id, enabled } = body;
      const { data: emp } = await admin.from("employees").select("user_id").eq("id", employee_id).maybeSingle();
      if (emp?.user_id) {
        await admin.auth.admin.updateUserById(emp.user_id, { ban_duration: enabled ? "none" : "876000h" });
      }
      await admin.from("employees").update({ login_enabled: enabled }).eq("id", employee_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update_role") {
      const { user_id, role, permissions } = body;
      const { error } = await admin.from("user_roles").update({ role, permissions: permissions || {} }).eq("user_id", user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const { user_id, employee_id } = body;
      if (employee_id) await admin.from("employees").update({ user_id: null, login_enabled: false }).eq("id", employee_id);
      if (user_id) await admin.auth.admin.deleteUser(user_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
