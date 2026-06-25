CREATE POLICY "company_assets_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'company-assets');
CREATE POLICY "company_assets_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-assets');
CREATE POLICY "company_assets_update_auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'company-assets');
CREATE POLICY "company_assets_delete_auth" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'company-assets');