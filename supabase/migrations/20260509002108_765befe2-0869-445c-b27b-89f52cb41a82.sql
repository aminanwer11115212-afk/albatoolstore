
-- 1) Make attachment buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('invoice-attachments','quote-attachments');

-- 2) Drop existing storage policies for these buckets and recreate as authenticated-only
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND (
        polname ILIKE '%invoice-attachments%' OR polname ILIKE '%invoice_attachments%'
        OR polname ILIKE '%quote-attachments%' OR polname ILIKE '%quote_attachments%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
  END LOOP;
END $$;

CREATE POLICY "invoice_attachments_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-attachments');
CREATE POLICY "invoice_attachments_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-attachments');
CREATE POLICY "invoice_attachments_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-attachments');
CREATE POLICY "invoice_attachments_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-attachments');

CREATE POLICY "quote_attachments_select_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quote-attachments');
CREATE POLICY "quote_attachments_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-attachments');
CREATE POLICY "quote_attachments_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'quote-attachments');
CREATE POLICY "quote_attachments_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'quote-attachments');

-- 3) company-assets: tighten write to authenticated (admin), keep read public for logo
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND (polname ILIKE '%company-assets%' OR polname ILIKE '%company_assets%' OR polname IN ('Auth insert access','Auth update access'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
  END LOOP;
END $$;

CREATE POLICY "company_assets_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-assets');
CREATE POLICY "company_assets_insert_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "company_assets_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "company_assets_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'admin'));

-- 4) Realtime channel authorization: admin only for these tables' broadcasts
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_admin_only_select" ON realtime.messages;
DROP POLICY IF EXISTS "realtime_admin_only_insert" ON realtime.messages;

CREATE POLICY "realtime_admin_only_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "realtime_admin_only_insert" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
