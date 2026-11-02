-- Canonical TON wallet identity binding.
-- Additive only: legacy public.ton_verified_wallets rows remain untouched.
-- Edge Functions must be deployed only after this migration is installed and verified.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.wallet_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network = '-239'),
  raw_address text NOT NULL
    CHECK (raw_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_identities_network_raw_address_key
    UNIQUE (network, raw_address)
);

CREATE TABLE IF NOT EXISTS private.wallet_identity_sessions (
  auth_user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_identity_id uuid NOT NULL
    REFERENCES private.wallet_identities(id) ON DELETE RESTRICT,
  proof_verified_at timestamptz NOT NULL,
  proof_expires_at timestamptz NOT NULL,
  wallet_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_identity_sessions_expiry_check
    CHECK (proof_expires_at > proof_verified_at)
);

CREATE INDEX IF NOT EXISTS wallet_identity_sessions_identity_idx
  ON private.wallet_identity_sessions (wallet_identity_id);

ALTER TABLE private.wallet_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.wallet_identity_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.wallet_identities
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.wallet_identity_sessions
  FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE private.wallet_identities TO service_role;
GRANT ALL ON TABLE private.wallet_identity_sessions TO service_role;

COMMENT ON TABLE private.wallet_identities IS
  'Canonical TON wallet identity independent of Supabase anonymous Auth sessions.';
COMMENT ON TABLE private.wallet_identity_sessions IS
  'Maps an authenticated Supabase session UUID to its TON-Proof-verified canonical wallet identity.';

