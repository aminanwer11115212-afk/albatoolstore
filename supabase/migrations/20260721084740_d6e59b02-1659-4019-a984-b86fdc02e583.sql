
-- 1) جدول تسجيل التعديلات اليدوية على المخزون
CREATE TABLE IF NOT EXISTS public.stock_adjustments_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  delta numeric NOT NULL,
  before_qty numeric,
  after_qty numeric,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  reference_id text,
  actor_uid uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_adjustments_log TO authenticated;
GRANT ALL ON public.stock_adjustments_log TO service_role;

ALTER TABLE public.stock_adjustments_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_adjustments_log_authenticated_read"
  ON public.stock_adjustments_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "stock_adjustments_log_authenticated_insert"
  ON public.stock_adjustments_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stock_adj_product ON public.stock_adjustments_log(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_created ON public.stock_adjustments_log(created_at DESC);

-- 2) دالة تسجيل تعديل مخزون يدوي (تحدّث الكمية وتسجّل الحركة ذرّياً)
CREATE OR REPLACE FUNCTION public.apply_stock_delta_logged(
  _product_id uuid,
  _delta numeric,
  _reason text DEFAULT NULL,
  _source text DEFAULT 'manual',
  _reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_before numeric;
  v_after  numeric;
  v_uid    uuid := auth.uid();
BEGIN
  IF _product_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_product');
  END IF;
  IF _delta IS NULL OR _delta = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'zero_delta');
  END IF;

  SELECT COALESCE(stock_quantity, 0) INTO v_before
    FROM public.products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_found');
  END IF;

  v_after := v_before + _delta;

  UPDATE public.products
     SET stock_quantity = v_after, updated_at = now()
   WHERE id = _product_id;

  INSERT INTO public.stock_adjustments_log
    (product_id, delta, before_qty, after_qty, reason, source, reference_id, actor_uid)
  VALUES
    (_product_id, _delta, v_before, v_after, _reason, COALESCE(_source, 'manual'), _reference_id, v_uid);

  RETURN jsonb_build_object(
    'ok', true,
    'product_id', _product_id,
    'before', v_before,
    'after', v_after,
    'delta', _delta
  );
END;
$$;

-- 3) دالة تحويل المخزون الذرّية بين مستودعين
--    ملاحظة تصميمية: البنية الحالية تخزّن `warehouse_id` وحيداً لكل منتج مع `stock_quantity`
--    مجمّعة (بدون فصل لكل مستودع). لذلك التحويل هنا يعمل كسجل انتقال:
--      - يفحص أن المنتج موجود وأن كميته الحالية تكفي الكمية المطلوبة
--      - يفحص أن الحقل `warehouse_id` = from_warehouse (إن كان مضبوطاً)
--      - يُدرج سجل التحويل (idempotent عبر _transfer_id عند توفّره)
--      - إذا كانت الكمية = كامل المخزون → يُحوّل `warehouse_id` إلى to_warehouse
CREATE OR REPLACE FUNCTION public.transfer_stock_once(
  _product_id uuid,
  _from_warehouse uuid,
  _to_warehouse uuid,
  _quantity integer,
  _notes text DEFAULT NULL,
  _transfer_id uuid DEFAULT NULL,
  _date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prod record;
  v_new_id uuid;
  v_relocated boolean := false;
BEGIN
  IF _product_id IS NULL OR _from_warehouse IS NULL OR _to_warehouse IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_fields');
  END IF;
  IF _from_warehouse = _to_warehouse THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same_warehouse');
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_quantity');
  END IF;

  -- Idempotency: إذا مُرّر معرّف تحويل موجود مسبقاً — أعِد نتيجته دون إعادة تنفيذ
  IF _transfer_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.stock_transfers WHERE id = _transfer_id) THEN
      RETURN jsonb_build_object('ok', true, 'reason', 'already_recorded', 'transfer_id', _transfer_id);
    END IF;
  END IF;

  SELECT id, warehouse_id, COALESCE(stock_quantity, 0) AS stock_quantity
    INTO v_prod
    FROM public.products
   WHERE id = _product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_found');
  END IF;

  -- تحقق من كفاية الكمية
  IF v_prod.stock_quantity < _quantity THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'insufficient_stock',
      'available', v_prod.stock_quantity, 'requested', _quantity
    );
  END IF;

  -- تحقق من أن المصدر يطابق مستودع المنتج (إن كان مضبوطاً)
  IF v_prod.warehouse_id IS NOT NULL AND v_prod.warehouse_id <> _from_warehouse THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'wrong_source_warehouse',
      'expected', v_prod.warehouse_id, 'given', _from_warehouse
    );
  END IF;

  -- تحقق من وجود المستودعين
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _from_warehouse) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'from_warehouse_not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = _to_warehouse) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'to_warehouse_not_found');
  END IF;

  -- إذا الكمية = كامل المخزون → انقل مستودع المنتج بالكامل
  IF _quantity >= v_prod.stock_quantity THEN
    UPDATE public.products
       SET warehouse_id = _to_warehouse, updated_at = now()
     WHERE id = _product_id;
    v_relocated := true;
  END IF;

  -- سجّل التحويل
  INSERT INTO public.stock_transfers
    (id, product_id, from_warehouse_id, to_warehouse_id, quantity, notes, date)
  VALUES
    (COALESCE(_transfer_id, gen_random_uuid()), _product_id, _from_warehouse, _to_warehouse,
     _quantity, _notes, COALESCE(_date, CURRENT_DATE))
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', v_new_id,
    'product_id', _product_id,
    'quantity', _quantity,
    'relocated_product_warehouse', v_relocated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock_once(uuid, uuid, uuid, integer, text, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_delta_logged(uuid, numeric, text, text, text) TO authenticated;
