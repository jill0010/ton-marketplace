DROP FUNCTION IF EXISTS public.get_current_ton_wallet_identity(uuid);
CREATE FUNCTION public.get_current_ton_wallet_identity(p_auth_user_id uuid)
RETURNS TABLE (
  wallet_identity_id uuid,
  wallet_address text,
  network text,
  wallet_version text,
  verified_at timestamptz,
  proof_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    wi.id,
    wi.raw_address,
    wi.network,
    wis.wallet_version,
    wis.proof_verified_at,
    wis.proof_expires_at
  FROM private.wallet_identity_sessions AS wis
  JOIN private.wallet_identities AS wi
    ON wi.id = wis.wallet_identity_id
  WHERE wis.auth_user_id = p_auth_user_id
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_current_ton_wallet_identity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_ton_wallet_identity(uuid) TO service_role;