-- Consume the one-time challenge and bind the verified wallet in one transaction.
CREATE OR REPLACE FUNCTION public.bind_verified_ton_wallet_identity(
  p_payload text,
  p_attempt_id uuid,
  p_now bigint,
  p_network text,
  p_raw_address text,
  p_wallet_version text,
  p_verified_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_consumed_payload text;
  v_wallet_identity_id uuid;
BEGIN
  IF p_payload IS NULL OR p_attempt_id IS NULL OR p_now IS NULL THEN
    RAISE EXCEPTION 'Missing TON Proof challenge binding';
  END IF;

  IF p_network IS DISTINCT FROM '-239' THEN
    RAISE EXCEPTION 'Unsupported TON network';
  END IF;

  IF p_raw_address IS NULL OR p_raw_address !~ '^0:[0-9a-f]{64}    RAISE EXCEPTION 'Invalid canonical TON raw address';
  END IF;

  IF p_wallet_version IS NULL OR p_wallet_version NOT IN (
    'V1R1', 'V1R2', 'V1R3', 'V2R1', 'V2R2',
    'V3R1', 'V3R2', 'V4R2', 'V5R1'
  ) THEN
    RAISE EXCEPTION 'Unsupported TON wallet version';
  END IF;

  IF p_verified_at IS NULL OR p_verified_at > pg_catalog.now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid proof verification timestamp';
  END IF;

  DELETE FROM public.ton_proof_challenges
  WHERE payload = p_payload
    AND attempt_id = p_attempt_id
    AND expires_at > p_now
  RETURNING payload INTO v_consumed_payload;

  IF v_consumed_payload IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO private.wallet_identities (network, raw_address)
  VALUES (p_network, p_raw_address)
  ON CONFLICT (network, raw_address)
  DO UPDATE SET raw_address = EXCLUDED.raw_address
  RETURNING id INTO v_wallet_identity_id;

  INSERT INTO private.wallet_identity_sessions (
    auth_user_id,
    wallet_identity_id,
    proof_verified_at,
    proof_expires_at,
    wallet_version,
    updated_at
  )
  VALUES (
    p_attempt_id,
    v_wallet_identity_id,
    p_verified_at,
    p_verified_at + interval '10 minutes',
    p_wallet_version,
    pg_catalog.now()
  )
  ON CONFLICT (auth_user_id)
  DO UPDATE SET
    wallet_identity_id = EXCLUDED.wallet_identity_id,
    proof_verified_at = EXCLUDED.proof_verified_at,
    proof_expires_at = EXCLUDED.proof_expires_at,
    wallet_version = EXCLUDED.wallet_version,
    updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_ton_wallet_identity(
  p_auth_user_id uuid
)
RETURNS TABLE (
  wallet_identity_id uuid,
  wallet_address text,
  network text,
  wallet_version text,
  verified_at timestamptz
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
    wis.proof_verified_at
  FROM private.wallet_identity_sessions AS wis
  JOIN private.wallet_identities AS wi
    ON wi.id = wis.wallet_identity_id
  WHERE wis.auth_user_id = p_auth_user_id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  TO service_role;

COMMIT;
 THEN
    RAISE EXCEPTION 'Invalid canonical TON raw address';
  END IF;

  IF p_wallet_version NOT IN (
    'V1R1', 'V1R2', 'V1R3', 'V2R1', 'V2R2',
    'V3R1', 'V3R2', 'V4R2', 'V5R1'
  ) THEN
    RAISE EXCEPTION 'Unsupported TON wallet version';
  END IF;

  IF p_verified_at IS NULL OR p_verified_at > pg_catalog.now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid proof verification timestamp';
  END IF;

  DELETE FROM public.ton_proof_challenges
  WHERE payload = p_payload
    AND attempt_id = p_attempt_id
    AND expires_at > p_now
  RETURNING payload INTO v_consumed_payload;

  IF v_consumed_payload IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO private.wallet_identities (network, raw_address)
  VALUES (p_network, p_raw_address)
  ON CONFLICT (network, raw_address)
  DO UPDATE SET raw_address = EXCLUDED.raw_address
  RETURNING id INTO v_wallet_identity_id;

  INSERT INTO private.wallet_identity_sessions (
    auth_user_id,
    wallet_identity_id,
    proof_verified_at,
    proof_expires_at,
    wallet_version,
    updated_at
  )
  VALUES (
    p_attempt_id,
    v_wallet_identity_id,
    p_verified_at,
    p_verified_at + interval '10 minutes',
    p_wallet_version,
    pg_catalog.now()
  )
  ON CONFLICT (auth_user_id)
  DO UPDATE SET
    wallet_identity_id = EXCLUDED.wallet_identity_id,
    proof_verified_at = EXCLUDED.proof_verified_at,
    proof_expires_at = EXCLUDED.proof_expires_at,
    wallet_version = EXCLUDED.wallet_version,
    updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_ton_wallet_identity(
  p_auth_user_id uuid
)
RETURNS TABLE (
  wallet_address text,
  network text,
  wallet_version text,
  verified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    wi.raw_address,
    wi.network,
    wis.wallet_version,
    wis.proof_verified_at
  FROM private.wallet_identity_sessions AS wis
  JOIN private.wallet_identities AS wi
    ON wi.id = wis.wallet_identity_id
  WHERE wis.auth_user_id = p_auth_user_id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  TO service_role;

COMMIT;
 THEN
    RAISE EXCEPTION 'Invalid canonical TON raw address';
  END IF;

  IF p_wallet_version IS NULL OR p_wallet_version NOT IN (
    'V1R1', 'V1R2', 'V1R3', 'V2R1', 'V2R2',
    'V3R1', 'V3R2', 'V4R2', 'V5R1'
  ) THEN
    RAISE EXCEPTION 'Unsupported TON wallet version';
  END IF;

  IF p_verified_at IS NULL OR p_verified_at > pg_catalog.now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid proof verification timestamp';
  END IF;

  DELETE FROM public.ton_proof_challenges
  WHERE payload = p_payload
    AND attempt_id = p_attempt_id
    AND expires_at > p_now
  RETURNING payload INTO v_consumed_payload;

  IF v_consumed_payload IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO private.wallet_identities (network, raw_address)
  VALUES (p_network, p_raw_address)
  ON CONFLICT (network, raw_address)
  DO UPDATE SET raw_address = EXCLUDED.raw_address
  RETURNING id INTO v_wallet_identity_id;

  INSERT INTO private.wallet_identity_sessions (
    auth_user_id,
    wallet_identity_id,
    proof_verified_at,
    proof_expires_at,
    wallet_version,
    updated_at
  )
  VALUES (
    p_attempt_id,
    v_wallet_identity_id,
    p_verified_at,
    p_verified_at + interval '10 minutes',
    p_wallet_version,
    pg_catalog.now()
  )
  ON CONFLICT (auth_user_id)
  DO UPDATE SET
    wallet_identity_id = EXCLUDED.wallet_identity_id,
    proof_verified_at = EXCLUDED.proof_verified_at,
    proof_expires_at = EXCLUDED.proof_expires_at,
    wallet_version = EXCLUDED.wallet_version,
    updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_ton_wallet_identity(
  p_auth_user_id uuid
)
RETURNS TABLE (
  wallet_identity_id uuid,
  wallet_address text,
  network text,
  wallet_version text,
  verified_at timestamptz
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
    wis.proof_verified_at
  FROM private.wallet_identity_sessions AS wis
  JOIN private.wallet_identities AS wi
    ON wi.id = wis.wallet_identity_id
  WHERE wis.auth_user_id = p_auth_user_id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  TO service_role;

COMMIT;
 THEN
    RAISE EXCEPTION 'Invalid canonical TON raw address';
  END IF;

  IF p_wallet_version NOT IN (
    'V1R1', 'V1R2', 'V1R3', 'V2R1', 'V2R2',
    'V3R1', 'V3R2', 'V4R2', 'V5R1'
  ) THEN
    RAISE EXCEPTION 'Unsupported TON wallet version';
  END IF;

  IF p_verified_at IS NULL OR p_verified_at > pg_catalog.now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Invalid proof verification timestamp';
  END IF;

  DELETE FROM public.ton_proof_challenges
  WHERE payload = p_payload
    AND attempt_id = p_attempt_id
    AND expires_at > p_now
  RETURNING payload INTO v_consumed_payload;

  IF v_consumed_payload IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO private.wallet_identities (network, raw_address)
  VALUES (p_network, p_raw_address)
  ON CONFLICT (network, raw_address)
  DO UPDATE SET raw_address = EXCLUDED.raw_address
  RETURNING id INTO v_wallet_identity_id;

  INSERT INTO private.wallet_identity_sessions (
    auth_user_id,
    wallet_identity_id,
    proof_verified_at,
    proof_expires_at,
    wallet_version,
    updated_at
  )
  VALUES (
    p_attempt_id,
    v_wallet_identity_id,
    p_verified_at,
    p_verified_at + interval '10 minutes',
    p_wallet_version,
    pg_catalog.now()
  )
  ON CONFLICT (auth_user_id)
  DO UPDATE SET
    wallet_identity_id = EXCLUDED.wallet_identity_id,
    proof_verified_at = EXCLUDED.proof_verified_at,
    proof_expires_at = EXCLUDED.proof_expires_at,
    wallet_version = EXCLUDED.wallet_version,
    updated_at = EXCLUDED.updated_at;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_current_ton_wallet_identity(
  p_auth_user_id uuid
)
RETURNS TABLE (
  wallet_address text,
  network text,
  wallet_version text,
  verified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    wi.raw_address,
    wi.network,
    wis.wallet_version,
    wis.proof_verified_at
  FROM private.wallet_identity_sessions AS wis
  JOIN private.wallet_identities AS wi
    ON wi.id = wis.wallet_identity_id
  WHERE wis.auth_user_id = p_auth_user_id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_verified_ton_wallet_identity(
  text, uuid, bigint, text, text, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_ton_wallet_identity(uuid)
  TO service_role;

COMMIT;
