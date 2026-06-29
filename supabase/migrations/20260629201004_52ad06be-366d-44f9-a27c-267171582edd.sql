CREATE OR REPLACE FUNCTION public.apply_stock_delta(_product_id uuid, _delta numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products
     SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) + COALESCE(_delta, 0)),
         updated_at = now()
   WHERE id = _product_id;
$$;

GRANT EXECUTE ON FUNCTION public.apply_stock_delta(uuid, numeric) TO authenticated, service_role;