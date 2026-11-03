CREATE OR REPLACE FUNCTION public.is_premium_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) = '0744f173-3f36-438f-b265-9cb3be95ad78'::uuid;
$function$;

REVOKE ALL ON FUNCTION public.is_premium_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_premium_admin() TO authenticated, service_role;
