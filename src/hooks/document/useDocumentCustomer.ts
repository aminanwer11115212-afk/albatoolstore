import { useEffect, useRef, useState } from "react";
import type { Customer } from "@/utils/invoiceCreateHelpers";

/**
 * Hook موحّد لإدارة حالة العميل في صفحات إنشاء المستندات
 * (فاتورة، عرض سعر، مرتجع...). نفس أسماء useState الأصلية لضمان صفر تغيير سلوكي.
 *
 * يحتوي:
 * - customer / setCustomer        : العميل المختار
 * - customerSearch / setCustomerSearch : نص البحث في حقل العميل
 * - showCustomerSugg / setShowCustomerSugg : إظهار الاقتراحات
 * - customerBalances / setCustomerBalances : رصيد الدين/الائتمان للعميل المختار
 * - selectedCustomerIdRef         : ref مزامن مع customer?.id (لاستخدامه داخل listeners)
 */
export function useDocumentCustomer() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSugg, setShowCustomerSugg] = useState(false);
  const [customerBalances, setCustomerBalances] = useState<{ debt: number; credit: number; net?: number } | null>(null);

  const selectedCustomerIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedCustomerIdRef.current = customer?.id || null;
  }, [customer]);

  return {
    customer,
    setCustomer,
    customerSearch,
    setCustomerSearch,
    showCustomerSugg,
    setShowCustomerSugg,
    customerBalances,
    setCustomerBalances,
    selectedCustomerIdRef,
  };
}
