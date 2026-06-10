
CREATE POLICY "Authenticated read attachments" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('invoice-attachments','quote-attachments','purchase-attachments'));

CREATE POLICY "Authenticated upload attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('invoice-attachments','quote-attachments','purchase-attachments'));

CREATE POLICY "Authenticated update attachments" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('invoice-attachments','quote-attachments','purchase-attachments'))
WITH CHECK (bucket_id IN ('invoice-attachments','quote-attachments','purchase-attachments'));

CREATE POLICY "Authenticated delete attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('invoice-attachments','quote-attachments','purchase-attachments'));
