/**
 * Uniform toast for signalling that a customer/supplier balance was
 * refreshed after a payment/discount/charge. Uses `netBalanceOf` so the
 * displayed number always matches every other page.
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { netBalanceOf } from "@/utils/balanceDisplay";

function labelFor(net: number): { label: string; amount: number } {
  if (net > 0.01) return { label: "عليه", amount: net };
  if (net < -0.01) return { label: "له", amount: -net };
  return { label: "مسوّى", amount: 0 };
}

export async function refetchAndToastCustomerBalance(
  customerId: string | null | undefined,
  opts?: { previousNet?: number | null; prefix?: string; toastId?: string },
) {
  if (!customerId) return;
  const { data } = await (supabase as any)
    .from("customers")
    .select("balance, credit_balance, net_balance, name")
    .eq("id", customerId)
    .maybeSingle();
  if (!data) return;
  const net = netBalanceOf(data);
  const { label, amount } = labelFor(net);
  const prev = opts?.previousNet;
  const delta =
    prev !== null && prev !== undefined && !Number.isNaN(Number(prev)) ? net - Number(prev) : null;
  const deltaText =
    delta !== null && Math.abs(delta) > 0.01
      ? ` (${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()})`
      : "";
  const prefix = opts?.prefix ?? "تم تحديث رصيد العميل";
  toast.success(`${prefix}: ${label} ${amount.toLocaleString()}${deltaText}`, {
    id: opts?.toastId ?? `bal-toast-${customerId}`,
  });
}

export async function refetchAndToastSupplierBalance(
  supplierId: string | null | undefined,
  opts?: { previousBalance?: number | null; toastId?: string },
) {
  if (!supplierId) return;
  const { data } = await (supabase as any)
    .from("suppliers")
    .select("balance, name")
    .eq("id", supplierId)
    .maybeSingle();
  if (!data) return;
  const bal = Number(data.balance || 0);
  const prev = opts?.previousBalance;
  const delta =
    prev !== null && prev !== undefined && !Number.isNaN(Number(prev)) ? bal - Number(prev) : null;
  const deltaText =
    delta !== null && Math.abs(delta) > 0.01
      ? ` (${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()})`
      : "";
  toast.success(`تم تحديث رصيد المورد: ${bal.toLocaleString()}${deltaText}`, {
    id: opts?.toastId ?? `bal-sup-${supplierId}`,
  });
}
