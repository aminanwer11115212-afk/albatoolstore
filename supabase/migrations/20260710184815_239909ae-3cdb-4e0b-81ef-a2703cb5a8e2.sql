
CREATE OR REPLACE FUNCTION public.apply_stock_delta(_product_id uuid, _delta numeric)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + COALESCE(_delta, 0),
         updated_at = now()
   WHERE id = _product_id;
$function$;

CREATE OR REPLACE FUNCTION public.decrement_product_stock(_product_id uuid, _qty numeric)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) - COALESCE(_qty, 0),
         updated_at = now()
   WHERE id = _product_id;
$function$;

CREATE OR REPLACE FUNCTION public.receive_purchase_stock_once(_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SET stock_quantity = COALESCE(stock_quantity, 0) + r.qty,
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
$function$;

CREATE OR REPLACE FUNCTION public.restore_purchase_stock_once(_po_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SET stock_quantity = COALESCE(stock_quantity, 0) - r.qty,
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
$function$;
