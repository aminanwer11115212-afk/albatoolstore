import { supabase } from "@/integrations/supabase/client";

/**
 * Duplicate-save guard — قاعدة موحّدة لكل مستندات النظام.
 * راجع mem://features/duplicate-save-guard قبل التعديل.
 *
 * ترجع { existingId, existingNumber } إذا وُجد مستند بنفس البصمة:
 *   party_id + date + توقيع البنود (product_id|quantity مرتَّبة).
 * في هذه الحالة الصفحة يجب أن تحوّل الحفظ إلى UPDATE لنفس السجل بدل INSERT.
 */

export type DuplicateGuardTable =
  | "invoices"
  | "quotes"
  | "purchase_orders"
  | "stock_returns";

type ItemLine = { product_id: string | null | undefined; quantity: number | string | null | undefined };

type Options = {
  table: DuplicateGuardTable;
  partyColumn: "customer_id" | "supplier_id";
  partyId: string | null | undefined;
  dateISO: string; // YYYY-MM-DD
  items: ItemLine[];
  excludeId?: string | null;
  withinHours?: number; // نافذة زمنية للبحث — افتراضي 24
};

type Match = { existingId: string; existingNumber: string } | null;

const ITEMS_TABLE: Record<DuplicateGuardTable, { table: string; fk: string; numberCol: string }> = {
  invoices:        { table: "invoice_items",         fk: "invoice_id",         numberCol: "invoice_number" },
  quotes:          { table: "quote_items",           fk: "quote_id",           numberCol: "quote_number"   },
  purchase_orders: { table: "purchase_order_items",  fk: "purchase_order_id",  numberCol: "order_number"   },
  stock_returns:   { table: "stock_return_items",    fk: "return_id",          numberCol: "return_number"  },
};

function itemSignature(items: ItemLine[]): string {
  return items
    .filter((r) => r.product_id)
    .map((r) => `${r.product_id}|${Number(r.quantity || 0)}`)
    .sort()
    .join(",");
}

export async function guardAgainstDuplicateSave(opts: Options): Promise<Match> {
  const { table, partyColumn, partyId, dateISO, items, excludeId, withinHours = 24 } = opts;
  if (!partyId || !dateISO) return null;
  const targetSig = itemSignature(items);
  if (!targetSig) return null;

  const cfg = ITEMS_TABLE[table];
  const sinceISO = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();

  // Candidate parents: نفس الطرف + نفس التاريخ + ضمن النافذة الزمنية
  const parentQuery = (supabase as any)
    .from(table)
    .select(`id, ${cfg.numberCol}, created_at`)
    .eq(partyColumn, partyId)
    .eq("date", dateISO)
    .gte("created_at", sinceISO)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: parents, error } = await parentQuery;
  if (error || !Array.isArray(parents) || parents.length === 0) return null;

  const candidateIds = parents
    .map((p: any) => p.id as string)
    .filter((id: string) => id !== excludeId);
  if (candidateIds.length === 0) return null;

  const { data: allItems, error: itemsErr } = await (supabase as any)
    .from(cfg.table)
    .select(`${cfg.fk}, product_id, quantity`)
    .in(cfg.fk, candidateIds);
  if (itemsErr || !Array.isArray(allItems)) return null;

  const byParent = new Map<string, ItemLine[]>();
  for (const it of allItems as any[]) {
    const pid = it[cfg.fk] as string;
    const arr = byParent.get(pid) || [];
    arr.push({ product_id: it.product_id, quantity: it.quantity });
    byParent.set(pid, arr);
  }

  for (const parent of parents as any[]) {
    if (parent.id === excludeId) continue;
    const sig = itemSignature(byParent.get(parent.id) || []);
    if (sig && sig === targetSig) {
      return { existingId: parent.id, existingNumber: String(parent[cfg.numberCol] || "") };
    }
  }
  return null;
}
