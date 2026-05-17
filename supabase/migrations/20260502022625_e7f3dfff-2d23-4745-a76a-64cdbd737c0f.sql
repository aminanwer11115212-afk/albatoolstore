-- Tokens for sharing public read-only document previews (invoice/quote/return/statement)
CREATE TABLE public.document_share_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  doc_type TEXT NOT NULL,
  doc_id UUID NOT NULL,
  created_by UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_share_tokens_token ON public.document_share_tokens(token);
CREATE INDEX idx_doc_share_tokens_expires ON public.document_share_tokens(expires_at);

-- Validation trigger for doc_type
CREATE OR REPLACE FUNCTION public.validate_document_share_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.doc_type NOT IN ('invoice','quote','return','statement-customer','statement-supplier') THEN
    RAISE EXCEPTION 'invalid doc_type: %', NEW.doc_type;
  END IF;
  IF NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_document_share_token
BEFORE INSERT OR UPDATE ON public.document_share_tokens
FOR EACH ROW EXECUTE FUNCTION public.validate_document_share_token();

ALTER TABLE public.document_share_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can create tokens
CREATE POLICY "auth users can create share tokens"
ON public.document_share_tokens FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Authenticated users can view their own tokens (for management)
CREATE POLICY "auth users can view own share tokens"
ON public.document_share_tokens FOR SELECT
TO authenticated
USING (created_by = auth.uid());

-- Authenticated users can delete their own tokens
CREATE POLICY "auth users can delete own share tokens"
ON public.document_share_tokens FOR DELETE
TO authenticated
USING (created_by = auth.uid());
-- Note: public reads are NOT via RLS — the edge function uses service role to validate the token and fetch the document.