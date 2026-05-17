
-- 1) Workflow extension: add ready_to_ship between preparing and in_transit
CREATE OR REPLACE FUNCTION public.workflow_rank(_s text)
 RETURNS integer LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE COALESCE(_s,'new')
    WHEN 'new' THEN 0
    WHEN 'preparing' THEN 1
    WHEN 'ready_to_ship' THEN 2
    WHEN 'in_transit' THEN 3
    WHEN 'done' THEN 4
    ELSE 0
  END
$function$;

-- 2) Packaging trigger now advances to ready_to_ship
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_packaging()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'ready_to_ship', 'حفظ تغليف للفاتورة');
  RETURN NEW;
END;
$function$;

-- 3) Drop payment auto-done trigger
DROP TRIGGER IF EXISTS auto_workflow_on_payment ON public.invoices;

-- 4) invoice_attachments table (mirrors quote_attachments structure)
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  file_size bigint,
  category text NOT NULL DEFAULT 'receipt' CHECK (category IN ('receipt','running','details')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  deleted_at timestamptz,
  deleted_reason text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice ON public.invoice_attachments(invoice_id);

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_attachments_select ON public.invoice_attachments;
DROP POLICY IF EXISTS invoice_attachments_insert ON public.invoice_attachments;
DROP POLICY IF EXISTS invoice_attachments_update ON public.invoice_attachments;
DROP POLICY IF EXISTS invoice_attachments_delete ON public.invoice_attachments;
CREATE POLICY invoice_attachments_select ON public.invoice_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY invoice_attachments_insert ON public.invoice_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY invoice_attachments_update ON public.invoice_attachments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY invoice_attachments_delete ON public.invoice_attachments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 5) Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-attachments', 'invoice-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "invoice_attachments_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "invoice_attachments_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "invoice_attachments_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "invoice_attachments_storage_delete" ON storage.objects;
CREATE POLICY "invoice_attachments_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'invoice-attachments');
CREATE POLICY "invoice_attachments_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-attachments');
CREATE POLICY "invoice_attachments_storage_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'invoice-attachments');
CREATE POLICY "invoice_attachments_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'invoice-attachments');

-- 6) Auto-workflow on receipt upload (active receipts only)
CREATE OR REPLACE FUNCTION public.trg_auto_workflow_on_receipt()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.category = 'receipt' AND NEW.deleted_at IS NULL THEN
    PERFORM public.advance_invoice_workflow(NEW.invoice_id, 'done', 'رفع إيصال الدفع');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS auto_workflow_on_receipt ON public.invoice_attachments;
CREATE TRIGGER auto_workflow_on_receipt
AFTER INSERT ON public.invoice_attachments
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_workflow_on_receipt();
