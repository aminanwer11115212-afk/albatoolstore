
-- ==========================================
-- Remove ALL anon policies from ALL tables
-- ==========================================

-- accounts
DROP POLICY IF EXISTS "Anon can delete accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anon can insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anon can read accounts" ON public.accounts;
DROP POLICY IF EXISTS "Anon can update accounts" ON public.accounts;

-- billing_terms
DROP POLICY IF EXISTS "Anon full access billing_terms" ON public.billing_terms;

-- company_settings
DROP POLICY IF EXISTS "Anon can insert company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Anon can read company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Anon can update company_settings" ON public.company_settings;

-- customer_groups
DROP POLICY IF EXISTS "Anon can delete customer_groups" ON public.customer_groups;
DROP POLICY IF EXISTS "Anon can insert customer_groups" ON public.customer_groups;
DROP POLICY IF EXISTS "Anon can read customer_groups" ON public.customer_groups;
DROP POLICY IF EXISTS "Anon can update customer_groups" ON public.customer_groups;

-- customers
DROP POLICY IF EXISTS "Anon can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can read customers" ON public.customers;
DROP POLICY IF EXISTS "Anon can update customers" ON public.customers;

-- destinations
DROP POLICY IF EXISTS "Anon full access destinations" ON public.destinations;

-- documents
DROP POLICY IF EXISTS "Anon full access documents" ON public.documents;

-- goals
DROP POLICY IF EXISTS "Anon full access goals" ON public.goals;

-- invoice_items
DROP POLICY IF EXISTS "Anon can delete invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anon can insert invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anon can read invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Anon can update invoice_items" ON public.invoice_items;

-- invoices
DROP POLICY IF EXISTS "Anon can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anon can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anon can read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anon can update invoices" ON public.invoices;

-- notes
DROP POLICY IF EXISTS "Anon full access notes" ON public.notes;

-- packaging_types
DROP POLICY IF EXISTS "Anon can delete packaging_types" ON public.packaging_types;
DROP POLICY IF EXISTS "Anon can insert packaging_types" ON public.packaging_types;
DROP POLICY IF EXISTS "Anon can read packaging_types" ON public.packaging_types;
DROP POLICY IF EXISTS "Anon can update packaging_types" ON public.packaging_types;

-- product_categories
DROP POLICY IF EXISTS "Anon can delete product_categories" ON public.product_categories;
DROP POLICY IF EXISTS "Anon can insert product_categories" ON public.product_categories;
DROP POLICY IF EXISTS "Anon can read product_categories" ON public.product_categories;
DROP POLICY IF EXISTS "Anon can update product_categories" ON public.product_categories;

-- product_companies
DROP POLICY IF EXISTS "Anon can delete product_companies" ON public.product_companies;
DROP POLICY IF EXISTS "Anon can insert product_companies" ON public.product_companies;
DROP POLICY IF EXISTS "Anon can read product_companies" ON public.product_companies;
DROP POLICY IF EXISTS "Anon can update product_companies" ON public.product_companies;

-- products
DROP POLICY IF EXISTS "Anon can delete products" ON public.products;
DROP POLICY IF EXISTS "Anon can insert products" ON public.products;
DROP POLICY IF EXISTS "Anon can read products" ON public.products;
DROP POLICY IF EXISTS "Anon can update products" ON public.products;

-- projects
DROP POLICY IF EXISTS "Anon can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Anon can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Anon can read projects" ON public.projects;
DROP POLICY IF EXISTS "Anon can update projects" ON public.projects;

-- purchase_order_items
DROP POLICY IF EXISTS "Anon can delete purchase_order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Anon can insert purchase_order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Anon can read purchase_order_items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Anon can update purchase_order_items" ON public.purchase_order_items;

-- purchase_orders
DROP POLICY IF EXISTS "Anon can delete purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Anon can insert purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Anon can read purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Anon can update purchase_orders" ON public.purchase_orders;

-- quote_items
DROP POLICY IF EXISTS "Anon can delete quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anon can insert quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anon can read quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anon can update quote_items" ON public.quote_items;

-- quotes
DROP POLICY IF EXISTS "Anon can delete quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anon can insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anon can read quotes" ON public.quotes;
DROP POLICY IF EXISTS "Anon can update quotes" ON public.quotes;

-- stock_return_items
DROP POLICY IF EXISTS "Anon can delete stock_return_items" ON public.stock_return_items;
DROP POLICY IF EXISTS "Anon can insert stock_return_items" ON public.stock_return_items;
DROP POLICY IF EXISTS "Anon can read stock_return_items" ON public.stock_return_items;
DROP POLICY IF EXISTS "Anon can update stock_return_items" ON public.stock_return_items;

-- stock_returns
DROP POLICY IF EXISTS "Anon can delete stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "Anon can insert stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "Anon can read stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "Anon can update stock_returns" ON public.stock_returns;

-- stock_transfers
DROP POLICY IF EXISTS "Anon can delete stock_transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Anon can insert stock_transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Anon can read stock_transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Anon can update stock_transfers" ON public.stock_transfers;

-- suppliers
DROP POLICY IF EXISTS "Anon can delete suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Anon can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Anon can read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Anon can update suppliers" ON public.suppliers;

-- todos
DROP POLICY IF EXISTS "Anon full access todos" ON public.todos;

-- transaction_categories
DROP POLICY IF EXISTS "Anon full access transaction_categories" ON public.transaction_categories;

-- transactions
DROP POLICY IF EXISTS "Anon can delete transactions" ON public.transactions;
DROP POLICY IF EXISTS "Anon can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Anon can read transactions" ON public.transactions;
DROP POLICY IF EXISTS "Anon can update transactions" ON public.transactions;

-- transporters
DROP POLICY IF EXISTS "Anon can delete transporters" ON public.transporters;
DROP POLICY IF EXISTS "Anon can insert transporters" ON public.transporters;
DROP POLICY IF EXISTS "Anon can read transporters" ON public.transporters;
DROP POLICY IF EXISTS "Anon can update transporters" ON public.transporters;

-- warehouses
DROP POLICY IF EXISTS "Anon can delete warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Anon can insert warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Anon can read warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Anon can update warehouses" ON public.warehouses;
