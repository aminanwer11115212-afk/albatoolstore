import { useEffect, useState, useRef } from "react";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

interface PresenceUser {
  user_id: string;
  email: string;
  name: string;
  online_at: string;
}

/**
 * مؤشر "العين 👁️" يعرض عدد المستخدمين المتصلين حالياً بالنظام
 * عبر Supabase Realtime Presence. يفتح قائمة بأسمائهم عند النقر.
 */
export default function OnlineUsersIndicator() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let displayName = user.email?.split("@")[0] || "مستخدم";

    // محاولة جلب اسم الموظف لعرضه بدل البريد
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("employees")
          .select("name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled && data?.name) displayName = data.name;
      } catch { /* ignore */ }

      const channel = supabase.channel("online-users", {
        config: { presence: { key: user.id } },
      });

      const sync = () => {
        const state = channel.presenceState<PresenceUser>();
        const list: PresenceUser[] = [];
        const seen = new Set<string>();
        Object.values(state).forEach((arr) => {
          (arr as any[]).forEach((p) => {
            if (!seen.has(p.user_id)) {
              seen.add(p.user_id);
              list.push(p);
            }
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name, "ar"));
        if (!cancelled) setUsers(list);
      };

      channel
        .on("presence", { event: "sync" }, sync)
        .on("presence", { event: "join" }, sync)
        .on("presence", { event: "leave" }, sync)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({
              user_id: user.id,
              email: user.email || "",
              name: displayName,
              online_at: new Date().toISOString(),
            });
          }
        });

      // cleanup يُسجّل في scope الخارجي
      (window as any).__onlineUsersChannel = channel;
    })();

    return () => {
      cancelled = true;
      const ch = (window as any).__onlineUsersChannel;
      if (ch) {
        try { supabase.removeChannel(ch); } catch { /* ignore */ }
        (window as any).__onlineUsersChannel = null;
      }
    };
  }, [user?.id, user?.email]);

  // إغلاق عند النقر خارجاً
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user || !isAdmin) return null;
  const count = users.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 hover:bg-primary/20 rounded-md transition-colors flex items-center gap-1"
        title={`المستخدمون المتصلون الآن: ${count}`}
      >
        <Eye size={15} className="text-emerald-400" />
        <span className="text-[11px] font-bold leading-none">{count}</span>
        <span className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-emerald-500 rounded-full ring-2 ring-background animate-pulse" />
      </button>

      {open && (
        <div className="absolute left-0 top-12 bg-card border border-border rounded-xl shadow-2xl w-64 z-50 animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm text-foreground">المتصلون الآن</h3>
            <span className="text-xs text-muted-foreground">{count}</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {users.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                لا يوجد مستخدمون متصلون
              </div>
            ) : (
              users.map((u) => {
                const isMe = u.user_id === user.id;
                return (
                  <div
                    key={u.user_id}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-muted/40 border-b border-border last:border-b-0"
                  >
                    <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {u.name}{isMe && <span className="text-[10px] text-primary mr-1">(أنا)</span>}
                      </div>
                      {u.email && (
                        <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
