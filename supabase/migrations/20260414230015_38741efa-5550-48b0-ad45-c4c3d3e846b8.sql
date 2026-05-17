INSERT INTO storage.buckets (id, name, public) VALUES ('company-assets', 'company-assets', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access" ON storage.objects FOR SELECT USING (bucket_id = 'company-assets');
CREATE POLICY "Auth insert access" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'company-assets');
CREATE POLICY "Auth update access" ON storage.objects FOR UPDATE USING (bucket_id = 'company-assets');
CREATE POLICY "Auth delete access" ON storage.objects FOR DELETE USING (bucket_id = 'company-assets');