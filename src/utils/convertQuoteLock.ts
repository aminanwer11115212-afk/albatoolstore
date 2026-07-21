// Module-level lock preventing concurrent quote→invoice conversions
// for the same quote id across any page/component. Combined with
// per-quote UI `disabled` state this closes the double-click race
// where two conversions could pass the pre-write idempotency check.

const inflight = new Map<string, Promise<any>>();

export function isConvertingQuote(quoteId: string): boolean {
  return inflight.has(quoteId);
}

export async function withQuoteConvertLock<T>(
  quoteId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(quoteId);
  if (existing) {
    // Reuse the in-flight promise so parallel callers resolve to
    // the same result instead of triggering a second conversion.
    return existing as Promise<T>;
  }
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inflight.delete(quoteId);
    }
  })();
  inflight.set(quoteId, p);
  return p;
}
