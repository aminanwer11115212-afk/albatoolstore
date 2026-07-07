import { useEffect, useState } from "react";
import { subscribeQueue, type QueuedItem } from "@/lib/offlineQueue";

/**
 * useOnlineStatus — يتابع حالة الاتصال + طابور العمليات المؤجلة.
 * يعتمد على window.online/offline events + subscribeQueue من offlineQueue.
 */
export function useOnlineStatus() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [pending, setPending] = useState<QueuedItem[]>([]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = subscribeQueue((items) => setPending(items));
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unsub();
    };
  }, []);

  return { online, pending, pendingCount: pending.length };
}
