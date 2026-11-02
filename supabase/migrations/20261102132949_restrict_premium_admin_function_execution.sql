-- Restrict direct invocation of the premium-admin predicate.
-- RLS policies still evaluate this function for authenticated requests.
-- Anonymous callers do not need to invoke it directly.
REVOKE EXECUTE ON FUNCTION public.is_premium_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_premium_admin() TO authenticated, service_role;
