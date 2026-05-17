
-- 1) Prevent paid_amount > total on invoices
CREATE OR REPLACE FUNCTION public.validate_invoice_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.paid_amount, 0) > COALESCE(NEW.total, 0) + 0.01 THEN
    RAISE EXCEPTION 'المبلغ المدفوع (%) لا يمكن أن يتجاوز إجمالي الفاتورة (%). الفائض يجب تسجيله كرصيد دائن للعميل.',
      NEW.paid_amount, NEW.total
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_payment ON public.invoices;
CREATE TRIGGER trg_validate_invoice_payment
BEFORE INSERT OR UPDATE OF paid_amount, total ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_payment();

-- 2) Prevent negative stock on products
CREATE OR REPLACE FUNCTION public.validate_product_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.stock_quantity, 0) < 0 THEN
    RAISE EXCEPTION 'كمية المخزون لا يمكن أن تكون سالبة (%) للمنتج %', NEW.stock_quantity, NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_stock ON public.products;
CREATE TRIGGER trg_validate_product_stock
BEFORE INSERT OR UPDATE OF stock_quantity ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_product_stock();

-- 3) Prevent confirming an invoice (workflow_status != 'preparing') with total>0 and no items
CREATE OR REPLACE FUNCTION public.validate_invoice_has_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only enforce when leaving the preparing stage with a non-zero total
  IF COALESCE(NEW.workflow_status, 'preparing') <> 'preparing'
     AND COALESCE(NEW.total, 0) > 0 THEN
    SELECT COUNT(*) INTO v_count FROM public.invoice_items WHERE invoice_id = NEW.id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'لا يمكن تأكيد فاتورة (% ) بإجمالي % بدون أي بنود.',
        NEW.invoice_number, NEW.total
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_has_items ON public.invoices;
CREATE TRIGGER trg_validate_invoice_has_items
BEFORE UPDATE OF workflow_status, total ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_has_items();

-- 4) Block deleting the last item of a confirmed invoice (workflow_status != 'preparing')
CREATE OR REPLACE FUNCTION public.guard_invoice_items_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_total numeric;
  v_remaining integer;
BEGIN
  SELECT workflow_status, total INTO v_status, v_total
  FROM public.invoices WHERE id = OLD.invoice_id;
  IF v_status IS NULL THEN
    RETURN OLD; -- invoice already deleted (cascade)
  END IF;
  IF v_status <> 'preparing' AND COALESCE(v_total,0) > 0 THEN
    SELECT COUNT(*) INTO v_remaining FROM public.invoice_items
      WHERE invoice_id = OLD.invoice_id AND id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'لا يمكن حذف آخر بند من فاتورة مؤكَّدة. أعِد الفاتورة إلى وضع التحضير أولاً.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_items_delete ON public.invoice_items;
CREATE TRIGGER trg_guard_invoice_items_delete
BEFORE DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_items_delete();
