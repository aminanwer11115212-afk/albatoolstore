-- Backfill stock_applied_at for received purchase orders that were saved before the RPC guard existed
UPDATE public.purchase_orders
SET stock_applied_at = COALESCE(stock_applied_at, updated_at, created_at, now()),
    stock_applied_op = COALESCE(stock_applied_op, 'receive')
WHERE status = 'received' AND stock_applied_at IS NULL;

-- Make sure Realtime broadcasts purchase order changes across devices (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_order_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.purchase_orders REPLICA IDENTITY FULL;
ALTER TABLE public.purchase_order_items REPLICA IDENTITY FULL;