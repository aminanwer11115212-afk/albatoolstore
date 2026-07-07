/**
 * Realtime cross-device sync.
 * أي INSERT/UPDATE/DELEETE من أي جهاز (متصفح، PWA على الهاتف، …)
 * تُطلق window events + invalidateQueries تلقائيًا عبر startRealtimeSync.
 * انظر src/lib/realtimeSync.ts للتفاصيل.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startRealtimeSync } from "@/lib/realtimeSync";

export default function RealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const stop = startRealtimeSync(qc);
    return stop;
  }, [qc]);
  return null;
}
