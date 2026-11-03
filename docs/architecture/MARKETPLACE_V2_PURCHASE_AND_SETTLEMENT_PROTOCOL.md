# Marketplace V2 Purchase and Settlement Protocol

Status: protocol specification; implementation is not enabled.

This document freezes the security invariants for the first end-to-end purchase implementation. It does not claim that the current contracts implement buying. The V2 Marketplace and V2 NFT Escrow must be deployed as a fresh, paired deployment; V1 storage is not compatible.

## Trust and custody model

- Wallet address is the sole marketplace identity. The buyer is always the authenticated internal-message sender; no frontend-supplied buyer address is trusted.
- A listing is purchasable only while Marketplace V2 has an authenticated Escrow deposit confirmation and the corresponding NFT is still reserved by Escrow.
- The immutable order snapshot records buyer, seller, treasury, NFT Item, collection, item index, escrow ID, exact gross price, fee policy version, and independent operation/query IDs.
- Funds are held by Marketplace V2 after a valid purchase message. The database and indexer are mirrors only; neither can authorize delivery or settlement.
- The NFT is released only by the configured Escrow, to the buyer address captured in the order snapshot.
- No owner/admin action may redirect an order's buyer, seller, NFT, price, treasury, or payout beneficiary after payment acceptance.

## Message protocol (reserved opcodes)

The next implementation must assign and register distinct opcodes for:
- Buyer purchase request: product ID, unique replay-protected query ID, expected price, expiry/deadline, and an order nonce.
- Escrow release request: existing `ReleaseEscrowV2` ABI, with the order's immutable buyer and asset tuple.
- Escrow release success/failure callbacks: existing `EscrowReleasedV2` / `EscrowReleaseFailedV2` ABI, correlated against the exact order, product, escrow, query, NFT and buyer.
- Escrow callback acknowledgements: existing exact `EscrowReleaseAckV2` / `EscrowReleaseFailureAckV2` ABI.
- Independent seller and platform payout retry requests, each keyed to a persisted payout operation ID and query ID.
- Buyer refund dispatch and exact refund bounce/retry tracking.

Do not reuse a query ID across payment, release, seller payout, platform payout, or buyer refund. A duplicate request is accepted only if every immutable field matches the existing operation; otherwise it is rejected.

## Payment acceptance requirements

The contract must validate all of the following before creating an order:
1. Sender is not the seller and is not the Marketplace or Escrow contract.
2. Product exists, is active, and has a non-zero confirmed escrow ID.
3. Product price equals the buyer's expected price at execution time.
4. Attached TON value covers the exact gross price plus a separately specified execution reserve; the reserve is not counted as seller or platform proceeds.
5. The message's deadline has not expired.
6. Payment query ID and order nonce have never been consumed.
7. No existing order has reserved the product.

The implementation must use the actual TON internal-message value exposed by the pinned Tolk/Acton toolchain. Do not trust a user-supplied `attachedAmount` field as proof of funds. Define exact behavior for underpayment, overpayment, and excess return before enabling the entrypoint. Any overpayment refund must itself be persisted and bounce/retry safe.

A successful purchase atomically marks the product unavailable, creates the immutable order and two future payout liabilities, and records the payment operation before sending any cross-contract message. If the transaction cannot persist all of these changes, it must not emit an Escrow release request.

## Delivery and compensation state machine

Allowed forward path:

`Active listing -> PaymentAccepted -> DeliveryPending -> DeliveryConfirmed -> SettlementPending -> PayoutsDispatched`

- Marketplace sends `ReleaseEscrowV2` only after payment acceptance.
- Escrow must verify the Marketplace sender, escrow/product match, buyer destination restrictions, and exact idempotent release tuple.
- Escrow may mark the NFT released only after an authenticated response from the exact NFT Item contract for the exact transfer query. Its success callback remains durable until exact Marketplace ACK.
- Marketplace accepts success only if every callback field matches the order snapshot and current DeliveryPending state. Duplicate exact callbacks are ACKed without re-running settlement.
- A release bounce/failure is not a successful delivery. Marketplace first enters RefundPending and persists the buyer refund liability. It must also request seller NFT return from Escrow. These two compensations are independent and each requires its own durable status and retry path.
- Never refund the buyer merely because a callback is delayed. If NFT ownership may have changed but confirmation is missing, move to ManualReview and do not issue a conflicting seller refund.
- If the NFT was confirmed delivered, the buyer refund path is permanently closed.

## Settlement accounting

For gross price G in nanotons:

- Platform fee = floor(G * 300 / 10000).
- Seller proceeds = G - platform fee.
- Platform fee + seller proceeds must equal G exactly.
- Fee rounding policy is versioned and frozen in each order.
- Processing reserve and contract gas are not part of G and must not silently reduce seller proceeds.
- Seller and platform payout liabilities are separate persisted records with distinct operation IDs, query IDs, beneficiaries, amounts and statuses.
- A successful dispatch of one leg must never cause the other leg to be skipped or repeated.
- A bounce changes only the matching leg to Bounced; it must not recreate or resend the other leg.
- Retry is permitted only from the exact Bounced state and uses the same liability/operation identity with a fresh transport query ID if required by the implementation.
- Do not mark an order fully settled merely because outgoing messages were enqueued. Expose dispatched versus bounced/reconciled states distinctly.

## Required storage versioning

Before implementation, add an explicit V2 storage schema version and durable maps/counters for:
- next order ID and consumed payment query IDs;
- orders by order ID and product-to-order reservation;
- payout liabilities by payout operation ID;
- payout query-to-liability correlation;
- buyer refund liabilities and refund query correlation;
- delivery callback correlation and any pending manual-review marker;
- immutable treasury address and fee policy configuration.

All cells/maps must be tested for round-trip serialization and 1023-bit cell limits. New storage is only for fresh V2 deployment; never reinterpret deployed V1 data as V2.

## Mandatory emulator tests before enabling purchase

- Valid purchase sends exactly one release request and creates one order.
- Seller cannot buy own listing; wrong buyer/expected price/deadline/escrow/product rejected.
- Underpayment, overpayment, duplicate query ID, duplicate nonce, duplicate product purchase, and replayed message.
- Exact release callback accepted once; duplicate exact callback re-ACKed; mismatched callback rejected.
- Release request bounce and NFT Item transfer bounce.
- Release callback delayed, callback message bounced, callback retry and ACK.
- Buyer refund plus seller NFT return after a proven release failure; each leg independently bounced/retried.
- Delivery/refund race and manual-review behavior.
- 97/3 rounding at 1 nanotON, sub-10000 boundaries, exact percentage boundaries, maximum valid TON amount.
- Seller payout bounce while platform payout succeeds, and the reverse; retry one leg without duplicating the other.
- Treasury configuration lock, owner rotation, pause/unpause, and unauthorized admin attempts.
- Product cannot be relisted until seller refund is confirmed; sold NFT cannot be relisted after delivery.

## Deployment gate

No mainnet deployment is permitted until the complete purchase/delivery/refund/settlement path passes emulator tests, both contracts are built from the exact reviewed sources, testnet rehearsal succeeds with real official NFT collection items, contract addresses and code hashes are independently verified, and deployment keys are available through a secure signer. Never put seed phrases or private keys in GitHub, Supabase, chat, or CI secrets.
