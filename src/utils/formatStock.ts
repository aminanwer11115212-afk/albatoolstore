/**
 * تنسيق موحّد لعرض كمية المخزون.
 * - يسمح بالسالب ويعرضه مع علامة "−" (ليس فقط تحويل toString).
 * - يُرجع className يعتمد على design tokens:
 *   - سالب  → text-destructive
 *   - صفر   → text-muted-foreground
 *   - موجب  → text-foreground
 */
export function formatStock(qty: number | null | undefined): {
  text: string;
  className: string;
  isNegative: boolean;
  isZero: boolean;
} {
  const n = Number(qty ?? 0);
  const isNegative = n < 0;
  const isZero = n === 0;
  const text = n.toLocaleString("en-US");
  const className = isNegative
    ? "text-destructive"
    : isZero
    ? "text-muted-foreground"
    : "text-foreground";
  return { text, className, isNegative, isZero };
}
