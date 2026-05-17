-- Quote attachments table
CREATE TABLE public.quote_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quote_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth full access quote_attachments"
ON public.quote_attachments FOR ALL
TO authenticated
USING (true) WITH CHECK (true);

CREATE INDEX idx_quote_attachments_quote_id ON public.quote_attachments(quote_id);

-- Public storage bucket for quote attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-attachments', 'quote-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read quote-attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'quote-attachments');

CREATE POLICY "Auth insert quote-attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quote-attachments');

CREATE POLICY "Auth update quote-attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'quote-attachments');

CREATE POLICY "Auth delete quote-attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quote-attachments');