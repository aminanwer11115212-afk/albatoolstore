import { useCallback, useEffect, useState } from "react";
import { userScopedLegacyKey } from "@/lib/userScopedKey";

/**
 * رؤية أقسام ورقة الطباعة الاختيارية — التواقيع ومعلومات الترحيل وتفاصيل
 * التغليف.
 *
 * ## لماذا تُحسم قبل التوليد لا بعده
 * شريط المعاينة يخفي الأقسام بـCSS بعد الرسم، وذلك يكفي لمن يعاين على شاشته.
 * لكن ورقةً تُشارَك مع العميل تخرج من مسارٍ آخر — PDF ورابط عام وطباعة
 * مباشرة — لا يمرّ بذلك الشريط. فلو بقي الإخفاء تنسيقاً وحده لخرج التوقيع
 * ومعلومات المرحّل إلى العميل رغم إخفائهما على الشاشة. لذا تُحذف الأقسام
 * **من الـHTML نفسه** عند التوليد، فيتطابق ما يراه المستخدم وما يصل العميل.
 *
 * المفتاح لكل مستخدم على حدة، والقيمة `true` تعني **مرئي**.
 */
export interface PrintSectionPrefs {
  signatures: boolean;
  transport: boolean;
  packaging: boolean;
}

export const DEFAULT_PRINT_SECTION_PREFS: PrintSectionPrefs = {
  signatures: true,
  transport: true,
  packaging: true,
};

/** أسماء عربية للأقسام — تُستعمل في الأزرار وفي التلميحات. */
export const PRINT_SECTION_LABELS: Record<keyof PrintSectionPrefs, string> = {
  signatures: "التواقيع",
  transport: "معلومات الترحيل",
  packaging: "تفاصيل التغليف",
};

const BASE_KEY = "__lov_print_sections__";

function storageKey(scope: string): string {
  return userScopedLegacyKey(`${BASE_KEY}${scope}`);
}

export function loadPrintSectionPrefs(scope: string): PrintSectionPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PRINT_SECTION_PREFS };
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(scope)) || "{}");
    return {
      signatures: raw.signatures !== false,
      transport: raw.transport !== false,
      packaging: raw.packaging !== false,
    };
  } catch {
    return { ...DEFAULT_PRINT_SECTION_PREFS };
  }
}

export function savePrintSectionPrefs(scope: string, prefs: PrintSectionPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(prefs));
  } catch {
    /* التخزين ممتلئ أو محظور — التفضيل يبقى في الذاكرة لهذه الجلسة */
  }
}

/** مفاتيح الأقسام المخفيّة — الشكل الذي يفهمه `generatePrintHTML`. */
export function hiddenSectionKeys(prefs: PrintSectionPrefs): string[] {
  return (Object.keys(prefs) as Array<keyof PrintSectionPrefs>).filter((k) => !prefs[k]);
}

/**
 * قراءة فورية للأقسام المخفيّة — لمسارات الطباعة التي لا تعيش داخل مكوّن
 * React (الطباعة المباشرة، توليد PDF، صفحة المعاينة).
 */
export function documentHiddenSections(scope: string): string[] {
  return hiddenSectionKeys(loadPrintSectionPrefs(scope));
}

/** حالة الرؤية + مبدّل لكل قسم، محفوظةً بين الجلسات. */
export function usePrintSectionPrefs(scope: string) {
  const [prefs, setPrefs] = useState<PrintSectionPrefs>(() => loadPrintSectionPrefs(scope));

  // مفتاح التخزين يحمل معرّف المستخدم، وهو يصل بعد أوّل رسم — أعد القراءة
  // حين يتغيّر النطاق حتى لا تعلق الشاشة على تفضيلات مستخدمٍ آخر.
  useEffect(() => {
    setPrefs(loadPrintSectionPrefs(scope));
  }, [scope]);

  const toggle = useCallback((key: keyof PrintSectionPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      savePrintSectionPrefs(scope, next);
      return next;
    });
  }, [scope]);

  return { prefs, toggle, hiddenSections: hiddenSectionKeys(prefs) };
}
