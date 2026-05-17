-- Add categorization, expiration and soft-delete to quote_attachments
ALTER TABLE public.quote_attachments
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'details',
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

ALTER TABLE public.quote_attachments
  DROP CONSTRAINT IF EXISTS quote_attachments_category_check;
ALTER TABLE public.quote_attachments
  ADD CONSTRAINT quote_attachments_category_check
  CHECK (category IN ('receipt','running','details'));

CREATE INDEX IF NOT EXISTS idx_quote_attachments_quote_cat
  ON public.quote_attachments (quote_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quote_attachments_expires
  ON public.quote_attachments (expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quote_attachments_deleted
  ON public.quote_attachments (quote_id) WHERE deleted_at IS NOT NULL;

-- Enable pg_cron and schedule daily soft-delete of expired attachments
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'soft-delete-expired-quote-attachments') THEN
    PERFORM cron.unschedule('soft-delete-expired-quote-attachments');
  END IF;
END $$;

SELECT cron.schedule(
  'soft-delete-expired-quote-attachments',
  '0 2 * * *',
  $$ UPDATE public.quote_attachments
       SET deleted_at = now(), deleted_reason = 'auto_expired'
       WHERE expires_at < now() AND deleted_at IS NULL $$
);