import { supabase } from "@/integrations/supabase/client";

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  is_base: boolean;
  is_active: boolean;
  decimal_places: number;
}

export async function getCurrencies(): Promise<Currency[]> {
  const { data } = await (supabase as any).from("currencies").select("*").eq("is_active", true).order("is_base", { ascending: false });
  return data || [];
}

export async function getBaseCurrency(): Promise<Currency | null> {
  const { data } = await (supabase as any).from("currencies").select("*").eq("is_base", true).maybeSingle();
  return data || null;
}

export async function getLatestRate(currencyCode: string): Promise<number> {
  if (!currencyCode) return 1;
  const base = await getBaseCurrency();
  if (base && currencyCode === base.code) return 1;
  const { data } = await (supabase as any)
    .from("exchange_rates")
    .select("rate_to_base")
    .eq("currency_code", currencyCode)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.rate_to_base || 1);
}

export function convertToBase(amount: number, rate: number): number {
  return Number(amount) * Number(rate || 1);
}

export function formatCurrency(amount: number, symbol: string = "", decimals = 2): string {
  return `${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol}`.trim();
}
