-- Keep the reserve liability ledger append/update-only for server processing.
-- The table owner remains the only role with DDL/ownership capabilities.
REVOKE ALL ON TABLE public.marketplace_processing_reserves
  FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.marketplace_processing_reserves
  TO service_role;
