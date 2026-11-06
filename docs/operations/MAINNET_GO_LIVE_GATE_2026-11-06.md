# TON Marketplace go-live gate — 2026-11-06

**Verdict at source-review time: NO-GO for real-money Marketplace V2 purchases.** This document records evidence, not a deployment authorization. No Mainnet transaction was signed or broadcast.

| Area | Evidence reviewed | Status / release gate |
|---|---|---|
| Frontend build | `.github/workflows/frontend-build.yml` runs `npm ci`, production dependency audit, Deno checks/tests and `npm run build`. Manual `workflow_dispatch` now available. | **UNVERIFIED** on latest head until an actual Actions run succeeds. |
| Contracts | `.github/workflows/contracts.yml` builds, tests, lints and formats Acton contracts; separate Mainnet workflow is explicitly read-only preflight. | **UNVERIFIED** on latest head; exact deployed code hashes and target addresses require verification. |
| Wallet | Frontend depends on TON Connect. | **UNVERIFIED** end-to-end with real supported wallets; wallet connection alone is not transaction settlement. |
| NFT listing / custody | MarketplaceV2 and NFTEscrowV2 contain listing, custody and transfer handlers. | **UNVERIFIED** against exact Mainnet Fragment NFT Item code and full custody handoff. |
| Buyer checkout | `scripts/check-marketplace-v2-customer-purchase-policy.mjs` requires visible **Escrow checkout (Coming Soon)** and forbids the V2 purchase transaction dispatch from the product page. | **BLOCKED BY DESIGN**. Do not claim live buyer checkout. |
| Payment proof | `admin-verify-marketplace-v2-payment` checks buyer root, complete trace and immutable order, but returns `persisted:false`. | **READ-ONLY ONLY**. Endpoint is not deployed and depends on deployed V2 getters. |
| Order indexing | Verified per-order reserve ledger table exists, but no verified row-populating production indexer is established by this review. | **BLOCKED**. No automatic paid-order lifecycle proof. |
| NFT delivery and payouts | V2 contracts have release, callback, payout and bounce/retry handlers. | **UNVERIFIED** live, and the latest exact build/tests must pass. |
| 0.2 TON processing reserve | Source-level value-flow audit in `MARKETPLACE_V2_PROCESSING_RESERVE_RECONCILIATION.md`; preview always returns `refundableNano:null`. | **BLOCKED**. Scheme C cannot safely refund unspent reserve yet. |
| Failed delivery / compensation | V2 contracts contain NFT return and gross-price buyer refund paths. | **UNVERIFIED** for terminal settlement and reserve refund. |
| Telegram Premium / USDT / GRAM | Separate customer-facing payment paths exist in project history. | **NOT VERIFIED IN THIS AUDIT**; payment settlement, token/chain identity, admin notification and delivery require dedicated tests. |
| Database / admin | Reserve ledger RLS and restricted grants are implemented in migrations; admin verifier checks a specific admin UID. | **PARTIALLY REVIEWED**; production permissions, secrets and Edge deployments need environment verification. |
| Cloudflare | Frontend is hosted at `ton-marketplace-cvj.pages.dev`. | **UNVERIFIED** latest commit production deployment, build logs and smoke tests. |

## Required before a real-money GO

1. Obtain a successful **latest-commit** frontend Actions run and contracts Actions run, plus independent environment-specific tests.
2. Confirm the deployed Marketplace and Escrow contract addresses, getters, source hashes, owner, treasury, NFT allowlist, network and wallet signing path. Do not infer deployment from CI.
3. Complete the wallet-authenticated listing → escrow custody → verified sale → NFT delivery → seller/platform settlement → failure compensation lifecycle in end-to-end tests and read-only Mainnet state checks.
4. Implement a trustworthy payment/order indexer, reconciliation and idempotent settlement state machine; protect against replay, double-spend, duplicate callbacks and partial traces.
5. Implement and prove per-order reserve accounting and one-time return of the unused 0.2 TON under scheme C, including bounced/retried refunds. Keep purchases disabled until this is proven.
6. Separately verify Premium/USDT/GRAM amounts, network/token identities, chain confirmations, admin notifications, manual delivery and refunds. Do not claim those flows live based on a frontend build.
7. Confirm Cloudflare deployment, Supabase Edge Function versions/secrets, production RLS, error reporting and operational monitoring.
8. Obtain explicit user approval of the **specific** Mainnet deployment or upgrade, wallet addresses, contract hashes and any transaction values before signing or broadcasting.

## Same-day delivery policy

Finish all safe code and test work that can be verified today. If any money-moving gate remains blocked, ship only the explicitly non-transactional frontend/preview features and retain the checkout safety gate. **Do not remove the gate to satisfy a calendar deadline.**
