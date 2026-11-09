# TON Marketplace — Fixed Master Roadmap v1.0

**Canonical GitHub tracker:** https://github.com/jill0010/ton-marketplace/issues/7

## Immutable numbering policy
The stages below and their numeric IDs are permanent. Never remove, reorder or renumber S01–S10. A discovered problem only adds a new `SNN-P###` child under its owning stage; fix and verify it before returning to its parent stage. Never reuse resolved child identifiers. Every progress update must reproduce all ten stages and unresolved child issues, grounded in CI, code, chain receipts and live deployment evidence. A passing CI build alone is not production acceptance.

| Stage | Permanent deliverable | Baseline (2026-11-09) |
|---|---|---|
| S01 | Repository and contract architecture reconciliation | In progress |
| S02 | Frontend catalog, localization, TON Connect and portfolio | Partial |
| S03 | Supabase backend, NFT provenance, orders, access control | Partial |
| S04 | Full V3 Testnet custody, purchase, delivery, settlement and reserve refund | In progress (normal live Testnet transaction path: PASSED) |
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
- S05-P002 — Pin and verify release candidate bytecode lineage and independent audit: https://github.com/jill0010/ton-marketplace/issues/9 .
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

## Progress update — 2026-11-09
- `0e59b8f`: added ten negative V3 preflight regression cases; frontend build, V3 release safety and read-only mainnet readiness all passed for this commit.
- Readiness Actions https://github.com/jill0010/ton-marketplace/actions/runs/42499582209: contract and frontend jobs both passed, including pinned candidate formatter; a stale comment about formatter debt was corrected in `72c8485` without changing contract bytecode.
- S05-P002 remains open for independently verified code-hash lineage and external audit. Green CI is not Mainnet authorization.

## S04 normal Testnet transaction path acceptance — 2026-11-09
- **Status: PASSED** for the normal real-Testnet purchase → NFT delivery → seller/platform payout receipts → reserve refund → final settlement path. This is a sub-scope acceptance; overall S04 remains **In progress** pending failure-path and actual-cost deduction evidence under S04-P001.
- Product 5 / Order 4, price 0.01 TON, reserve 0.2 TON. One-time funded purchase and read-only ownership/payout/reserve verification: https://github.com/jill0010/ton-marketplace/actions/runs/42581684675 (success; 16-transaction trace; Vault `kQDrxaB01_yBZoQK63K3yRxJpBmI92ylQn4qSy8bGCnlQFOU`).
- Existing Order 4 final settlement attestation: https://github.com/jill0010/ton-marketplace/actions/runs/42585212607 (success; buyer/seller/platform transaction receipt checks; `vaultStatus=3`, `paidNano=200000000`).
- **Never replay** Product 5 funded purchase or Order 4 settlement. The normal-path proof does not establish an actual-cost-deducted partial refund or all failure/recovery branches; preserve S04-P001 for those remaining checks. No Mainnet authorization implied.

## S04-P001 residual failure-refund / actual-cost acceptance audit — 2026-11-09
- **Normal-path accepted, residual S04-P001 OPEN; overall S04 not closed.** Successful funded Product 5 / Order 4 and 3/3 final attestation are recorded above. Never replay either.
- Inspected `contracts/marketplace/contracts/ReserveVaultV3.tolk` on `feature/reserve-refund-v3-audit`. The deployed V3 design accounts for `principal=0.2 TON` separately from `operationalBudget`; `dispatchReserveRefundV3` dispatches the full available principal and uses `SEND_MODE_PAY_FEES_SEPARATELY`. Hence an observed full 0.2 TON refund is **not** evidence of a principal-minus-actual-cost partial refund.
- Bounce handling explicitly does **not** restore principal without quorum-verified evidence. The verifier's `outcome=2` can move a proven returned amount into `available` with status 4, requiring exact principal top-up before another dispatch; `RetryReserveRefundV3` is limited to one retry. These are code-level controls, **not** proof that a real on-chain bounced-refund / top-up / retry sequence was executed and reconciled.
- **Remaining acceptance gates:** (1) independently verifiable Testnet failure/bounce trace with exact order, buyer, operation, query, message and return-value linkage; (2) on-chain status and actual buyer credit / retry outcome with no duplicate payout; (3) a reconciled fee budget and documented actual-cost policy, with evidence of the expected net refund if deduction from principal is required, or explicit confirmation that V3 refunds full principal and charges fees separately; (4) artifacts and read-only postflight confirmation. Do not mark S04 complete on unit tests or successful normal-path CI alone.
- **No funds moved by this audit.** No new funded workflow or previously settled order was replayed. Mainnet remains blocked.
