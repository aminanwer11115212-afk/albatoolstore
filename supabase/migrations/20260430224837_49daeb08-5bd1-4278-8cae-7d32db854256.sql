-- حذف السطر المكرر "استارتر 110" في الفاتورة c5afa8f6 (الكمية كانت تظهر 12 بدلاً من 6)
DELETE FROM public.invoice_items
WHERE id = 'b9038b3d-4d2b-411d-ba3b-89b90f014a7b';

-- إعادة حساب إجمالي الفاتورة
UPDATE public.invoices i
SET subtotal = COALESCE((SELECT SUM(quantity * unit_price) FROM public.invoice_items WHERE invoice_id = i.id), 0),
    total = COALESCE((SELECT SUM(total) FROM public.invoice_items WHERE invoice_id = i.id), 0)
WHERE id = 'c5afa8f6-9fe1-46ef-8a9d-b9fb3368d642';