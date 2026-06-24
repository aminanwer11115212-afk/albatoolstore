import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // .catch ضروري — لو فشل الاتصال يبقى loading=true إلى الأبد فيُجمَّد التطبيق.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch((err) => {
        console.error("[useAuth] getSession failed:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (e: any) {
      console.error("[useAuth] signOut failed:", e);
      toast.error("تعذّر تسجيل الخروج: " + (e?.message || "خطأ في الاتصال"));
      throw e;
    }
  };

  return { session, user, loading, signOut };
}
