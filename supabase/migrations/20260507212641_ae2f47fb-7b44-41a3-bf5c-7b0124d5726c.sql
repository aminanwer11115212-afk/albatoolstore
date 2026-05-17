
WITH empty AS (
  SELECT i.id FROM public.invoices i
  LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
  WHERE COALESCE(i.total,0) > 0
  GROUP BY i.id HAVING COUNT(ii.id) = 0
)
DELETE FROM public.invoices WHERE id IN (SELECT id FROM empty);

-- إعادة احتساب أرصدة كل العملاء للتأكد
SELECT public.recalc_all_customer_balances();
