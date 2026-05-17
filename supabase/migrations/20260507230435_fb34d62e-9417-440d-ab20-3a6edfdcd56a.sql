-- 1) Function: compute items hash for an invoice (product_id + quantity, sorted)
CREATE OR REPLACE FUNCTION public.invoice_items_hash(_invoice_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT md5(coalesce(string_agg(
    coalesce(product_id::text,'NULL') || ':' || quantity::text,
    ',' ORDER BY coalesce(product_id::text,'NULL'), quantity
  ), ''))
  FROM public.invoice_items
  WHERE invoice_id = _invoice_id;
$$;

-- 2) Function: find a matching (duplicate) invoice for given customer + date + items
-- items_json: JSON array of objects [{product_id: uuid|null, quantity: int}]
CREATE OR REPLACE FUNCTION public.find_duplicate_invoice(
  _customer_id uuid,
  _date date,
  _items jsonb,
  _exclude_invoice_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, invoice_number text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  IF _customer_id IS NULL OR _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RETURN;
  END IF;

  SELECT md5(coalesce(string_agg(
    coalesce((elem->>'product_id'),'NULL') || ':' || (elem->>'quantity'),
    ',' ORDER BY coalesce((elem->>'product_id'),'NULL'), (elem->>'quantity')
  ), ''))
  INTO v_hash
  FROM jsonb_array_elements(_items) elem;

  RETURN QUERY
  SELECT i.id, i.invoice_number
  FROM public.invoices i
  WHERE i.customer_id = _customer_id
    AND i.date = _date
    AND (_exclude_invoice_id IS NULL OR i.id <> _exclude_invoice_id)
    AND public.invoice_items_hash(i.id) = v_hash
    AND v_hash <> md5('')
  ORDER BY i.created_at
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_invoice(uuid, date, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_items_hash(uuid) TO authenticated;