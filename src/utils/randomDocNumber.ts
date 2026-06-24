import { supabase } from "@/integrations/supabase/client";

/**
 * مولّد أرقام مستندات افتراضية عشوائية لتفادي التكرار عند الحفظ.
 * - بدل التسلسل (N+1) الذي يصطدم كثيراً مع المستخدمين المتزامنين،
 *   نولّد رقماً عشوائياً 5 خانات (10000–99999) ضمن البادئة الممرّرة.
 * - نتحقق من القاعدة أنه غير مستخدم؛ إذا اصطدم نحاول مجدداً (حتى 20 مرة)
 *   ثم نتوسّع إلى 6 خانات لضمان النجاح.
 * - الأمان النهائي يبقى عبر UNIQUE constraint + حلقة retry في صفحة الحفظ.
 */

type Tbl = "invoices" | "quotes" | "purchase_orders" | "stock_returns";
type Col = "invoice_number" | "quote_number" | "order_number" | "return_number";

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function exists(
  table: Tbl,
  column: Col,
  value: string,
  extra?: (q: any) => any,
): Promise<boolean> {
  let q: any = (supabase as any).from(table).select(column).eq(column, value);
  if (extra) q = extra(q);
  q = q.limit(1);
  const { data } = await q;
  return !!(data && data.length);
}

export interface RandomNumberOpts {
  /** قيود إضافية على الاستعلام (مثل source=pos أو is_side=true). */
  scope?: (q: any) => any;
  /** عدد الخانات الأدنى (افتراضي 5 → 10000–99999). */
  digits?: number;
  /** عدد المحاولات قبل توسيع الخانات (افتراضي 20). */
  maxAttempts?: number;
}

export async function generateRandomDocNumber(
  table: Tbl,
  column: Col,
  prefix: string,
  opts: RandomNumberOpts = {},
): Promise<string> {
  const digits = Math.max(4, opts.digits ?? 5);
  const maxAttempts = opts.maxAttempts ?? 20;
  let d = digits;
  for (let round = 0; round < 3; round++) {
    const lo = Math.pow(10, d - 1);
    const hi = Math.pow(10, d) - 1;
    for (let i = 0; i < maxAttempts; i++) {
      const n = rand(lo, hi);
      const candidate = `${prefix}${n}`;
      // eslint-disable-next-line no-await-in-loop
      const taken = await exists(table, column, candidate, opts.scope);
      if (!taken) return candidate;
    }
    d++; // وسّع الخانات وحاول مجدداً
  }
  // fallback نهائي: timestamp + عشوائي
  return `${prefix}${Date.now().toString().slice(-6)}${rand(10, 99)}`;
}
