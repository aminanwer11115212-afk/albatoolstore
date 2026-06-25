
CREATE TABLE public.share_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  doc_type text NOT NULL,
  doc_id uuid,
  event text NOT NULL,
  user_agent text,
  ip text,
  referer text,
  actor uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX share_link_events_token_idx ON public.share_link_events(token);
CREATE INDEX share_link_events_doc_idx ON public.share_link_events(doc_type, doc_id);
CREATE INDEX share_link_events_created_at_idx ON public.share_link_events(created_at DESC);

GRANT SELECT ON public.share_link_events TO authenticated;
GRANT ALL ON public.share_link_events TO service_role;

ALTER TABLE public.share_link_events ENABLE ROW LEVEL SECURITY;

-- المستخدم يقرأ فقط الأحداث الخاصة بالرموز التي أنشأها هو
CREATE POLICY "owners can read their share events"
  ON public.share_link_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.document_share_tokens t
      WHERE t.token = share_link_events.token
        AND t.created_by = auth.uid()
    )
  );
