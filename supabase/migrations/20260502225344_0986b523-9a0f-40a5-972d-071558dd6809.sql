-- Generic helper expression: auth.uid() IS NOT NULL

-- billing_terms
DROP POLICY IF EXISTS "Auth full access billing_terms" ON public.billing_terms;
CREATE POLICY "billing_terms_select" ON public.billing_terms FOR SELECT TO authenticated USING (true);
CREATE POLICY "billing_terms_insert" ON public.billing_terms FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "billing_terms_update" ON public.billing_terms FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "billing_terms_delete" ON public.billing_terms FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- currencies
DROP POLICY IF EXISTS "Auth full access currencies" ON public.currencies;
CREATE POLICY "currencies_select" ON public.currencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "currencies_insert" ON public.currencies FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "currencies_update" ON public.currencies FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "currencies_delete" ON public.currencies FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- customer_destinations
DROP POLICY IF EXISTS "Auth full access cd" ON public.customer_destinations;
CREATE POLICY "cd_select" ON public.customer_destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "cd_insert" ON public.customer_destinations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cd_update" ON public.customer_destinations FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cd_delete" ON public.customer_destinations FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- customer_preferred_transporter
DROP POLICY IF EXISTS "Auth full access cpt" ON public.customer_preferred_transporter;
CREATE POLICY "cpt_select" ON public.customer_preferred_transporter FOR SELECT TO authenticated USING (true);
CREATE POLICY "cpt_insert" ON public.customer_preferred_transporter FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cpt_update" ON public.customer_preferred_transporter FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cpt_delete" ON public.customer_preferred_transporter FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- customer_transporters
DROP POLICY IF EXISTS "Auth full access ct" ON public.customer_transporters;
CREATE POLICY "ct_select" ON public.customer_transporters FOR SELECT TO authenticated USING (true);
CREATE POLICY "ct_insert" ON public.customer_transporters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ct_update" ON public.customer_transporters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "ct_delete" ON public.customer_transporters FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- destination_transporters
DROP POLICY IF EXISTS "Auth full access dt" ON public.destination_transporters;
CREATE POLICY "dt_select" ON public.destination_transporters FOR SELECT TO authenticated USING (true);
CREATE POLICY "dt_insert" ON public.destination_transporters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "dt_update" ON public.destination_transporters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "dt_delete" ON public.destination_transporters FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- destinations
DROP POLICY IF EXISTS "Auth full access destinations" ON public.destinations;
CREATE POLICY "destinations_select" ON public.destinations FOR SELECT TO authenticated USING (true);
CREATE POLICY "destinations_insert" ON public.destinations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "destinations_update" ON public.destinations FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "destinations_delete" ON public.destinations FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- documents
DROP POLICY IF EXISTS "Auth full access documents" ON public.documents;
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- exchange_rates
DROP POLICY IF EXISTS "Auth full access exchange_rates" ON public.exchange_rates;
CREATE POLICY "exchange_rates_select" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "exchange_rates_insert" ON public.exchange_rates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "exchange_rates_update" ON public.exchange_rates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "exchange_rates_delete" ON public.exchange_rates FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- goals
DROP POLICY IF EXISTS "Auth full access goals" ON public.goals;
CREATE POLICY "goals_select" ON public.goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "goals_insert" ON public.goals FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "goals_update" ON public.goals FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "goals_delete" ON public.goals FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- invoice_packaging
DROP POLICY IF EXISTS "Auth full access invoice_packaging" ON public.invoice_packaging;
CREATE POLICY "invoice_packaging_select" ON public.invoice_packaging FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoice_packaging_insert" ON public.invoice_packaging FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_packaging_update" ON public.invoice_packaging FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_packaging_delete" ON public.invoice_packaging FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- invoice_revisions
DROP POLICY IF EXISTS "Auth full access invoice_revisions" ON public.invoice_revisions;
CREATE POLICY "invoice_revisions_select" ON public.invoice_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoice_revisions_insert" ON public.invoice_revisions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_revisions_update" ON public.invoice_revisions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_revisions_delete" ON public.invoice_revisions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- invoice_transports
DROP POLICY IF EXISTS "Auth full access invoice_transports" ON public.invoice_transports;
CREATE POLICY "invoice_transports_select" ON public.invoice_transports FOR SELECT TO authenticated USING (true);
CREATE POLICY "invoice_transports_insert" ON public.invoice_transports FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_transports_update" ON public.invoice_transports FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "invoice_transports_delete" ON public.invoice_transports FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- invoices_packaging_items
DROP POLICY IF EXISTS "Auth full access ipi" ON public.invoices_packaging_items;
CREATE POLICY "ipi_select" ON public.invoices_packaging_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "ipi_insert" ON public.invoices_packaging_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ipi_update" ON public.invoices_packaging_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "ipi_delete" ON public.invoices_packaging_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- localities
DROP POLICY IF EXISTS "Auth full access localities" ON public.localities;
CREATE POLICY "localities_select" ON public.localities FOR SELECT TO authenticated USING (true);
CREATE POLICY "localities_insert" ON public.localities FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "localities_update" ON public.localities FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "localities_delete" ON public.localities FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- locality_transporters
DROP POLICY IF EXISTS "Auth full access lt" ON public.locality_transporters;
CREATE POLICY "lt_select" ON public.locality_transporters FOR SELECT TO authenticated USING (true);
CREATE POLICY "lt_insert" ON public.locality_transporters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "lt_update" ON public.locality_transporters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "lt_delete" ON public.locality_transporters FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- notes
DROP POLICY IF EXISTS "Auth full access notes" ON public.notes;
CREATE POLICY "notes_select" ON public.notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "notes_insert" ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "notes_update" ON public.notes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "notes_delete" ON public.notes FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- product_category_links
DROP POLICY IF EXISTS "Auth full access pcl" ON public.product_category_links;
CREATE POLICY "pcl_select" ON public.product_category_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "pcl_insert" ON public.product_category_links FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "pcl_update" ON public.product_category_links FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "pcl_delete" ON public.product_category_links FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- purchase_attachments
DROP POLICY IF EXISTS "Auth full access purchase_attachments" ON public.purchase_attachments;
CREATE POLICY "purchase_attachments_select" ON public.purchase_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_attachments_insert" ON public.purchase_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "purchase_attachments_update" ON public.purchase_attachments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "purchase_attachments_delete" ON public.purchase_attachments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- quote_attachments
DROP POLICY IF EXISTS "Auth full access quote_attachments" ON public.quote_attachments;
CREATE POLICY "quote_attachments_select" ON public.quote_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "quote_attachments_insert" ON public.quote_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "quote_attachments_update" ON public.quote_attachments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "quote_attachments_delete" ON public.quote_attachments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- quote_items
DROP POLICY IF EXISTS "Anyone can insert quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anyone can update quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Anyone can delete quote_items" ON public.quote_items;
CREATE POLICY "quote_items_insert" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "quote_items_delete" ON public.quote_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- quote_transports
DROP POLICY IF EXISTS "Auth full access qt" ON public.quote_transports;
CREATE POLICY "qt_select" ON public.quote_transports FOR SELECT TO authenticated USING (true);
CREATE POLICY "qt_insert" ON public.quote_transports FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "qt_update" ON public.quote_transports FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "qt_delete" ON public.quote_transports FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- quotes_packaging
DROP POLICY IF EXISTS "Auth full access qp" ON public.quotes_packaging;
CREATE POLICY "qp_select" ON public.quotes_packaging FOR SELECT TO authenticated USING (true);
CREATE POLICY "qp_insert" ON public.quotes_packaging FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "qp_update" ON public.quotes_packaging FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "qp_delete" ON public.quotes_packaging FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- quotes_packaging_items
DROP POLICY IF EXISTS "Auth full access qpi" ON public.quotes_packaging_items;
CREATE POLICY "qpi_select" ON public.quotes_packaging_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "qpi_insert" ON public.quotes_packaging_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "qpi_update" ON public.quotes_packaging_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "qpi_delete" ON public.quotes_packaging_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- regions
DROP POLICY IF EXISTS "Auth full access regions" ON public.regions;
CREATE POLICY "regions_select" ON public.regions FOR SELECT TO authenticated USING (true);
CREATE POLICY "regions_insert" ON public.regions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "regions_update" ON public.regions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "regions_delete" ON public.regions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- states
DROP POLICY IF EXISTS "Auth full access states" ON public.states;
CREATE POLICY "states_select" ON public.states FOR SELECT TO authenticated USING (true);
CREATE POLICY "states_insert" ON public.states FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "states_update" ON public.states FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "states_delete" ON public.states FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- stock_return_items
DROP POLICY IF EXISTS "Anyone can insert stock_return_items" ON public.stock_return_items;
DROP POLICY IF EXISTS "Anyone can update stock_return_items" ON public.stock_return_items;
DROP POLICY IF EXISTS "Anyone can delete stock_return_items" ON public.stock_return_items;
CREATE POLICY "sri_insert" ON public.stock_return_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sri_update" ON public.stock_return_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "sri_delete" ON public.stock_return_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- stock_returns
DROP POLICY IF EXISTS "Anyone can insert stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "Anyone can update stock_returns" ON public.stock_returns;
DROP POLICY IF EXISTS "Anyone can delete stock_returns" ON public.stock_returns;
CREATE POLICY "sr_insert" ON public.stock_returns FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "sr_update" ON public.stock_returns FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "sr_delete" ON public.stock_returns FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- stock_transfers
DROP POLICY IF EXISTS "Anyone can insert stock_transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Anyone can update stock_transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Anyone can delete stock_transfers" ON public.stock_transfers;
CREATE POLICY "st_insert" ON public.stock_transfers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "st_update" ON public.stock_transfers FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "st_delete" ON public.stock_transfers FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- suppliers
DROP POLICY IF EXISTS "Anyone can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Anyone can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Anyone can delete suppliers" ON public.suppliers;
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- todos
DROP POLICY IF EXISTS "Auth full access todos" ON public.todos;
CREATE POLICY "todos_select" ON public.todos FOR SELECT TO authenticated USING (true);
CREATE POLICY "todos_insert" ON public.todos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "todos_update" ON public.todos FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "todos_delete" ON public.todos FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- transaction_categories
DROP POLICY IF EXISTS "Auth full access transaction_categories" ON public.transaction_categories;
CREATE POLICY "tc_select" ON public.transaction_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "tc_insert" ON public.transaction_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tc_update" ON public.transaction_categories FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "tc_delete" ON public.transaction_categories FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- transactions
DROP POLICY IF EXISTS "Anyone can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Anyone can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Anyone can delete transactions" ON public.transactions;
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- transporters
DROP POLICY IF EXISTS "Anyone can insert transporters" ON public.transporters;
DROP POLICY IF EXISTS "Anyone can update transporters" ON public.transporters;
DROP POLICY IF EXISTS "Anyone can delete transporters" ON public.transporters;
CREATE POLICY "transporters_insert" ON public.transporters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "transporters_update" ON public.transporters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "transporters_delete" ON public.transporters FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- warehouses
DROP POLICY IF EXISTS "Anyone can insert warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Anyone can update warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Anyone can delete warehouses" ON public.warehouses;
CREATE POLICY "warehouses_insert" ON public.warehouses FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "warehouses_update" ON public.warehouses FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "warehouses_delete" ON public.warehouses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- activity_log: keep as-is (audit needs unrestricted insert) — leave alone
-- deleted_invoice_items / deleted_quote_items: archive triggers — leave inserts open