-- Override broad default grants on these new tables.
-- Custody ledger and audit events are append-only for the Edge Function service role.
REVOKE ALL ON TABLE public.fragment_listings, public.fragment_orders,
  public.fragment_order_funds, public.fragment_order_events,
  public.fragment_catalog_sync_runs FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.fragment_listings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fragment_orders TO service_role;
GRANT SELECT, INSERT ON TABLE public.fragment_order_funds TO service_role;
GRANT SELECT, INSERT ON TABLE public.fragment_order_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fragment_catalog_sync_runs TO service_role;

REVOKE ALL ON SEQUENCE public.fragment_order_funds_id_seq,
  public.fragment_order_events_id_seq,
  public.fragment_catalog_sync_runs_id_seq FROM anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fragment_order_funds_id_seq,
  public.fragment_order_events_id_seq,
  public.fragment_catalog_sync_runs_id_seq TO service_role;
