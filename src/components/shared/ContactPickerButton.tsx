import { BookUser } from "lucide-react";
import { toast } from "sonner";
import { isContactPickerSupported, pickContactPhone } from "@/utils/phoneNormalize";

interface Props {
  onPicked: (data: { name?: string; tel?: string }) => void;
  title?: string;
  className?: string;
}

/**
 * زر صغير يفتح منتقي جهات الاتصال ويعيد الرقم مطبَّعاً.
 * يظهر فقط إن كان المتصفح يدعم navigator.contacts.select (Android/Chrome HTTPS).
 */
export default function ContactPickerButton({ onPicked, title = "استيراد من جهات الاتصال", className }: Props) {
  if (!isContactPickerSupported()) return null;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={async () => {
        try {
          const c = await pickContactPhone();
          if (c && (c.tel || c.name)) {
            onPicked(c);
            if (c.tel) toast.success(`تم استيراد: ${c.name || c.tel}`);
          }
        } catch (e: any) {
          toast.error(e?.message || "تعذّر فتح جهات الاتصال");
        }
      }}
      className={
        className ||
        "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
      }
    >
      <BookUser size={14} />
    </button>
  );
}
