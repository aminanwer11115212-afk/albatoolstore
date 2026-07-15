import { useMemo } from "react";
import { useCompanySettings } from "@/hooks/useData";

export type CreditConsumptionOrder = "fifo" | "lifo";

/**
 * قراءة إعداد أولوية استهلاك الرصيد الدائن من إعدادات الشركة.
 * الافتراضي: FIFO (الأقدم أولاً).
 */
export function useCreditConsumptionOrder(): CreditConsumptionOrder {
  const { data: settings } = useCompanySettings();
  return useMemo(() => {
    const raw = (settings as any)?.[0]?.credit_consumption_order;
    return raw === "lifo" ? "lifo" : "fifo";
  }, [settings]);
}

/**
 * تقسيم مبلغ رصيد دائن على قيود customer_credit الموجودة حسب الأولوية.
 * تُرجع مصفوفة { transaction_id, amount_to_consume } بحيث المجموع = المبلغ المطلوب.
 */
export interface CreditLot {
  id: string;
  amount: number; // موجب: رصيد متاح (بعد طرح الاستهلاك السابق)
  date: string;
}

export function allocateCreditConsumption(
  lots: CreditLot[],
  amountToConsume: number,
  order: CreditConsumptionOrder,
): { id: string; consume: number }[] {
  if (!lots.length || amountToConsume <= 0.01) return [];
  const sorted = [...lots].sort((a, b) => {
    const cmp = String(a.date).localeCompare(String(b.date));
    return order === "fifo" ? cmp : -cmp;
  });
  let remaining = amountToConsume;
  const result: { id: string; consume: number }[] = [];
  for (const lot of sorted) {
    if (remaining <= 0.01) break;
    if (lot.amount <= 0.01) continue;
    const take = Math.min(remaining, lot.amount);
    result.push({ id: lot.id, consume: take });
    remaining -= take;
  }
  return result;
}
