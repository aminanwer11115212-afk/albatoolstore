import { useEffect, useState } from "react";
import { getCurrencies, getLatestRate, type Currency } from "@/utils/currency";

/**
 * useDocumentCurrency — يدير قائمة العملات + الكود الحالي + سعر الصرف للأساس.
 * مستخرج من InvoiceCreatePage بدون تغيير سلوكي:
 *  - يحتفظ بنفس الأسماء الثلاثة للـ state.
 *  - watcher يحدّث `exchangeRateToBase` عند تغيّر `currencyCode` (نفس useEffect الأصلي).
 *  - `loadCurrencies(editId)` تُستدعى من effect التهيئة في الصفحة للحفاظ على ترتيب التنفيذ الأصلي.
 */
export function useDocumentCurrency() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyCode, setCurrencyCode] = useState("SDG");
  const [exchangeRateToBase, setExchangeRateToBase] = useState(1);

  useEffect(() => {
    if (!currencyCode) return;
    getLatestRate(currencyCode).then(setExchangeRateToBase);
  }, [currencyCode]);

  const loadCurrencies = (editId: string | null | undefined) => {
    getCurrencies().then((list) => {
      setCurrencies(list);
      const base = list.find((c) => c.is_base);
      if (base && !editId) setCurrencyCode(base.code);
    });
  };

  return {
    currencies,
    setCurrencies,
    currencyCode,
    setCurrencyCode,
    exchangeRateToBase,
    setExchangeRateToBase,
    loadCurrencies,
  };
}
