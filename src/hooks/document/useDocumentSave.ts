import { useRef, useState } from "react";

/**
 * useDocumentSave — حالات الحفظ المشتركة لصفحات إنشاء المستندات.
 * استخراج بدون أي تغيير سلوكي من InvoiceCreatePage.
 * نفس الأسماء، نفس القيم الابتدائية، نفس الترتيب.
 */
export function useDocumentSave() {
  const savedRef = useRef(false);
  const lastSavedIdRef = useRef<string | null>(null);
  // معرّف الفاتورة بعد أول حفظ في وضع الإنشاء — يُستخدم لتركيب الحوارات (المستندات/التغليف/الترحيل)
  // لأن window.history.replaceState لا يُحدِّث useParams.
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | null>(null);
  const isSavingRef = useRef(false);
  // بصمة بنود الفاتورة كما حُمِّلت من قاعدة البيانات؛ تُستخدم لتخطّي إعادة كتابة البنود وعمليات المخزون إن لم تتغيّر
  const originalItemsHashRef = useRef<string | null>(null);

  return {
    savedRef,
    lastSavedIdRef,
    savedInvoiceId, setSavedInvoiceId,
    isSavingRef,
    originalItemsHashRef,
  };
}
