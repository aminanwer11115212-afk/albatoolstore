-- 1) تحديث الدالة لإزالة tax_rate قبل حذف العمود
CREATE OR REPLACE FUNCTION public.archive_deleted_invoice_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.deleted_invoice_items (
    original_id, invoice_id, product_id, product_name, quantity, unit_price,
    discount, discount_value, format_discount, foreign_price, unit, tax_status, total,
    full_data, deleted_by
  ) VALUES (
    OLD.id, OLD.invoice_id, OLD.product_id, OLD.product_name, OLD.quantity, OLD.unit_price,
    OLD.discount, OLD.discount_value, OLD.format_discount, OLD.foreign_price, OLD.unit, OLD.tax_status, OLD.total,
    to_jsonb(OLD), COALESCE(auth.uid()::text, 'system')
  );
  RETURN OLD;
END;
$function$;

-- 2) حذف الأعمدة من الجداول
ALTER TABLE public.products DROP COLUMN IF EXISTS tax_rate;
ALTER TABLE public.products DROP COLUMN IF EXISTS discount_rate;

ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS tax_rate;
ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS tax_rate;
ALTER TABLE public.purchase_order_items DROP COLUMN IF EXISTS tax_amount;

ALTER TABLE public.deleted_invoice_items DROP COLUMN IF EXISTS tax_rate;

ALTER TABLE public.company_settings DROP COLUMN IF EXISTS tax_rate;

ALTER TABLE public.invoices DROP COLUMN IF EXISTS tax_amount;
ALTER TABLE public.purchase_orders DROP COLUMN IF EXISTS tax_amount;
ALTER TABLE public.quotes DROP COLUMN IF EXISTS tax_amount;