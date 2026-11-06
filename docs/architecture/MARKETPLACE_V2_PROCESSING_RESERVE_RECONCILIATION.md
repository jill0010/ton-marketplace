# Marketplace V2 Processing Reserve Reconciliation

Status: fee-trace preview implemented and covered by unit tests; on-chain refund dispatch is intentionally not enabled yet. No mainnet transaction, deployment, or fund movement is performed by this feature.

## Approved economic rule

The buyer attaches the exact product gross price plus 0.2 TON. The 0.2 TON is a processing reserve, not platform revenue. Only actual, attributable processing costs may be retained. The remaining amount belongs to the buyer and must be returned after the purchase or compensation trace is complete.

For an order:

`refundable = max(0, 200000000 - attributableProcessingFees)`

All amounts are nanotons. If attributable processing fees exceed the reserve, refundable is zero and the order requires manual review; the shortfall must not be silently charged against seller proceeds or platform fee.

## Fee attribution

TON transaction fees include storage, compute, forwarding and action components. The preview reads the complete TON Center API v3 trace rooted at the buyer payment transaction and sums each transaction's `total_fees` only for:

- Marketplace V2 contract;
- NFT Escrow V2 contract;
- the exact NFT Item in the immutable order snapshot.

Buyer, seller and platform treasury wallet transaction fees are excluded because they are not processing-reserve expenses. Unknown accounts, duplicate transaction hashes, malformed fee values, incomplete traces, pending messages, a missing payment transaction, or missing Marketplace/Escrow transactions cause a fail-closed error.

The trace must have a completed masterchain sequence and zero pending messages. This is a read-only accounting preview. It is not sufficient by itself to prove the order's final business state or authorize a refund.

## Implemented components

- `supabase/functions/_shared/marketplace-processing-reserve.js`: pure fee attribution and reserve arithmetic.
- `supabase/functions/_shared/marketplace-processing-reserve.test.mjs`: tests for normal fee aggregation, exclusion of buyer/seller/treasury wallet fees, incomplete traces, pending messages, wrong root transaction, unknown accounts, duplicate transactions and reserve shortfall.
- `supabase/functions/admin-preview-marketplace-processing-reserve/index.ts`: administrator-only, read-only preview using TON Center API v3. It does not update the database, sign a wallet message, call a send endpoint, or broadcast a transaction.
- Frontend Build CI runs the fee reconciliation unit tests.

## Remaining implementation gates

1. Add a versioned on-chain reserve-refund liability to Marketplace V2, including buyer beneficiary, exact order ID, one-time refund status, and a replay-protected operation/query ID.
2. Add a contract entrypoint that can dispatch only the exact reconciled refund amount to the buyer, only after the order's delivery or compensation state is terminal. It must not accept an arbitrary amount from a public caller.
3. Decide and implement the authorization/proof model for the measured trace fee. TON contracts cannot independently query an external indexer's trace database. The current preview is produced by TON Center API v3; it is not a cryptographic on-chain proof. The eventual refund dispatcher must therefore either:
   - require the Marketplace owner to review and sign the fee preview through the authorized wallet, with the signed amount and trace identity persisted on-chain; or
   - use a separately reviewed trust-minimized proof/oracle design.
4. Ensure unused reserve funds that remain at Escrow after NFT transfer/excess handling are returned or explicitly accounted for before calculating the buyer's final refund. Marketplace-only balance is not proof that all reserve funds have returned from Escrow.
5. Add emulator tests for exact one-time refund, duplicate/replay, wrong beneficiary, incomplete order, trace mismatch, fee above reserve, and refund dispatch bounce/retry.
6. Re-deploy the exact reviewed V2 source to Testnet and rehearse with the available test NFT fixtures. This is separate from Mainnet and must not be represented as real Fragment NFT Testnet coverage.

## Safety boundary

The current feature only calculates and displays a read-only preview. It deliberately does not authorize, sign, or broadcast refunds. The existing 0.2 TON reserve must continue to be treated as a buyer liability until the on-chain refund path and its tests are complete. Do not enable customer purchases or Mainnet activation based solely on a successful fee preview.
