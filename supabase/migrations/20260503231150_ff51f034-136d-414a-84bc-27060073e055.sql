CREATE OR REPLACE FUNCTION public.validate_document_share_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.doc_type NOT IN ('invoice','quote','return','statement-customer','statement-supplier','packaging-invoice','packaging-quote') THEN
    RAISE EXCEPTION 'invalid doc_type: %', NEW.doc_type;
  END IF;
  IF NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;
  RETURN NEW;
END;
$function$;