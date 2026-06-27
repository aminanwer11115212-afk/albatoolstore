
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'invoices','invoice_items','quotes','quote_items',
    'customers','suppliers','products',
    'accounts','transactions',
    'purchase_orders','purchase_order_items',
    'invoice_transports','invoice_packaging',
    'stock_returns','stock_return_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
