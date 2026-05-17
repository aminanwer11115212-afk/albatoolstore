-- Function: check if a given user is allowed to log in
CREATE OR REPLACE FUNCTION public.is_login_allowed(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_allowed boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = _user_id;

  -- Master admin always allowed
  IF lower(coalesce(v_email,'')) = 'aminanwer11115212@gmail.com' THEN
    RETURN true;
  END IF;

  -- Otherwise must have an active employee row with login enabled
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = _user_id
      AND login_enabled = true
      AND coalesce(status,'active') = 'active'
  ) INTO v_allowed;

  RETURN v_allowed;
END;
$$;

-- Function: returns status string for the currently authenticated user
-- Values: 'allowed' | 'pending' | 'disabled' | 'no_account'
CREATE OR REPLACE FUNCTION public.current_user_login_status()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_emp record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'no_account';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF lower(coalesce(v_email,'')) = 'aminanwer11115212@gmail.com' THEN
    RETURN 'allowed';
  END IF;

  SELECT login_enabled, status INTO v_emp
  FROM public.employees WHERE user_id = v_uid LIMIT 1;

  IF v_emp IS NULL THEN
    RETURN 'pending';
  END IF;

  IF v_emp.login_enabled = true AND coalesce(v_emp.status,'active') = 'active' THEN
    RETURN 'allowed';
  END IF;

  IF coalesce(v_emp.status,'active') <> 'active' THEN
    RETURN 'disabled';
  END IF;

  RETURN 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_login_allowed(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_login_status() TO authenticated;