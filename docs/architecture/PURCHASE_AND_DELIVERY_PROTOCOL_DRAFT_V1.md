# TON Marketplace Purchase and Delivery Protocol — Draft v1

Status: design contract only. The ABI and storage changes below are not implemented or deployed.

## Non-negotiable invariants

1. The buyer pays the exact listing price in TON nanotons. No floating-point values are used.
2. A product can have at most one active purchase order.
3. A product is reserved before any NFT release message is sent.
4. An NFT remains in escrow until a valid purchase order has been funded.
5. NFT delivery is considered confirmed only after the NFT Item sends a TEP-62 `excesses` message to the escrow's `response_destination`, from the exact NFT Item address, with the matching unique release query ID.
6. A timeout or missing callback is not proof of failure. The escrow must not blindly resend a transfer after an ambiguous result.
7. Seller and platform payouts are separate, retryable liabilities. A payout bounce must never reopen the product or re-transfer the NFT.
8. All transitions are replay-safe and bind the product, order, NFT Item, buyer, seller, amount, and query IDs.

## Why delivery uses TEP-62 excesses

The standard sends `ownership_assigned` to `new_owner` only when `forward_amount > 0`. For a normal buyer wallet, the marketplace cannot assume that the wallet contract will execute custom callback logic.

Instead, the NFT transfer sets:
- `new_owner = buyer`
- `response_destination = NFTEscrow`
- `forward_amount = 0` (unless a separately justified notification amount is required)
- `query_id = unique release query ID`

The NFT Item updates its owner and sends `excesses(query_id)` to the escrow response destination. The escrow accepts that confirmation only when the sender is the exact NFT Item in the matching release-pending record and the query ID matches. This is an on-chain success signal emitted after the NFT Item has processed the transfer. The standard and reference documentation define the message layout and the response destination semantics.

Reference: TEP-62 NFT standard and TON NFT message documentation.

## Proposed state machines

### Product

- `PendingDeposit`: Marketplace accepted listing intent; NFT not yet verified in escrow.
- `Active`: Escrow confirmed NFT custody.
- `Reserved`: exact-price purchase order created; no second buyer can reserve it.
- `DeliveryPending`: escrow accepted release command and initiated NFT transfer.
- `Sold`: matching NFT Item excesses callback confirmed delivery.
- `Cancelled`: seller refund completed before purchase.
- `Paused`: owner/admin temporarily prevents new purchases.

Allowed transitions:
- PendingDeposit -> Active
- PendingDeposit -> Cancelled only after confirmed refund
- Active -> Reserved
- Reserved -> Active only after a safely confirmed pre-release cancellation/expiry
- Reserved -> DeliveryPending
- DeliveryPending -> Sold only after exact NFT Item excesses callback
- Active -> Paused -> Active

Never allow Sold -> Active or Sold -> Cancelled.

### Order

- `Created`: order ID and exact buyer/product/seller/asset/price snapshot recorded.
- `Funded`: exact required payment accepted and order bound to the payment query.
- `DeliveryPending`: escrow accepted the release command.
- `Delivered`: NFT Item excesses callback validated.
- `SettlementPending`: seller/platform payout liabilities recorded.
- `PartiallySettled`: one payout completed and another remains pending.
- `Settled`: both payouts completed.
- `RefundPending` / `Refunded`: only for a verified failure path in which NFT ownership remains in escrow.

Do not add a generic timeout refund after a release has been sent. The NFT may have transferred even if the callback has not yet been observed.

## Proposed message ABI (not yet committed to Tolk types)

Marketplace inbound:
- `BuyProduct(productId, expectedPrice, buyerNonce)`
- `CancelExpiredReservation(orderId)` — permitted only before any release command has been accepted by escrow and after a contract-verifiable expiry condition.

Marketplace <-> Escrow:
- `ReleaseEscrowNft(orderId, productId, releaseQueryId, nftItem, buyer)`
- `EscrowReleaseAccepted(orderId, productId, releaseQueryId, nftItem, buyer)`
- `EscrowNftDelivered(orderId, productId, releaseQueryId, nftItem, buyer)`
- `EscrowReleaseRejected(...)` only for a rejection that proves no transfer message was emitted.

Escrow inbound from NFT Item:
- Existing TEP-62 `NftExcesses(queryId)`, with sender, query ID, record state, and stored buyer checked against the pending release record.

Payout callbacks:
- Dedicated bounced-message handlers identify order ID and payout leg. Each leg has an independent state and retry counter.

All opcodes must be allocated from an ABI registry and tested against collision before implementation.

## Payment acceptance and exact split

For a TON listing price `gross` (nanotons):
- `platformFee = floor(gross * 3 / 100)`
- `sellerAmount = gross - platformFee`

The seller receives the remainder, so `platformFee + sellerAmount == gross` exactly for every integer amount. For values below 34 nanotons the rounded platform fee may be zero; the contract must document this rather than silently rounding the seller amount down.

The new `calculateSettlementAmounts` helper implements this exact integer rule. Its tests cover 100 TON, 1 TON, and 1 nanotons. This helper is not yet connected to any payment or payout path.

The payment handler must reject:
- value below exact price plus explicitly budgeted operational fees;
- expected price that differs from the stored listing price;
- buyer nonce/order replay;
- a product not in Active state;
- a second order while a reservation exists;
- messages with unexpected sender/beneficiary context.

Any excess TON handling must be explicit and must not be confused with the purchase principal.

## Payout reliability

After delivery confirmation:
1. Persist immutable gross price, fee, seller amount, buyer, seller, and platform recipient snapshot.
2. Create two independently retryable payout legs.
3. Send seller payout and platform fee as separate internal messages.
4. Mark each leg complete only on a valid acknowledgement from the intended recipient contract, or a separately designed safe transfer confirmation.
5. Handle bounced payout messages without changing NFT delivery state.
6. Prevent double payment by binding every payout to (order ID, payout leg, unique query ID).

If platform and seller destinations are ordinary wallets, a successful internal message transaction is not necessarily a programmable acknowledgement. The final settlement model must choose whether the Marketplace contract treats a successful outbound action as paid, or uses dedicated payout vault contracts that acknowledge receipt. This decision must be frozen before implementing payout state.

## Required test matrix before testnet

- exact payment; underpayment; overpayment; unexpected sender;
- wrong expected price; changed listing price; paused product;
- two buyers racing for one product;
- replayed buyer nonce and order ID;
- duplicate release command;
- wrong NFT Item sender for excesses;
- wrong release query ID;
- excesses received before release state;
- NFT transfer bounce before ownership change;
- NFT transfer succeeds but callback is delayed;
- duplicate excesses callback;
- refund racing with purchase;
- payout bounce for seller only, platform only, and both;
- payout retry replay;
- storage and gas boundary tests;
- owner rotation and emergency pause.

## Deployment boundary

This is a protocol design step only. Do not deploy or upgrade Marketplace/NFTEscrow, do not enable publishing or checkout, and do not accept buyer funds until the ABI, storage migration strategy, contract tests, code review, and testnet rehearsal all pass.
