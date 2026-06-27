import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startRealtimeSync } from "@/lib/realtimeSync";
import { useAuth } from "@/hooks/useAuth";

/**
 * مكوّن صامت — يفتح اشتراكات Realtime مرة واحدة بعد تسجيل دخول المستخدم،
 * ويُغلقها عند خروجه أو عند unmount.
 * يُركَّب داخل QueryClientProvider في App.tsx.
 */
export default function RealtimeSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const stop = startRealtimeSync(queryClient);
    return stop;
  }, [user, queryClient]);

  return null;
}
