-- Integration tests for 20261103152324_add_canonical_ton_wallet_identity.sql
\set ON_ERROR_STOP on

INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

-- Two independent anonymous Auth sessions proving the same wallet must resolve
-- to exactly one canonical wallet identity.
INSERT INTO public.ton_proof_challenges (payload, expires_at, attempt_id)
VALUES
  (repeat('a', 64), floor(extract(epoch FROM now()))::bigint + 300, '00000000-0000-0000-0000-000000000001'),
  (repeat('b', 64), floor(extract(epoch FROM now()))::bigint + 300, '00000000-0000-0000-0000-000000000002');

DO $test_same_wallet$
DECLARE
  v_first boolean;
  v_second boolean;
  v_identity_count integer;
  v_session_count integer;
  v_distinct_identity_count integer;
BEGIN
  SELECT public.bind_verified_ton_wallet_identity(
    repeat('a', 64), '00000000-0000-0000-0000-000000000001',
    floor(extract(epoch FROM now()))::bigint, '-239',
    '0:' || repeat('a', 64), 'V4R2', now()
  ) INTO v_first;

  SELECT public.bind_verified_ton_wallet_identity(
    repeat('b', 64), '00000000-0000-0000-0000-000000000002',
    floor(extract(epoch FROM now()))::bigint, '-239',
    '0:' || repeat('a', 64), 'V4R2', now()
  ) INTO v_second;

  SELECT count(*) INTO v_identity_count
  FROM private.wallet_identities
  WHERE network = '-239' AND raw_address = '0:' || repeat('a', 64);

  SELECT count(*) INTO v_session_count
  FROM private.wallet_identity_sessions
  WHERE auth_user_id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );

  SELECT count(DISTINCT wallet_identity_id) INTO v_distinct_identity_count
  FROM private.wallet_identity_sessions
  WHERE auth_user_id IN (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002'
  );

  IF NOT v_first OR NOT v_second
     OR v_identity_count <> 1
     OR v_session_count <> 2
     OR v_distinct_identity_count <> 1 THEN
    RAISE EXCEPTION 'Same-wallet multi-session identity test failed';
  END IF;
END
$test_same_wallet$;

-- A challenge can only be consumed once.
DO $test_replay$
DECLARE
  v_result boolean;
BEGIN
  SELECT public.bind_verified_ton_wallet_identity(
    repeat('a', 64), '00000000-0000-0000-0000-000000000001',
    floor(extract(epoch FROM now()))::bigint, '-239',
    '0:' || repeat('a', 64), 'V4R2', now()
  ) INTO v_result;

  IF v_result THEN
    RAISE EXCEPTION 'Replayed challenge was accepted';
  END IF;
END
$test_replay$;

-- Invalid data must fail before challenge consumption.
INSERT INTO public.ton_proof_challenges (payload, expires_at, attempt_id)
VALUES (repeat('c', 64), floor(extract(epoch FROM now()))::bigint + 300,
        '00000000-0000-0000-0000-000000000003');

DO $test_invalid_network$
BEGIN
  BEGIN
    PERFORM public.bind_verified_ton_wallet_identity(
      repeat('c', 64), '00000000-0000-0000-0000-000000000003',
      floor(extract(epoch FROM now()))::bigint, '-3',
      '0:' || repeat('c', 64), 'V4R2', now()
    );
    RAISE EXCEPTION 'Invalid network unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Invalid network unexpectedly accepted' THEN
      RAISE;
    END IF;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.ton_proof_challenges
    WHERE payload = repeat('c', 64)
  ) THEN
    RAISE EXCEPTION 'Invalid network consumed its challenge';
  END IF;
END
$test_invalid_network$;

-- Session rebinding changes only the current Auth session's wallet mapping.
INSERT INTO public.ton_proof_challenges (payload, expires_at, attempt_id)
VALUES (repeat('d', 64), floor(extract(epoch FROM now()))::bigint + 300,
        '00000000-0000-0000-0000-000000000001');

DO $test_rebind$
DECLARE
  v_old_identity uuid;
  v_new_identity uuid;
  v_other_session_identity uuid;
BEGIN
  SELECT wallet_identity_id INTO v_old_identity
  FROM private.wallet_identity_sessions
  WHERE auth_user_id = '00000000-0000-0000-0000-000000000001';

  PERFORM public.bind_verified_ton_wallet_identity(
    repeat('d', 64), '00000000-0000-0000-0000-000000000001',
    floor(extract(epoch FROM now()))::bigint, '-239',
    '0:' || repeat('b', 64), 'V4R2', now()
  );

  SELECT wallet_identity_id INTO v_new_identity
  FROM private.wallet_identity_sessions
  WHERE auth_user_id = '00000000-0000-0000-0000-000000000001';

  SELECT wallet_identity_id INTO v_other_session_identity
  FROM private.wallet_identity_sessions
  WHERE auth_user_id = '00000000-0000-0000-0000-000000000002';

  IF v_old_identity = v_new_identity
     OR v_new_identity = v_other_session_identity THEN
    RAISE EXCEPTION 'Session rebind affected wrong wallet identity';
  END IF;
END
$test_rebind$;

-- Expired TON Proof bindings remain visible to trusted consumers as expired,
-- preventing an expired canonical session from falling back to a legacy wallet row.
INSERT INTO public.ton_proof_challenges (payload, expires_at, attempt_id)
VALUES (repeat('e', 64), floor(extract(epoch FROM now()))::bigint + 300,
        '00000000-0000-0000-0000-000000000004');

DO $test_expired_proof$
DECLARE
  v_expiry timestamptz;
BEGIN
  PERFORM public.bind_verified_ton_wallet_identity(
    repeat('e', 64), '00000000-0000-0000-0000-000000000004',
    floor(extract(epoch FROM now()))::bigint, '-239',
    '0:' || repeat('e', 64), 'V4R2', now() - interval '11 minutes'
  );

  SELECT proof_expires_at INTO v_expiry
  FROM public.get_current_ton_wallet_identity(
    '00000000-0000-0000-0000-000000000004'
  );

  IF v_expiry IS NULL OR v_expiry > now() THEN
    RAISE EXCEPTION 'Expired TON Proof binding was not reported as expired';
  END IF;
END
$test_expired_proof$;

-- Only the server role may execute the public RPCs; browser roles must not.
DO $test_acl$
BEGIN
  IF NOT has_function_privilege(
    'service_role',
    'public.bind_verified_ton_wallet_identity(text,uuid,bigint,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute bind RPC';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.bind_verified_ton_wallet_identity(text,uuid,bigint,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.bind_verified_ton_wallet_identity(text,uuid,bigint,text,text,text,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Browser role can execute bind RPC';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.get_current_ton_wallet_identity(uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.get_current_ton_wallet_identity(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Browser role can execute identity lookup RPC';
  END IF;
END
$test_acl$;

-- Ensure direct table access is not granted to browser roles.
DO $test_table_acl$
BEGIN
  IF has_table_privilege('anon', 'private.wallet_identities', 'SELECT')
     OR has_table_privilege('authenticated', 'private.wallet_identities', 'SELECT')
     OR has_table_privilege('anon', 'private.wallet_identity_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'private.wallet_identity_sessions', 'SELECT') THEN
    RAISE EXCEPTION 'Browser role can read private wallet identity tables';
  END IF;
END
$test_table_acl$;

\echo 'Canonical wallet identity integration tests passed.'
