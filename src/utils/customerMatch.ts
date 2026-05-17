import { supabase } from "@/integrations/supabase/client";

/**
 * تطبيع اسم العميل لمنع التكرار:
 * - trim
 * - توحيد المسافات (أي تكرار → مسافة واحدة)
 * - تحويل لأحرف صغيرة
 * - إزالة التشكيل العربي
 * - توحيد بعض الحروف العربية المتشابهة (أ/إ/آ → ا، ى → ي، ة → ه)
 */
export function normalizeCustomerName(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/\s+/g, " ");
  // إزالة التشكيل
  s = s.replace(/[\u064B-\u0652\u0670]/g, "");
  // توحيد الألف
  s = s.replace(/[\u0623\u0625\u0622]/g, "\u0627");
  // ى → ي
  s = s.replace(/\u0649/g, "\u064A");
  // ة → ه
  s = s.replace(/\u0629/g, "\u0647");
  return s;
}

/** يبحث عن أقرب عميل موجود بالاسم بعد التطبيع. يُرجع السجل أو null. */
export async function findExistingCustomerByName(rawName: string): Promise<any | null> {
  const target = normalizeCustomerName(rawName);
  if (!target) return null;

  // 1) محاولة سريعة بـ ilike على الاسم الخام (trimmed)
  const trimmed = rawName.trim();
  const { data: quick } = await supabase
    .from("customers")
    .select("*")
    .ilike("name", trimmed)
    .limit(5);
  if (quick && quick.length) {
    const exact = quick.find((c: any) => normalizeCustomerName(c.name) === target);
    if (exact) return exact;
  }

  // 2) بحث أوسع: جرّب كل الأشكال البديلة لأول حرف عربي (أ/إ/آ/ا، ى/ي، ة/ه)
  const firstToken = target.split(" ")[0];
  if (firstToken && firstToken.length >= 2) {
    const variants = expandArabicFirstChar(firstToken);
    const orExpr = variants.map((v) => `name.ilike.%${v}%`).join(",");
    const { data: wider } = await (supabase
      .from("customers") as any)
      .select("*")
      .or(orExpr)
      .limit(100);
    const match = (wider || []).find(
      (c: any) => normalizeCustomerName(c.name) === target
    );
    if (match) return match;
  }
  return null;
}

/** يولّد أشكالاً بديلة للحرف الأول لتغطية الهمزة وأخواتها في بحث ilike. */
function expandArabicFirstChar(token: string): string[] {
  const first = token[0];
  const rest = token.slice(1);
  const map: Record<string, string[]> = {
    "\u0627": ["\u0627", "\u0623", "\u0625", "\u0622"],
    "\u064A": ["\u064A", "\u0649"],
    "\u0647": ["\u0647", "\u0629"],
  };
  const firsts = map[first] || [first];
  return firsts.map((f) => f + rest);
}
