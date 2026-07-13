import { BookUser } from "lucide-react";
import { toast } from "sonner";
import { isContactPickerSupported, pickContactPhone } from "@/utils/phoneNormalize";

interface Props {
  onPicked: (data: { name?: string; tel?: string }) => void;
  title?: string;
  className?: string;
}

/**
 * زر يفتح منتقي جهات الاتصال في المتصفحات المدعومة (Android Chrome على HTTPS).
 * إن لم يكن مدعوماً: يظهر التوست مرة واحدة عند الضغط مع رسالة توجّه المستخدم
 * لنسخ الرقم يدوياً — لا يختفي الزر حتى لا يستغرب المستخدم غيابه.
 */
export default function ContactPickerButton({ onPicked, title = "استيراد من جهات الاتصال", className }: Props) {
  const supported = isContactPickerSupported();
  return (
    <button
      type="button"
      title={supported ? title : "غير مدعوم — انسخ الرقم من جهات الاتصال والصقه هنا"}
      aria-label={title}
      onClick={async () => {
        if (!supported) {
          toast.message("جهات الاتصال غير مدعومة هنا", {
            description: "افتح جهات الاتصال يدوياً، انسخ الرقم، ثم الصقه في الحقل. سيتم تنظيفه تلقائياً.",
          });
          return;
        }
        try {
          const c = await pickContactPhone();
          if (!c) return; // ألغى المستخدم
          if (!c.tel && !c.name) {
            toast.error("لم يتم اختيار أي رقم من جهة الاتصال");
            return;
          }
          onPicked(c);
          if (c.tel) toast.success(`تم استيراد: ${c.name || c.tel}`);
        } catch (e: any) {
          const msg = String(e?.message || e || "");
          const isPerm = /permission|denied|not allowed|user denied|dismiss/i.test(msg);
          toast.error(isPerm ? "تم رفض إذن جهات الاتصال" : "تعذّر فتح جهات الاتصال", {
            description: "يمكنك نسخ الرقم يدوياً من جهات الاتصال ولصقه في الحقل — سيُنظَّف تلقائياً.",
          });
        }
      }}
      className={
        className ||
        (supported
          ? "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          : "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-muted/20 text-muted-foreground/60 hover:bg-muted/40 shrink-0")
      }
    >
      <BookUser size={14} />
    </button>
  );
}
