
CREATE OR REPLACE FUNCTION public.apply_exchange_rate_bulk(
  _currency_code text,
  _new_rate numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _products_updated int := 0;
  _quotes_updated int := 0;
  _invoices_updated int := 0;
  _rate_id uuid;
BEGIN
  IF _new_rate IS NULL OR _new_rate <= 0 THEN
    RAISE EXCEPTION 'INVALID_RATE';
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  -- 1) Save new rate
  INSERT INTO public.exchange_rates(currency_code, rate_to_base, effective_date)
  VALUES (_currency_code, _new_rate, CURRENT_DATE)
  RETURNING id INTO _rate_id;

  -- 2) Products: sale_price = foreign_price * new_rate
  WITH upd AS (
    UPDATE public.products
    SET sale_price = ROUND((foreign_price * _new_rate)::numeric, 2)
    WHERE foreign_price IS NOT NULL AND foreign_price > 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO _products_updated FROM upd;

  -- 3) Draft quote items + quote totals
  WITH q_items AS (
    UPDATE public.quote_items qi
    SET
      unit_price = ROUND((qi.foreign_price * _new_rate)::numeric, 2),
      discount_value = CASE
        WHEN qi.format_discount = 'amount' THEN COALESCE(qi.discount,0)
        ELSE ROUND((qi.foreign_price * _new_rate * COALESCE(qi.quantity,0) * COALESCE(qi.discount,0) / 100)::numeric, 2)
      END,
      total = ROUND(((qi.foreign_price * _new_rate * COALESCE(qi.quantity,0))
              - CASE
                  WHEN qi.format_discount = 'amount' THEN COALESCE(qi.discount,0)
                  ELSE (qi.foreign_price * _new_rate * COALESCE(qi.quantity,0) * COALESCE(qi.discount,0) / 100)
                END)::numeric, 2)
    FROM public.quotes q
    WHERE qi.quote_id = q.id
      AND q.status = 'draft'
      AND q.currency_code = _currency_code
      AND qi.foreign_price IS NOT NULL
    RETURNING qi.quote_id
  ),
  q_totals AS (
    UPDATE public.quotes q
    SET
      exchange_rate_to_base = _new_rate,
      subtotal = COALESCE((SELECT SUM(total) FROM public.quote_items WHERE quote_id = q.id), 0),
      total = COALESCE((SELECT SUM(total) FROM public.quote_items WHERE quote_id = q.id), 0) - COALESCE(q.discount, 0)
    WHERE q.status = 'draft'
      AND q.currency_code = _currency_code
      AND q.id IN (SELECT DISTINCT quote_id FROM q_items)
    RETURNING 1
  )
  SELECT COUNT(*) INTO _quotes_updated FROM q_totals;

  -- 4) Draft/preparing invoice items + invoice totals
  WITH i_items AS (
    UPDATE public.invoice_items ii
    SET
      unit_price = ROUND((ii.foreign_price * _new_rate)::numeric, 2),
      discount_value = CASE
        WHEN ii.format_discount = 'amount' THEN COALESCE(ii.discount,0)
        ELSE ROUND((ii.foreign_price * _new_rate * COALESCE(ii.quantity,0) * COALESCE(ii.discount,0) / 100)::numeric, 2)
      END,
      total = ROUND(((ii.foreign_price * _new_rate * COALESCE(ii.quantity,0))
              - CASE
                  WHEN ii.format_discount = 'amount' THEN COALESCE(ii.discount,0)
                  ELSE (ii.foreign_price * _new_rate * COALESCE(ii.quantity,0) * COALESCE(ii.discount,0) / 100)
                END)::numeric, 2)
    FROM public.invoices inv
    WHERE ii.invoice_id = inv.id
      AND inv.currency_code = _currency_code
      AND (inv.workflow_status IN ('quote','preparing') OR inv.status = 'draft')
      AND ii.foreign_price IS NOT NULL
    RETURNING ii.invoice_id
  ),
  i_totals AS (
    UPDATE public.invoices inv
    SET
      exchange_rate_to_base = _new_rate,
      subtotal = COALESCE((SELECT SUM(total) FROM public.invoice_items WHERE invoice_id = inv.id), 0),
      total = COALESCE((SELECT SUM(total) FROM public.invoice_items WHERE invoice_id = inv.id), 0)
              - COALESCE(inv.discount, 0) + COALESCE(inv.shipping, 0),
      due_amount = GREATEST(0,
        COALESCE((SELECT SUM(total) FROM public.invoice_items WHERE invoice_id = inv.id), 0)
        - COALESCE(inv.discount, 0) + COALESCE(inv.shipping, 0)
        - COALESCE(inv.paid_amount, 0))
    WHERE inv.currency_code = _currency_code
      AND (inv.workflow_status IN ('quote','preparing') OR inv.status = 'draft')
      AND inv.id IN (SELECT DISTINCT invoice_id FROM i_items)
    RETURNING 1
  )
  SELECT COUNT(*) INTO _invoices_updated FROM i_totals;

  -- 5) Activity log
  INSERT INTO public.activity_log(
    entity_type, entity_id, action, user_email, user_name, changed_by,
    table_name, record_id, new_data
  )
  VALUES (
    'exchange_rate', _rate_id, 'bulk_apply', _email, _email, _uid,
    'exchange_rates', _rate_id,
    jsonb_build_object(
      'currency_code', _currency_code,
      'new_rate', _new_rate,
      'products_updated', _products_updated,
      'quotes_updated', _quotes_updated,
      'invoices_updated', _invoices_updated
    )
  );

  RETURN jsonb_build_object(
    'rate_id', _rate_id,
    'products_updated', _products_updated,
    'quotes_updated', _quotes_updated,
    'invoices_updated', _invoices_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_exchange_rate_bulk(text, numeric) TO authenticated;
