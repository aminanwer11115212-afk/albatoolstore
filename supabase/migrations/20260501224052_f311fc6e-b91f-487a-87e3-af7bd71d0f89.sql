-- Sidebar ordering (created_at DESC)
CREATE INDEX IF NOT EXISTS idx_quotes_created_at         ON public.quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at       ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created   ON public.purchase_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_returns_created     ON public.stock_returns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created      ON public.transactions(created_at DESC);

-- Loading items when opening a doc (foreign keys)
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id  ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id      ON public.quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_po_items_po_id            ON public.purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_stock_return_items_ret    ON public.stock_return_items(stock_return_id);

-- Packaging / transports children
CREATE INDEX IF NOT EXISTS idx_invoice_packaging_inv     ON public.invoice_packaging(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_transports_inv    ON public.invoice_transports(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ipi_packaging             ON public.invoices_packaging_items(invoice_packaging_id);

-- Filtering by date in reports
CREATE INDEX IF NOT EXISTS idx_quotes_date               ON public.quotes(date);
CREATE INDEX IF NOT EXISTS idx_transactions_date         ON public.transactions(date);