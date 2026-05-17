
-- 1. Allow admins to permanently delete archived rows from deleted_*_items
CREATE POLICY "deleted_invoice_items_delete_admin"
ON public.deleted_invoice_items
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "deleted_quote_items_delete_admin"
ON public.deleted_quote_items
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Extend share token validation to accept the new doc types for
--    "unavailable items" public links.
CREATE OR REPLACE FUNCTION public.validate_document_share_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.doc_type NOT IN (
    'invoice','quote','return',
    'statement-customer','statement-supplier',
    'packaging-invoice','packaging-quote',
    'unavailable-invoice','unavailable-quote'
  ) THEN
    RAISE EXCEPTION 'invalid doc_type: %', NEW.doc_type;
  END IF;
  IF NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;
  RETURN NEW;
END;
$function$;
