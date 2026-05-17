-- ===== Composite indexes targeting the actual query patterns =====

-- 1) Customer detail view: invoices/quotes by customer ordered by date
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date
  ON public.invoices(customer_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_customer_date
  ON public.quotes(customer_id, date DESC);

-- 2) Customer returns
CREATE INDEX IF NOT EXISTS idx_stock_returns_customer
  ON public.stock_returns(customer_id, created_at DESC);

-- 3) Customer statement: transactions by customer ordered by date
CREATE INDEX IF NOT EXISTS idx_transactions_customer_date
  ON public.transactions(customer_id, date DESC);

-- 4) Quote advance payments lookup: WHERE reference_id=? AND type='income'
CREATE INDEX IF NOT EXISTS idx_transactions_reference_type
  ON public.transactions(reference_id, type);

-- 5) Supplier detail view: purchase orders by supplier ordered by date
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_date
  ON public.purchase_orders(supplier_id, date DESC);

-- 6) Stock returns linked to a specific invoice
CREATE INDEX IF NOT EXISTS idx_stock_returns_invoice
  ON public.stock_returns(invoice_id);

-- ===== Drop redundant single-column indexes now covered by composites =====
-- (composite (customer_id, date) already serves WHERE customer_id=?)
DROP INDEX IF EXISTS public.idx_invoices_customer;
DROP INDEX IF EXISTS public.idx_quotes_customer;
DROP INDEX IF EXISTS public.idx_purchase_orders_supplier;