
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS stock_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_applied_op text;

-- Backfill: أي أمر حالته 'received' نعتبره مُطبَّقاً بالفعل حتى لا يتضاعف عند أول استدعاء للـ RPC
UPDATE public.purchase_orders
SET stock_applied_at = COALESCE(stock_applied_at, updated_at, created_at, now()),
    stock_applied_op = COALESCE(stock_applied_op, 'receive')
WHERE status = 'received' AND stock_applied_at IS NULL;

CREATE OR REPLACE FUNCTION public.receive_purchase_stock_once(_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied timestamptz;
  v_exists boolean;
  r record;
BEGIN
  IF _po_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_id');
  END IF;

  -- قفل صف أمر الشراء يُسلسل أي منادين متزامنين
  SELECT stock_applied_at, true INTO v_applied, v_exists
  FROM public.purchase_orders
  WHERE id = _po_id
  FOR UPDATE;

  IF NOT COALESCE(v_exists, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_applied IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_applied');
  END IF;

  FOR r IN
    SELECT product_id, COALESCE(SUM(quantity), 0) AS qty
    FROM public.purchase_order_items
    WHERE purchase_order_id = _po_id AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) + r.qty),
        updated_at = now()
    WHERE id = r.product_id;
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'received',
      stock_applied_at = now(),
      stock_applied_op = 'receive',
      updated_at = now()
  WHERE id = _po_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'applied');
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_purchase_stock_once(_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_applied timestamptz;
  v_exists boolean;
  r record;
BEGIN
  IF _po_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_id');
  END IF;

  SELECT stock_applied_at, true INTO v_applied, v_exists
  FROM public.purchase_orders
  WHERE id = _po_id
  FOR UPDATE;

  IF NOT COALESCE(v_exists, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_applied IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_applied');
  END IF;

  FOR r IN
    SELECT product_id, COALESCE(SUM(quantity), 0) AS qty
    FROM public.purchase_order_items
    WHERE purchase_order_id = _po_id AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - r.qty),
        updated_at = now()
    WHERE id = r.product_id;
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'cancelled',
      stock_applied_at = NULL,
      stock_applied_op = 'restore',
      updated_at = now()
  WHERE id = _po_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'restored');
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_stock_once(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_purchase_stock_once(uuid) TO authenticated, service_role;
