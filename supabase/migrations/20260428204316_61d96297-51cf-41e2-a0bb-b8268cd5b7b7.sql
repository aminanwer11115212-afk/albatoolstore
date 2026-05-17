
CREATE OR REPLACE FUNCTION public.delete_invoice_items_silent(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.invoice_items DISABLE TRIGGER trg_archive_invoice_item;
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
  ALTER TABLE public.invoice_items ENABLE TRIGGER trg_archive_invoice_item;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.invoice_items ENABLE TRIGGER trg_archive_invoice_item;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_quote_items_silent(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.quote_items DISABLE TRIGGER trg_archive_quote_item;
  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
  ALTER TABLE public.quote_items ENABLE TRIGGER trg_archive_quote_item;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.quote_items ENABLE TRIGGER trg_archive_quote_item;
  RAISE;
END;
$$;
