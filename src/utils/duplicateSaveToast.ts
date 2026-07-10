import { toast } from "sonner";
import { guardAgainstDuplicateSave, type DuplicateGuardTable } from "@/utils/duplicateDocGuard";

/**
 * Wrapper موحّد لاستدعاء duplicate-save guard مع toast موحّد.
 * راجع mem://features/duplicate-save-guard.
 *
 * الاستخدام (نمط واحد لكل صفحات المستندات):
 *
 *   const dup = await checkDuplicateBeforeInsert({
 *     table: "invoices", partyColumn: "customer_id",
 *     partyId, dateISO, items, excludeId,
 *     docLabel: "الفاتورة",
 *   });
 *   if (dup) { effectiveEditId = dup.existingId; effectiveNumber = dup.existingNumber; }
 */
export async function checkDuplicateBeforeInsert(opts: {
  table: DuplicateGuardTable;
  partyColumn: "customer_id" | "supplier_id";
  partyId: string | null | undefined;
  dateISO: string;
  items: Array<{ product_id: string | null | undefined; quantity: number | string | null | undefined }>;
  excludeId?: string | null;
  withinHours?: number;
  docLabel?: string; // "الفاتورة" / "عرض السعر" / "أمر الشراء" / "المرتجع"
}): Promise<{ existingId: string; existingNumber: string } | null> {
  const dup = await guardAgainstDuplicateSave({
    table: opts.table,
    partyColumn: opts.partyColumn,
    partyId: opts.partyId,
    dateISO: opts.dateISO,
    items: opts.items,
    excludeId: opts.excludeId ?? null,
    withinHours: opts.withinHours,
  });
  if (dup?.existingId) {
    const label = opts.docLabel || "المستند";
    toast.info(`تم تحديث ${label} ${dup.existingNumber} بدل إنشاء مكرَّر`, {
      id: `dup-guard:${opts.table}:${dup.existingId}`,
      duration: 4000,
    });
  }
  return dup;
}
