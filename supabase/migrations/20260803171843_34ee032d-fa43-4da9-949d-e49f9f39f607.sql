-- ============================================================================
-- get_shared_document(_token) — بيانات مستندٍ مشترَك، لقارئٍ بلا حساب.
--
-- ## لماذا
-- رابط العميل كان يُبنى داخل دالّة الحافة `document-share`، ومجلد
-- `supabase/functions` لا يُعدَّل من المستودع في هذا المشروع — فبقي الرابط على
-- نسخةٍ أقدم من التطبيق، ولا سبيل لتحديثه.
--
-- بهذه الدالّة تقرأ **صفحة React** بيانات المستند بنفسها وتبنيه بـ
-- `generatePrintHTML` — نفس قالب المعاينة والطباعة حرفياً، لا نسخةً منه. فيصير
-- الرابط جزءاً من نشر الواجهة: أي تعديل على الورقة يصل العميل مع أوّل نشر،
-- وينتهي ازدواج القالبين من أصله.
--
-- ## الحارس
-- ليس الـJWT بل **التوكن نفسه**: يُبحث في `document_share_tokens`، ويُرفض
-- المفقود والمنتهي. و`SECURITY DEFINER` يتخطّى RLS بعد التحقّق وحده، ولا يُعيد
-- إلا مستند التوكن — لا استعلام حرّ ولا معرّفات من المستدعي.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_shared_document(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tk            RECORD;
  v_doc         jsonb;
  v_items       jsonb;
  v_customer    jsonb;
  v_company     jsonb;
  v_packaging   jsonb;
  v_pkg_items   jsonb;
  v_transports  jsonb;
  v_customer_id uuid;
  v_prev_net    numeric := 0;
  v_current_net numeric := 0;
  v_doc_at      timestamptz;
BEGIN
  IF _token IS NULL OR btrim(_token) = '' THEN
    RETURN jsonb_build_object('error', 'missing_token');
  END IF;

  SELECT t.doc_type, t.doc_id, t.expires_at, t.hidden_sections
    INTO tk
    FROM public.document_share_tokens t
   WHERE t.token = btrim(_token)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF tk.expires_at <= now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  SELECT to_jsonb(c.*) INTO v_company
    FROM public.company_settings c LIMIT 1;

  -- ===================== فاتورة =====================
  IF tk.doc_type = 'invoice' THEN
    SELECT to_jsonb(i.*), i.customer_id, COALESCE(i.created_at, i.date::timestamptz)
      INTO v_doc, v_customer_id, v_doc_at
      FROM public.invoices i WHERE i.id = tk.doc_id;
    IF v_doc IS NULL THEN RETURN jsonb_build_object('error', 'doc_missing'); END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(it.*) ORDER BY it.created_at), '[]'::jsonb)
      INTO v_items FROM public.invoice_items it WHERE it.invoice_id = tk.doc_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'quantity', p.quantity, 'packs_count', p.packs_count,
             'pieces_per_pack', p.pieces_per_pack, 'weight', p.weight,
             'dimensions', p.dimensions, 'cost', p.cost, 'notes', p.notes,
             'packaging_types', (SELECT jsonb_build_object('name', pt.name)
                                   FROM public.packaging_types pt WHERE pt.id = p.packaging_type_id)
           )), '[]'::jsonb)
      INTO v_packaging FROM public.invoice_packaging p WHERE p.invoice_id = tk.doc_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_name', pi.product_name, 'packs_count', pi.packs_count,
             'pieces_per_pack', pi.pieces_per_pack, 'quantity', pi.quantity,
             'description', pi.description,
             'packaging_types', (SELECT jsonb_build_object('name', pt.name)
                                   FROM public.packaging_types pt WHERE pt.id = pi.packaging_type_id)
           ) ORDER BY pi.created_at), '[]'::jsonb)
      INTO v_pkg_items FROM public.invoices_packaging_items pi WHERE pi.invoice_id = tk.doc_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'transporters', (SELECT jsonb_build_object('name', tr.name, 'phone', tr.phone, 'address', tr.address)
                                FROM public.transporters tr WHERE tr.id = t.transporter_id),
             'destinations', (SELECT jsonb_build_object('name', d.name)
                                FROM public.destinations d WHERE d.id = t.destination_id)
           )), '[]'::jsonb)
      INTO v_transports FROM public.invoice_transports t WHERE t.invoice_id = tk.doc_id;

  -- ===================== عرض سعر =====================
  ELSIF tk.doc_type = 'quote' THEN
    SELECT to_jsonb(q.*), q.customer_id, COALESCE(q.created_at, q.date::timestamptz)
      INTO v_doc, v_customer_id, v_doc_at
      FROM public.quotes q WHERE q.id = tk.doc_id;
    IF v_doc IS NULL THEN RETURN jsonb_build_object('error', 'doc_missing'); END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(it.*) ORDER BY it.created_at), '[]'::jsonb)
      INTO v_items FROM public.quote_items it WHERE it.quote_id = tk.doc_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'quantity', p.quantity, 'packs_count', p.packs_count,
             'pieces_per_pack', p.pieces_per_pack, 'weight', p.weight,
             'dimensions', p.dimensions, 'cost', p.cost, 'notes', p.notes,
             'packaging_types', (SELECT jsonb_build_object('name', pt.name)
                                   FROM public.packaging_types pt WHERE pt.id = p.packaging_type_id)
           )), '[]'::jsonb)
      INTO v_packaging FROM public.quotes_packaging p WHERE p.quote_id = tk.doc_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'product_name', pi.product_name, 'packs_count', pi.packs_count,
             'pieces_per_pack', pi.pieces_per_pack, 'quantity', pi.quantity,
             'description', pi.description,
             'packaging_types', (SELECT jsonb_build_object('name', pt.name)
                                   FROM public.packaging_types pt WHERE pt.id = pi.packaging_type_id)
           ) ORDER BY pi.created_at), '[]'::jsonb)
      INTO v_pkg_items FROM public.quotes_packaging_items pi WHERE pi.quote_id = tk.doc_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'transporters', (SELECT jsonb_build_object('name', tr.name, 'phone', tr.phone, 'address', tr.address)
                                FROM public.transporters tr WHERE tr.id = t.transporter_id),
             'destinations', (SELECT jsonb_build_object('name', d.name)
                                FROM public.destinations d WHERE d.id = t.destination_id)
           )), '[]'::jsonb)
      INTO v_transports FROM public.quote_transports t WHERE t.quote_id = tk.doc_id;

  -- ===================== مرتجع =====================
  ELSIF tk.doc_type = 'return' THEN
    SELECT to_jsonb(r.*), r.customer_id, COALESCE(r.created_at, r.date::timestamptz)
      INTO v_doc, v_customer_id, v_doc_at
      FROM public.stock_returns r WHERE r.id = tk.doc_id;
    IF v_doc IS NULL THEN RETURN jsonb_build_object('error', 'doc_missing'); END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(it.*) ORDER BY it.created_at), '[]'::jsonb)
      INTO v_items FROM public.stock_return_items it WHERE it.stock_return_id = tk.doc_id;

  ELSE
    RETURN jsonb_build_object('error', 'unsupported_type');
  END IF;

  -- ===================== العميل وحسابه =====================
  IF v_customer_id IS NOT NULL THEN
    SELECT jsonb_build_object('name', c.name, 'phone', c.phone,
                              'address', c.address, 'email', c.email)
      INTO v_customer FROM public.customers c WHERE c.id = v_customer_id;

    SELECT COALESCE(c.balance, 0) - COALESCE(c.credit_balance, 0)
      INTO v_current_net FROM public.customers c WHERE c.id = v_customer_id;

    /*
     * صافي الحساب **قبل** هذا المستند — نفس قاعدة `customerNetBefore.ts`.
     *
     * زوجُ السداد من الرصيد (`customer_credit` سالب + دفعة `credit_balance`)
     * أثره صفر. ولا نستثنيهما فرداً فرداً: جمعُ قيود `customer_credit`
     * **بإشارتها** مع كل الدفعات يُلغي الزوج حسابياً — والنتيجة واحدة بلا
     * مطابقةٍ هشّة بين صفَّين.
     *
     * وحركات هذا المستند نفسه تُستثنى: دفعةٌ عليه لا تسبق إنشاءه مهما قال
     * الطابع الزمني — وكثيرٌ من القيود بتاريخٍ بلا وقت فيُعامَل كبداية اليوم.
     */
    IF tk.doc_type = 'invoice' THEN
      SELECT
        COALESCE((SELECT SUM(i.total) FROM public.invoices i
                   WHERE i.customer_id = v_customer_id
                     AND COALESCE(i.status, '') <> 'cancelled'
                     AND COALESCE(i.created_at, i.date::timestamptz) < v_doc_at), 0)
      - COALESCE((SELECT SUM(t.amount) FROM public.transactions t
                   WHERE t.customer_id = v_customer_id
                     AND t.category = 'customer_credit'
                     AND COALESCE(t.reference_id, '') <> tk.doc_id::text
                     AND COALESCE(t.created_at, t.date::timestamptz) < v_doc_at), 0)
      - COALESCE((SELECT SUM(ABS(t.amount)) FROM public.transactions t
                   WHERE t.customer_id = v_customer_id
                     AND t.category = 'customer_payment'
                     AND COALESCE(t.reference_id, '') <> tk.doc_id::text
                     AND COALESCE(t.created_at, t.date::timestamptz) < v_doc_at), 0)
        INTO v_prev_net;
    ELSE
      -- عرض السعر لا يدخل الحساب: رصيد العميل يُعرض كما هو قبله وبعده.
      v_prev_net := v_current_net;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'doc_type',        tk.doc_type,
    'hidden_sections', COALESCE(tk.hidden_sections, '[]'::jsonb),
    'doc',             v_doc,
    'items',           COALESCE(v_items, '[]'::jsonb),
    'customer',        v_customer,
    'company',         v_company,
    'packaging',       COALESCE(v_packaging, '[]'::jsonb),
    'packaging_items', COALESCE(v_pkg_items, '[]'::jsonb),
    'transports',      COALESCE(v_transports, '[]'::jsonb),
    'prev_net',        COALESCE(v_prev_net, 0),
    'current_net',     COALESCE(v_current_net, 0)
  );
END;
$$;

-- القارئ بلا حساب هو المقصود — والتوكن وحده مفتاحه.
REVOKE ALL ON FUNCTION public.get_shared_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_document(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_shared_document(text) IS
  'بيانات مستندٍ مشترَك بتوكنه — يبني منها التطبيق ورقةَ العميل بنفس قالب الطباعة.';