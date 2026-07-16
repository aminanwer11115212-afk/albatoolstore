import { useRef, useState } from "react";
import { BookUser, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { isContactPickerSupported, pickContactPhone } from "@/utils/phoneNormalize";
import { parseContactsFile, type ParsedContact } from "@/utils/contactFileParser";

interface Props {
  onPicked: (data: { name?: string; tel?: string }) => void;
  title?: string;
  className?: string;
}

/**
 * زر استيراد جهات اتصال متعدد الطبقات:
 * 1) على أندرويد Chrome/Edge/Samsung Internet + HTTPS: يستخدم Contact Picker الأصلي.
 * 2) على iPhone/iPad/Firefox/الديسكتوب: يفتح رفع ملف .vcf أو .csv (يعمل مع كل الأجهزة).
 * 3) إن كان الملف يحتوي أكثر من جهة اتصال، يعرض قائمة للاختيار.
 */
export default function ContactPickerButton({ onPicked, title = "استيراد من جهات الاتصال", className }: Props) {
  const supported = isContactPickerSupported();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerList, setPickerList] = useState<ParsedContact[] | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");

  const openFilePicker = () => fileRef.current?.click();

  const handleClick = async () => {
    if (supported) {
      try {
        const c = await pickContactPhone();
        if (!c) return;
        if (!c.tel && !c.name) { toast.error("لم يتم اختيار أي رقم"); return; }
        onPicked(c);
        if (c.tel) toast.success(`تم استيراد: ${c.name || c.tel}`);
        return;
      } catch (e: any) {
        const msg = String(e?.message || e || "");
        const isPerm = /permission|denied|not allowed|user denied|dismiss/i.test(msg);
        toast.error(isPerm ? "تم رفض إذن جهات الاتصال" : "تعذّر فتح جهات الاتصال", {
          description: "جاري فتح رفع ملف vCard/CSV بدل ذلك.",
        });
        // انتقل تلقائياً لخيار الملف
        openFilePicker();
        return;
      }
    }
    // غير مدعوم أصلاً — افتح الرفع مباشرة
    openFilePicker();
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    try {
      const contacts = await parseContactsFile(f);
      if (contacts.length === 0) {
        toast.error("لم يُعثر على أي جهة اتصال في الملف", {
          description: "تأكّد من أن الملف .vcf أو .csv يحتوي أرقاماً صحيحة.",
        });
        return;
      }
      if (contacts.length === 1) {
        onPicked(contacts[0]);
        toast.success(`تم استيراد: ${contacts[0].name || contacts[0].tel}`);
        return;
      }
      setPickerList(contacts);
      setPickerQuery("");
    } catch (e: any) {
      toast.error("تعذّر قراءة الملف", { description: String(e?.message || e) });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const filteredList = pickerList
    ? pickerList.filter(c => {
        if (!pickerQuery.trim()) return true;
        const q = pickerQuery.trim().toLowerCase();
        return (c.name || "").toLowerCase().includes(q) || (c.tel || "").includes(q);
      })
    : [];

  const btnCls =
    className ||
    "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0";

  return (
    <>
      <button
        type="button"
        title={supported ? title : "اختر ملف vCard/CSV — يعمل على iPhone و Android والحاسوب"}
        aria-label={title}
        onClick={handleClick}
        className={btnCls}
      >
        <BookUser size={14} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />

      {pickerList && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="اختر جهة الاتصال"
          className="fixed inset-0 z-[1000] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setPickerList(null); }}
        >
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <div className="text-sm font-bold">اختر جهة اتصال ({pickerList.length})</div>
              <button
                type="button"
                onClick={() => setPickerList(null)}
                className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                aria-label="إغلاق"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-3 border-b border-border">
              <input
                type="text"
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الرقم…"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex-1 overflow-auto">
              {filteredList.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-8">لا نتائج مطابقة</div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredList.map((c, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => {
                          onPicked(c);
                          toast.success(`تم استيراد: ${c.name || c.tel}`);
                          setPickerList(null);
                        }}
                        className="w-full text-right px-4 py-2.5 hover:bg-accent flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{c.name || "بدون اسم"}</div>
                          <div className="text-xs text-muted-foreground truncate" dir="ltr">{c.tel || "—"}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-2 border-t border-border flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={openFilePicker}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Upload size={12} /> اختيار ملف آخر
              </button>
              <span className="text-[10px] text-muted-foreground">iPhone: مشاركة جهة اتصال → حفظ في الملفات</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
