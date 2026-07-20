-- ============================================================================
-- تشخيص المخزون السالب — للقراءة فقط (لا يُعدّل أي بيانات)
-- شغّله في محرّر SQL في Supabase. لا يُوضع في مجلد migrations عمداً كي لا
-- يُطبَّق تلقائياً عند النشر.
--
-- الخلفية: منطق استرجاع المخزون عند حذف الفاتورة سليم (يُضيف كل بنود الفاتورة
-- مرة واحدة). لكن دالة apply_stock_delta لا تقصّ عند الصفر، أي أن البيع يُسمح
-- له بالنزول تحت الصفر. الأصناف السالبة غالباً نتيجة بيع كمية أكبر من المتاح،
-- لا خللاً في الحذف نفسه. هذا التشخيص يساعد على تحديد القيمة الصحيحة قبل أي
-- تصحيح بيانات (الذي يجب أن يُراجَع ويُنفَّذ يدوياً).
-- ============================================================================

-- 1) كل الأصناف ذات المخزون السالب حالياً
SELECT id, name, sku, stock_quantity, updated_at
FROM public.products
WHERE COALESCE(stock_quantity, 0) < 0
ORDER BY stock_quantity ASC;

-- 2) لكل صنف سالب: صافي حركة البيع/الشراء لإعادة بناء الرصيد المتوقّع
--    (مبيعات الفواتير الحالية − ما استُلم من أوامر الشراء).
WITH neg AS (
  SELECT id, name, stock_quantity
  FROM public.products
  WHERE COALESCE(stock_quantity, 0) < 0
),
sold AS (
  SELECT ii.product_id, COALESCE(SUM(ii.quantity), 0) AS qty_sold
  FROM public.invoice_items ii
  JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE ii.product_id IN (SELECT id FROM neg)
  GROUP BY ii.product_id
),
purchased AS (
  SELECT poi.product_id, COALESCE(SUM(poi.quantity), 0) AS qty_received
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.product_id IN (SELECT id FROM neg)
    AND po.stock_applied_at IS NOT NULL   -- المستلَمة فقط
  GROUP BY poi.product_id
)
SELECT
  n.name,
  n.stock_quantity                         AS current_stock,
  COALESCE(s.qty_sold, 0)                  AS qty_sold_current_invoices,
  COALESCE(p.qty_received, 0)              AS qty_received_purchases,
  COALESCE(p.qty_received, 0) - COALESCE(s.qty_sold, 0) AS expected_if_started_zero
FROM neg n
LEFT JOIN sold s ON s.product_id = n.id
LEFT JOIN purchased p ON p.product_id = n.id
ORDER BY n.stock_quantity ASC;

-- 3) الفواتير الحالية (غير المحذوفة) التي تبيع الأصناف السالبة — لمعرفة إن كانت
--    الكمية السالبة تعكس مبيعات قائمة فعلاً.
SELECT
  pr.name              AS product,
  i.invoice_number,
  i.date,
  i.status,
  i.source,
  ii.quantity
FROM public.invoice_items ii
JOIN public.invoices i  ON i.id = ii.invoice_id
JOIN public.products pr ON pr.id = ii.product_id
WHERE ii.product_id IN (
  SELECT id FROM public.products WHERE COALESCE(stock_quantity, 0) < 0
)
ORDER BY pr.name, i.date;

-- ملاحظة: بعد مراجعة النتائج، إن أردت تصفير صنف بعينه استخدم (بحذر، بعد التأكد):
--   UPDATE public.products SET stock_quantity = 0, updated_at = now()
--   WHERE id = '<product_id>';   -- ضع المعرّف الصحيح
-- ولا تُنفّذ أي UPDATE على الإنتاج قبل التأكد من القيمة المستهدفة.
