# TON Marketplace — Fixed Master Roadmap v1.0

**Canonical GitHub tracker:** https://github.com/jill0010/ton-marketplace/issues/7

## Immutable numbering policy
The stages below and their numeric IDs are permanent. Never remove, reorder or renumber S01–S10. A discovered problem only adds a new `SNN-P###` child under its owning stage; fix and verify it before returning to its parent stage. Never reuse resolved child identifiers. Every progress update must reproduce all ten stages and unresolved child issues, grounded in CI, code, chain receipts and live deployment evidence. A passing CI build alone is not production acceptance.

| Stage | Permanent deliverable | Baseline (2026-11-09) |
|---|---|---|
| S01 | Repository and contract architecture reconciliation | In progress |
| S02 | Frontend catalog, localization, TON Connect and portfolio | Partial |
| S03 | Supabase backend, NFT provenance, orders, access control | Partial |
| S04 | Full V3 Testnet custody, purchase, delivery, settlement and reserve refund | In progress |
| S05 | Security and financial safety audit, fault injection | Blocked |
| S06 | Customer wallet checkout, automatic lifecycle and observability | Blocked |
| S07 | Deployment configuration, monitoring, secrets and runbooks | Pending |
| S08 | Mainnet release sign-off and safe deployment | Blocked |
| S09 | Controlled Mainnet live trade and fund/NFT reconciliation | Pending |
| S10 | Routine operations, incident response and sustained reconciliation | Pending |

## Problem branches (initial)
- S01-P001 — Reconcile V2/V3 paths, PR #4/#5/#6 and Issue #3.
- S04-P001 — Complete fresh-order Testnet settlement, reserve refund and failure-path evidence without replaying settled orders.
- S05-P001 — Independent security review and failure/adversarial tests.
- S06-P001 — Customer-facing V3 checkout and ledger reconciliation, tracked at https://github.com/jill0010/ton-marketplace/issues/8 .
- S08-P001 — Outstanding Mainnet readiness and approval.

## Evidence
- Main head on inspection: `9ed99607fabf247b2532f475645f96f64e7e9922`.
- Main frontend build: https://github.com/jill0010/ton-marketplace/actions/runs/42485972976 (success).
- Testnet product-4 purchase: https://github.com/jill0010/ton-marketplace/actions/runs/42478799076 (success).
- Order-3 readonly settlement verification: https://github.com/jill0010/ton-marketplace/actions/runs/42480145497 (success).
- Mainnet release safety gate: https://github.com/jill0010/ton-marketplace/actions/runs/42481404231 (success **at preserving a block**, not approval to deploy).
- `scripts/check-v3-release-blockers.mjs` requires Mainnet V3 checkout to remain disabled.
- `docs/architecture/EXPERIMENTAL_V3_PURCHASE_RESERVE_GATE.md` explicitly calls its Test V3 fork simulation-only, not deployable; a passing Testnet deployment elsewhere must not be confused with this particular test fixture.

## Safety requirements
No Mainnet contract deployment, signing of real-money purchases, transfers of real NFTs, opening user checkout, or creation of production keys by this document. Mainnet activation requires a documented reviewed release, correct contract bytecode and configuration, independent audit, end-to-end test evidence, operational readiness, and explicit authorized go-live approval. Testnet-only read-only verification and code work should proceed first.
