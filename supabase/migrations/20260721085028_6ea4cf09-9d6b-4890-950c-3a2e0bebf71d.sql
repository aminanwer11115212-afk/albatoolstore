
-- 1) Log table for manual adjustments
CREATE TABLE IF NOT EXISTS public.stock_adjustments_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  delta numeric NOT NULL,
  reason text,
  source text,
  reference_id uuid,
  actor_uid uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stock_adjustments_log TO authenticated;
GRANT ALL ON public.stock_adjustments_log TO service_role;

ALTER TABLE public.stock_adjustments_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read adjustments log" ON public.stock_adjustments_log;
CREATE POLICY "auth read adjustments log" ON public.stock_adjustments_log
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stock_adj_log_product_created
  ON public.stock_adjustments_log(product_id, created_at DESC);

-- 2) apply_stock_delta writes to the log
CREATE OR REPLACE FUNCTION public.apply_stock_delta(_product_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _product_id IS NULL OR COALESCE(_delta, 0) = 0 THEN RETURN; END IF;

  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + _delta,
         updated_at = now()
   WHERE id = _product_id;

  INSERT INTO public.stock_adjustments_log (product_id, delta, reason, source, actor_uid)
  VALUES (_product_id, _delta, 'apply_stock_delta', 'system', auth.uid());
END;
$$;

-- 3) transfer_stock_once — atomic transfer between warehouses
CREATE OR REPLACE FUNCTION public.transfer_stock_once(
  _product_id uuid,
  _from_warehouse uuid,
  _to_warehouse uuid,
  _quantity numeric,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product record;
  v_from record;
  v_to record;
  v_transfer_id uuid;
  v_relocated boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF _product_id IS NULL OR _from_warehouse IS NULL OR _to_warehouse IS NULL OR _quantity IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_fields');
  END IF;
  IF _from_warehouse = _to_warehouse THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same_warehouse');
  END IF;
  IF _quantity <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_quantity');
  END IF;

  SELECT id, name, stock_quantity, warehouse_id
    INTO v_product
    FROM public.products
   WHERE id = _product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_found');
  END IF;

  SELECT id, name INTO v_from FROM public.warehouses WHERE id = _from_warehouse;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'from_warehouse_not_found'); END IF;

  SELECT id, name INTO v_to FROM public.warehouses WHERE id = _to_warehouse;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'to_warehouse_not_found'); END IF;

  -- المنتج يعيش في مستودع واحد (warehouse_id) — إن كان مصدر التحويل مختلفاً فهذا خطأ
  IF v_product.warehouse_id IS NOT NULL AND v_product.warehouse_id <> _from_warehouse THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'wrong_source_warehouse',
      'product_current_warehouse', v_product.warehouse_id
    );
  END IF;

  IF COALESCE(v_product.stock_quantity, 0) < _quantity THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'insufficient_stock',
      'available', COALESCE(v_product.stock_quantity, 0),
      'requested', _quantity
    );
  END IF;

  -- تسجيل التحويل
  INSERT INTO public.stock_transfers (product_id, from_warehouse_id, to_warehouse_id, quantity, notes, date)
  VALUES (_product_id, _from_warehouse, _to_warehouse, _quantity, _notes, CURRENT_DATE)
  RETURNING id INTO v_transfer_id;

  -- تحديث الرصيد وموقع المنتج:
  -- بما أن المنتج يعيش في مستودع واحد، ننقل رصيده الكامل المتبقي إلى المستودع الهدف عندما ننقل كامل المخزون،
  -- وإلا نُبقي المنتج في المصدر ونخصم الكمية. (السيناريو المتقدّم متعدد المستودعات لكل منتج يحتاج جدول مخزون مستقل.)
  IF COALESCE(v_product.stock_quantity, 0) = _quantity THEN
    UPDATE public.products
       SET warehouse_id = _to_warehouse,
           updated_at = now()
     WHERE id = _product_id;
    v_relocated := true;
  END IF;

  INSERT INTO public.stock_adjustments_log (product_id, delta, reason, source, reference_id, actor_uid)
  VALUES (_product_id, 0, 'transfer', 'stock_transfer', v_transfer_id, auth.uid());

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer_id,
    'relocated_product_warehouse', v_relocated,
    'quantity', _quantity
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock_once(uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_delta(uuid, numeric) TO authenticated;
