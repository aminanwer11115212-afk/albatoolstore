CREATE TABLE public.document_share_tokens (
  token text PRIMARY KEY,
  doc_type text NOT NULL,
  doc_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hidden_sections jsonb NOT NULL DEFAULT '[]'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_share_tokens TO authenticated;
GRANT ALL ON public.document_share_tokens TO service_role;

ALTER TABLE public.document_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own share tokens"
  ON public.document_share_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE INDEX idx_doc_share_tokens_doc ON public.document_share_tokens (doc_type, doc_id);
CREATE INDEX idx_doc_share_tokens_expires ON public.document_share_tokens (expires_at);