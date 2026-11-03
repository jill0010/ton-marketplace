# Purchase, Gas and Settlement Readiness Audit — 2026-11-03

## Scope

This is a read-only architecture audit plus a narrowly scoped arithmetic hardening change. It reviews the current Marketplace contract, its message allowlist, storage types, tests, and the existing purchase/settlement protocol specification.

No purchase ABI, order lifecycle, NFT release handler, seller payout, platform payout, production storage layout, or deployment was introduced in this change.

## Findings

### 1. Purchases and payouts are not implemented

The current `Marketplace.tolk` allowed-message union contains owner/escrow administration, listing publication, escrow retries, and escrow deposit/refund callbacks. It does not contain a buyer purchase message. The current implementation therefore has no executable purchase acceptance path.

The current `Order` and `OrderExtra` structs and `nextOrderId` field are data definitions only. There is no code path that creates an order, reserves an Active product for a buyer, accepts exact purchase principal, commands Escrow release, confirms NFT delivery, or pays either beneficiary.

The `calculateSettlementAmounts` helper is currently pure arithmetic. It is not connected to payment collection or payout messages.

### 2. Settlement split invariant

The required split is:

- `platformFee = floor(gross * 3 / 100)`
- `sellerAmount = gross - platformFee`
- `platformFee + sellerAmount = gross`

The rounding remainder stays with the seller. For very small amounts the platform fee may be zero; this is an explicit integer-rounding consequence, not a missing amount.

### 3. Arithmetic intermediate-overflow hardening

The previous helper evaluated `gross * 3 / 100`. Although the final 3% fee fits the input amount range, the intermediate multiplication can exceed the TON `coins` / VarUInteger 16 amount range for a sufficiently large valid input.

The helper now computes the mathematically equivalent exact floor without multiplying the full gross amount first:

```tolk
val wholeHundreds = gross / 100;
val remainder = gross % 100;
val platformFee = wholeHundreds * 3 + remainder * 3 / 100;
```

Because `wholeHundreds <= gross / 100`, the intermediate `wholeHundreds * 3` is bounded below the original gross amount. The remainder is in [0, 99], so `remainder * 3` is bounded by 297. This preserves exact floor rounding and avoids the unsafe `gross * 3` intermediate.

Regression tests cover 1 nanotons, 33, 34, 99, 100 nanotons, 1 TON, 100 TON, and a large valid TON amount (10^15 TON, within the encoded `coins` range). Each case verifies conservation of gross value.

## Purchase gas and failure-path conclusions

The contract cannot yet be given a meaningful end-to-end purchase gas budget because no purchase, release, or payout messages exist in executable Marketplace code. Estimating a production budget now would invent a path that has not been implemented.

Before enabling purchases, a future implementation must:

1. Freeze a versioned Marketplace/Escrow storage migration and fresh-deployment strategy. The current storage structures are serialized; adding order/release/payout maps is not an in-place-safe change.
2. Define the exact attached-value model: gross purchase principal, Marketplace processing reserve, Escrow release reserve, notification/callback reserve, and any excess-return behavior. Gas must not be silently deducted from the seller's 97%.
3. Reserve the product and persist an immutable order snapshot atomically before sending a release request.
4. Verify NFT Item sender, release query ID, buyer, product, escrow record, and order before marking delivery.
5. Keep seller proceeds and platform fee as independent payout liabilities. Each leg needs its own unique query ID, amount, recipient snapshot, retry state, and bounce recovery. A successful seller leg must not imply that the platform leg succeeded, or vice versa.
6. Do not reopen a product or refund buyer funds solely because of a timeout or missing callback. Ambiguous transfer outcomes must remain recoverable/manual-review states.
7. Test underfunded Marketplace, Escrow, callback and payout transactions; bounce fees; storage rent; duplicate messages; partial payouts; and exact retry idempotency under the same emulator/network configuration.
8. Complete an official NFT Item end-to-end test and testnet rehearsal before any mainnet deployment or real buyer funds.

## Safety boundary

- No production contract ABI or serialized storage layout changed.
- No production database migration or Edge Function deployment occurred.
- No purchase or payout message handler was added.
- No contract deployment, testnet/mainnet transaction, NFT transfer, or fund movement occurred.
- The existing Draft PR remains unmerged.

## Validation

The arithmetic hardening and regression tests are validated by the Contracts workflow on the latest code commit. Frontend and Wallet Identity workflows are also run for the latest PR head; their final results are recorded in the PR after completion.
