-- 1) إنشاء حساب المدير في نظام المصادقة
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'aminanwer11115212@gmail.com';
  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'aminanwer11115212@gmail.com', crypt('AMIN123456@', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      false, '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'aminanwer11115212@gmail.com', 'email_verified', true),
      'email', v_uid::text, now(), now(), now());
  END IF;

  -- ضمان دور admin
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- 2) دالة فحص حالة الدخول
CREATE OR REPLACE FUNCTION public.current_user_login_status()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_role boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN 'not_authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_uid) INTO v_has_role;
  IF v_has_role THEN RETURN 'allowed'; END IF;
  RETURN 'pending';
END $$;

GRANT EXECUTE ON FUNCTION public.current_user_login_status() TO authenticated, anon;