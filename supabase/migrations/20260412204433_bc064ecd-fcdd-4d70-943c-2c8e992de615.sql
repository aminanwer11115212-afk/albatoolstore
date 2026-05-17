
-- Allow anon read/write access to all tables since no auth is implemented yet

-- accounts
CREATE POLICY "Anon can read accounts" ON public.accounts FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert accounts" ON public.accounts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update accounts" ON public.accounts FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete accounts" ON public.accounts FOR DELETE TO anon USING (true);

-- customers
CREATE POLICY "Anon can read customers" ON public.customers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert customers" ON public.customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update customers" ON public.customers FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete customers" ON public.customers FOR DELETE TO anon USING (true);

-- customer_groups
CREATE POLICY "Anon can read customer_groups" ON public.customer_groups FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert customer_groups" ON public.customer_groups FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update customer_groups" ON public.customer_groups FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete customer_groups" ON public.customer_groups FOR DELETE TO anon USING (true);

-- products
CREATE POLICY "Anon can read products" ON public.products FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert products" ON public.products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update products" ON public.products FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete products" ON public.products FOR DELETE TO anon USING (true);

-- product_categories
CREATE POLICY "Anon can read product_categories" ON public.product_categories FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert product_categories" ON public.product_categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update product_categories" ON public.product_categories FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete product_categories" ON public.product_categories FOR DELETE TO anon USING (true);

-- product_companies
CREATE POLICY "Anon can read product_companies" ON public.product_companies FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert product_companies" ON public.product_companies FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update product_companies" ON public.product_companies FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete product_companies" ON public.product_companies FOR DELETE TO anon USING (true);

-- invoices
CREATE POLICY "Anon can read invoices" ON public.invoices FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert invoices" ON public.invoices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update invoices" ON public.invoices FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete invoices" ON public.invoices FOR DELETE TO anon USING (true);

-- invoice_items
CREATE POLICY "Anon can read invoice_items" ON public.invoice_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert invoice_items" ON public.invoice_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update invoice_items" ON public.invoice_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete invoice_items" ON public.invoice_items FOR DELETE TO anon USING (true);

-- quotes
CREATE POLICY "Anon can read quotes" ON public.quotes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert quotes" ON public.quotes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update quotes" ON public.quotes FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete quotes" ON public.quotes FOR DELETE TO anon USING (true);

-- quote_items
CREATE POLICY "Anon can read quote_items" ON public.quote_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert quote_items" ON public.quote_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update quote_items" ON public.quote_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete quote_items" ON public.quote_items FOR DELETE TO anon USING (true);

-- transactions
CREATE POLICY "Anon can read transactions" ON public.transactions FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert transactions" ON public.transactions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update transactions" ON public.transactions FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete transactions" ON public.transactions FOR DELETE TO anon USING (true);

-- suppliers
CREATE POLICY "Anon can read suppliers" ON public.suppliers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert suppliers" ON public.suppliers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update suppliers" ON public.suppliers FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete suppliers" ON public.suppliers FOR DELETE TO anon USING (true);

-- warehouses
CREATE POLICY "Anon can read warehouses" ON public.warehouses FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert warehouses" ON public.warehouses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update warehouses" ON public.warehouses FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete warehouses" ON public.warehouses FOR DELETE TO anon USING (true);

-- transporters
CREATE POLICY "Anon can read transporters" ON public.transporters FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert transporters" ON public.transporters FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update transporters" ON public.transporters FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete transporters" ON public.transporters FOR DELETE TO anon USING (true);

-- projects
CREATE POLICY "Anon can read projects" ON public.projects FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert projects" ON public.projects FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update projects" ON public.projects FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete projects" ON public.projects FOR DELETE TO anon USING (true);

-- packaging_types
CREATE POLICY "Anon can read packaging_types" ON public.packaging_types FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert packaging_types" ON public.packaging_types FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update packaging_types" ON public.packaging_types FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete packaging_types" ON public.packaging_types FOR DELETE TO anon USING (true);

-- company_settings
CREATE POLICY "Anon can read company_settings" ON public.company_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert company_settings" ON public.company_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update company_settings" ON public.company_settings FOR UPDATE TO anon USING (true);

-- purchase_orders
CREATE POLICY "Anon can read purchase_orders" ON public.purchase_orders FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert purchase_orders" ON public.purchase_orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update purchase_orders" ON public.purchase_orders FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete purchase_orders" ON public.purchase_orders FOR DELETE TO anon USING (true);

-- purchase_order_items
CREATE POLICY "Anon can read purchase_order_items" ON public.purchase_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert purchase_order_items" ON public.purchase_order_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update purchase_order_items" ON public.purchase_order_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete purchase_order_items" ON public.purchase_order_items FOR DELETE TO anon USING (true);

-- stock_returns
CREATE POLICY "Anon can read stock_returns" ON public.stock_returns FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert stock_returns" ON public.stock_returns FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update stock_returns" ON public.stock_returns FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete stock_returns" ON public.stock_returns FOR DELETE TO anon USING (true);

-- stock_return_items
CREATE POLICY "Anon can read stock_return_items" ON public.stock_return_items FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert stock_return_items" ON public.stock_return_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update stock_return_items" ON public.stock_return_items FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete stock_return_items" ON public.stock_return_items FOR DELETE TO anon USING (true);

-- stock_transfers
CREATE POLICY "Anon can read stock_transfers" ON public.stock_transfers FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert stock_transfers" ON public.stock_transfers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update stock_transfers" ON public.stock_transfers FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can delete stock_transfers" ON public.stock_transfers FOR DELETE TO anon USING (true);
