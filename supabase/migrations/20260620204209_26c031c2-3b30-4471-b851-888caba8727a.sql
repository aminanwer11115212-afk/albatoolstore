CREATE OR REPLACE FUNCTION public.decrement_product_stock(_product_id uuid, _qty numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products
     SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - COALESCE(_qty, 0)),
         updated_at = now()
   WHERE id = _product_id;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_product_stock(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_product_stock(uuid, numeric) TO service_role;