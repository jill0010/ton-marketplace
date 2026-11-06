# Marketplace V3 reserve settlement — release gates

Status: **NOT IMPLEMENTED, NOT DEPLOYED, NOT MAINNET READY**.

## Verified V2 defect

`MarketplaceV2.tolk` accepts exactly `price + 0.2 TON`, stores `processingReserve = 0.2 TON`, and dispatches seller/platform payouts after NFT delivery. It has no independently settled reserve-return operation. A successful NFT delivery must not be interpreted as reserve settlement. Existing V2 deployment is not upgradeable through the repository.

## Required V3 behavior

1. At purchase, persist the immutable buyer, order ID, incoming payment identity, price, processing reserve and separate liabilities before sending any external message.
2. Track reserve consumption with authenticated, order-correlated evidence. A contract balance difference or sum of transaction fees alone is **not** per-order proof.
3. Never spend seller proceeds, treasury fees, other orders' reserves, or pending NFT/Escrow excesses to pay a reserve refund.
4. Only settle reserve after NFT delivery or refund and all order payout obligations reach terminal verified states. Define a bounded, documented fee budget and deterministic treatment of unused funds.
5. Store a distinct reserve-return operation ID and dispatch state before sending. Reject duplicate requests, reordered callbacks, replayed payment query IDs and stale bounces.
6. Correlate bounce and recipient credit to the exact operation, destination, amount and message. Never treat dispatch as final recipient credit; no automatic retry until returned principal is verified.
7. Expose read-only getters for reserve liability, consumed budget, return amount, status and recipient; make operational indexers distinguish dispatched, finalized, bounced and manual-review.
8. Provide safe failure states for insufficient gas, malformed callback, insufficient isolated funds, unexpected excess, and unavailable NFT Item. Preserve funds and liabilities rather than guessing.
9. Keep old V2 order 1 classified as **externally compensated**; do not migrate it into a V3 refund queue or transfer 0.2 TON again.

## Mandatory automated tests

- Successful purchase, NFT transfer, seller/platform receipts and exactly one reserve return.
- Failed NFT release and buyer price refund with correct reserve treatment.
- Concurrent orders with distinct reserves and no cross-subsidy.
- Duplicate/reordered callbacks, malformed message, forged buyer, wrong query ID and replay.
- Return message bounce, insufficient returned principal and safe manual review.
- Escrow excess delayed or missing; no premature reserve release.
- Transaction/action failure and low-balance conditions; no lost liability.
- Mainnet build workflow cannot deploy unless full contract test suite, code review, and fresh testnet end-to-end receipts pass.

## Deployment policy

No silent upgrade of V2. Deploy V3 to fresh testnet addresses, independently verify code hash and wallets, run real NFT purchase/settlement/refund scenarios, then obtain explicit approval for any mainnet funds-moving deployment. Mainnet deployment must remain blocked until all gates are met.
