# Marketplace V3 — mainnet readiness gates

Status: **NOT APPROVED FOR MAINNET**. This is a testnet-only evidence register, not an audit certificate.

## Verified evidence

- Three V3 production contracts (ReserveVaultV3, ReserveCoordinatorV3, MarketplaceReserveV3) and NFT Escrow V2 have been deployed and exercised on testnet.
- The original funded testnet purchase was **order 1 / product 2**. Buyer NFT ownership and the Vault's reported paid status (0.2 TON, no in-flight or available principal) passed the separate read-only on-chain check: [run 42440134342](https://github.com/jill0010/ton-marketplace/actions/runs/42440134342).
- Contract emulator regression tests include wrong-order and duplicate refund dispatch, settlement callback replay, reserve top-up/retry bounds, validator quorum, expiry, and cross-statement signature reuse. CI success establishes these tested cases, **not** exhaustive security or actual recipient credit.
- Historical funded deployment/purchase workflow is blocked. Do not reactivate or repeat order 1.

## Blocking gates

1. **Independent recipient finality (OPEN).** Obtain chain transaction/message evidence showing actual buyer receipt of 0.2 TON and seller/platform credits. For each transfer record: source contract, recipient, amount, dispatch transaction hash/LT, outbound message hash, recipient inbound transaction hash/LT, success/abort flags, and any bounce. Reconcile the amounts against order 1. Contract-side `dispatched` and Vault `paid` are insufficient by themselves.
2. **Accounting invariants and adversarial review (OPEN).** Review reserve principal isolation, failure compensation, rich-bounce authenticity, callback replay, cross-order isolation, exact-value checks, gas exhaustion, idempotency and authorization. Add emulator tests for any uncovered high-risk path.
3. **Operational readiness (OPEN).** Confirm emergency pause/recovery, key custody, least-privilege access, monitoring, alerts, RPC failure handling and rollback procedure.
4. **Independent security review (OPEN).** Obtain review of deployed bytecode hashes versus reviewed sources and resolve critical/high findings.
5. **Release decision (BLOCKED).** Mainnet deployment requires a fresh explicit authorization after all preceding gates are evidenced. No mainnet transaction is permitted under the current instruction.

## Evidence integrity

- Read-only checks must never sign, send messages, fund wallets, redeploy contracts, or create a second funded purchase.
- Do not infer recipient receipt from outbound messages, account balance deltas alone, or a contract getter.
- Record each check's UTC timestamp, network, immutable transaction hashes and source of RPC data.
- If data are missing, contradictory, or incomplete, report **UNVERIFIED**, not PASS.

## Independent historical transfer audit

The manual workflow `.github/workflows/discover-v3-testnet-transfers-readonly.yml` now invokes `scripts/audit-v3-historical-transfer.mjs` and requires public testnet source, recipient and exact nanotons. It discovers a unique successful outbound message and checks the corresponding recipient inbound transaction using bounded paginated public testnet GET queries. A missing, ambiguous or incomplete history is **UNVERIFIED**. This is a per-transfer check, not proof of all order-1 payouts; each buyer/seller/platform transfer must be audited separately. No wallet secrets, signatures, or new purchases are needed.

## Current disposition

**Testnet purchase exercised; independent settlement finality unverified; mainnet blocked.**
