import { BookUser } from "lucide-react";
import { toast } from "sonner";
import { pickNativeContact } from "@/utils/phoneNormalize";

interface Props {
  onPicked: (data: { name?: string; tel?: string }) => void;
  title?: string;
  className?: string;
}

/**
 * زر استيراد جهة اتصال — يفتح منتقي جهات الاتصال الأصلي في الجهاز:
 *  - داخل تطبيق Capacitor على Android/iPhone: منتقي النظام الأصلي.
 *  - في متصفح Android الحديث على HTTPS: Contact Picker API الأصلي.
 *  - غير ذلك (Safari/Firefox/سطح المكتب): toast يشرح للمستخدم أن يثبّت تطبيق الجوّال.
 */
export default function ContactPickerButton({ onPicked, title = "استيراد جهة اتصال", className }: Props) {
  const handleClick = async () => {
    try {
      const c = await pickNativeContact();
      if (!c) return; // ألغى المستخدم
      if (!c.tel && !c.name) {
        toast.error("لم يتم اختيار أي بيانات");
        return;
      }
      onPicked(c);
      toast.success(`تم استيراد: ${c.name || c.tel}`);
    } catch (e: any) {
      const msg = String(e?.message || e || "تعذّر فتح جهات الاتصال");
      toast.error(msg);
    }
  };

  const btnCls =
    className ||
    "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0";

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={handleClick}
      className={btnCls}
    >
      <BookUser size={14} />
    </button>
  );
}
