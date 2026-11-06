# Marketplace V2 Processing Reserve Reconciliation

Status: read-only trace diagnostics implemented; refund amount calculation is intentionally blocked until per-order reserve funding can be proven. No mainnet transaction, deployment, or fund movement is performed by this feature.

## Approved economic rule

The buyer attaches the exact product gross price plus 0.2 TON. The 0.2 TON is a processing reserve, not platform revenue. Only actual, attributable processing costs may be retained. The remaining amount belongs to the buyer and must be returned after the purchase or compensation trace is complete.

For an order:

`refundable = max(0, 200000000 - attributableProcessingFees)`

All amounts are nanotons. If attributable processing fees exceed the reserve, refundable is zero and the order requires manual review; the shortfall must not be silently charged against seller proceeds or platform fee.

## Fee attribution

TON transaction fees include storage, compute, forwarding and action components. The diagnostic reader inspects the complete TON Center API v3 trace rooted at the buyer payment transaction and reports each transaction's `total_fees` only for:

- Marketplace V2 contract;
- NFT Escrow V2 contract;
- the exact NFT Item in the immutable order snapshot.

Buyer, seller and platform treasury wallet transaction fees are excluded because they are not processing-reserve expenses. Unknown accounts, duplicate transaction hashes, malformed fee values, incomplete traces, pending messages, a missing payment transaction, or missing Marketplace/Escrow transactions cause a fail-closed error.

The trace must have a completed masterchain sequence and zero pending messages. This is a read-only accounting preview. It is not sufficient by itself to prove the order's final business state or authorize a refund.

**Hard safety gate:** a TON trace proves the fees charged to the listed contract accounts during those transactions; it does not prove which fungible nanotons funded those fees. Marketplace and Escrow balances may contain pre-existing operational funds, storage fees may have accrued before the order, and the current contract sends fixed-value internal messages (including 0.05 TON release and 0.03 TON acknowledgement messages). These values are transfers, not proof of consumed fees or of the unused reserve remaining. The helper therefore returns only `observedContractFeesNano` and `feesByAccount`; it always returns `refundableNano: null`, `shortfallNano: null`, `status: manual_review_attribution_unproven`, and `attributionVerified: false`. No refund estimate is available until the protocol isolates per-order reserve liabilities, accounts for all Escrow excesses and returns, and reconciles the exact terminal reserve balance.

## Implemented components

- `supabase/migrations/20261106024206_add_marketplace_processing_reserve_ledger.sql`: additive per-order reserve ledger schema; legacy rows remain NULL/unclassified rather than being assumed to contain a 0.2 TON reserve.
- `supabase/migrations/20261106024422_lock_marketplace_processing_reserve_privileges.sql`: revokes default service-role table privileges and grants only SELECT, INSERT and UPDATE; no client roles can access the table.
- `supabase/functions/_shared/marketplace-processing-reserve.js`: pure read-only diagnostic of observed contract fees; deliberately does not calculate a buyer refund.
- `supabase/functions/_shared/marketplace-processing-reserve.test.mjs`: tests for observed contract fee totals, exclusion of buyer/seller/treasury wallet fees, incomplete traces, pending messages, wrong root transaction, unknown accounts, duplicate transactions, and the rule that pooled fees never create an inferred refund or shortfall.
- `supabase/functions/admin-preview-marketplace-processing-reserve/index.ts`: administrator-only, read-only diagnostic using TON Center API v3. It requires an indexed reserve-ledger row and cross-checks the order ID, chain order ID, buyer wallet, reserve amount and payment transaction hash. It does not update the database, calculate a refundable amount, sign a wallet message, call a send endpoint, or broadcast a transaction.
- `scripts/check-marketplace-v2-processing-reserve-ledger.mjs`: CI guard for the additive schema, per-order identity binding and service-role-only access.
- `MarketplaceV2.orderIdForProductV2(productId)`: new read-only getter and wrapper to resolve the immutable order ID from the product reservation; the indexer no longer needs to infer order IDs from transaction order.
- Frontend Build CI runs the fee reconciliation unit tests.

## Remaining implementation gates

1. Build and deploy a read-only chain indexer that verifies Marketplace V2 order snapshots and payment transaction hashes, then populates `marketplace_orders` and `marketplace_processing_reserves`. The current reserve diagnostic deliberately returns a conflict until this verified per-order row exists.
2. Add a versioned on-chain reserve-refund liability to Marketplace V2, including buyer beneficiary, exact order ID, one-time refund status, and a replay-protected operation/query ID.
3. Add a contract entrypoint that can dispatch only the exact reconciled refund amount to the buyer, only after the order's delivery or compensation state is terminal. It must not accept an arbitrary amount from a public caller.
4. Decide and implement the authorization/proof model for the measured trace fee. TON contracts cannot independently query an external indexer's trace database. The current preview is produced by TON Center API v3; it is not a cryptographic on-chain proof. The eventual refund dispatcher must therefore either:
   - require the Marketplace owner to review and sign the fee preview through the authorized wallet, with the signed amount and trace identity persisted on-chain; or
   - use a separately reviewed trust-minimized proof/oracle design.
5. Ensure unused reserve funds that remain at Escrow after NFT transfer/excess handling are returned or explicitly accounted for before calculating the buyer's final refund. Marketplace-only balance is not proof that all reserve funds have returned from Escrow.
6. Add emulator tests for exact one-time refund, duplicate/replay, wrong beneficiary, incomplete order, trace mismatch, fee above reserve, and refund dispatch bounce/retry.
7. Re-deploy the exact reviewed V2 source to Testnet and rehearse with the available test NFT fixtures. This is separate from Mainnet and must not be represented as real Fragment NFT Testnet coverage.

## Safety boundary

The current feature only calculates and displays a read-only preview. It deliberately does not authorize, sign, or broadcast refunds. The existing 0.2 TON reserve must continue to be treated as a buyer liability until the on-chain refund path and its tests are complete. Do not enable customer purchases or Mainnet activation based solely on a successful fee preview.
