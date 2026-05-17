ALTER TABLE public.document_share_tokens
  ADD COLUMN IF NOT EXISTS hidden_sections jsonb NOT NULL DEFAULT '[]'::jsonb;