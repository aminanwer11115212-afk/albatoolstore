-- إعادة ترقيم عروض الأسعار الجانبية الحالية إلى QTS-0001..QTS-NNNN
-- مرتبة حسب تاريخ الإنشاء (الأقدم = QTS-0001).
-- لا تمسّ العروض العادية (is_side IS NULL OR is_side = false).
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.quotes
  WHERE is_side = true
)
UPDATE public.quotes q
SET quote_number = 'QTS-' || LPAD(o.rn::text, 4, '0')
FROM ordered o
WHERE q.id = o.id;