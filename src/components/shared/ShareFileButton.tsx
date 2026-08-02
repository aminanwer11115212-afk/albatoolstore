import { useState } from "react";
import { Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { shareFileNative } from "@/utils/shareFileNative";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
  fileName: string;
  mimeType?: string | null;
  /** نص مرافق للرسالة */
  text?: string;
  title?: string;
  className?: string;
  size?: number;
}

/**
 * زر مشاركة موحّد لأي ملف مرفوع (إيصال، صورة، PDF…) — يفتح لوحة المشاركة
 * الأصلية في الجهاز (واتساب وغيرها) ويقع على واتساب عند غياب الدعم.
 */
export default function ShareFileButton({
  url, fileName, mimeType, text, title, className, size = 15,
}: Props) {
  const [busy, setBusy] = useState(false);

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    const tId = toast.loading("جاري تجهيز المشاركة...");
    try {
      const out = await shareFileNative({ url, fileName, mimeType, text, title });
      toast.dismiss(tId);
      if (out === "file") toast.success("تمت المشاركة");
      else if (out === "text") toast.success("تمت مشاركة الرابط");
      else if (out === "whatsapp") toast.message("فُتح واتساب بالرابط");
    } catch (e: any) {
      toast.dismiss(tId);
      toast.error(`تعذّرت المشاركة: ${e?.message || "خطأ غير معروف"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onShare}
      disabled={busy}
      className={cn("p-1.5 rounded hover:bg-primary/10 text-primary disabled:opacity-50", className)}
      title="مشاركة (واتساب وغيرها)"
      aria-label="مشاركة الملف"
    >
      {busy ? <Loader2 size={size} className="animate-spin" /> : <Share2 size={size} />}
    </button>
  );
}
