# Purchase and Settlement Protocol — v1 implementation contract

> Status: protocol specification only. No purchase message, buyer order creation, escrow release, or payout handler is implemented by this document.

## 1. Non-negotiable invariants

1. A buyer is identified by the internal message sender address. Never accept a buyer address supplied only in the body.
2. The Marketplace contract is the only component allowed to reserve a listed product and create an order.
3. The configured Escrow contract is the only component allowed to release a deposited NFT.
4. The NFT Item contract is the authority for the TEP-62 ownership transfer. An outgoing transfer message is not delivery confirmation.
5. A successful TEP-62 transfer is confirmed by an authenticated `excesses` message from the exact NFT Item, with the expected operation query ID, sent to Escrow as `response_destination`. The NFT Item sends `ownership_assigned` to the new owner when `forward_amount > 0`.
6. Seller/platform payouts are forbidden until Escrow's authenticated release callback reaches Marketplace.
7. Every order and every transfer operation has a unique, replay-protected ID. A product may have at most one open purchase order.
8. Amounts are `coins` / integer nanotons only. No floating-point arithmetic.
9. Gas reserves and actual transaction fees are tracked separately from the product gross price.
10. Database state is a projection. It cannot independently mark payment, delivery, or settlement successful.

## 2. Proposed ABI additions

The exact opcodes must be checked against all existing opcodes and frozen before implementation.

### Buyer -> Marketplace

`BuyProduct { productId: uint64 }`

- Buyer address is `in.senderAddress`.
- The message must carry the exact listed price plus a separately specified processing reserve.
- Marketplace snapshots the product price and the 3% fee rule into the order.
- A second buy request for a product that is no longer Active must fail.
- The same internal message cannot create two orders: product status changes to Reserved in the same Marketplace transaction that stores the order.

### Marketplace -> Escrow

`ReleaseEscrow { escrowId: uint64, orderId: uint64, buyer: address, queryId: uint64 }`

- Accepted only from the configured Marketplace address.
- Escrow record must be Deposited.
- Buyer must be a valid standard basechain address.
- Escrow stores the release operation before sending the TEP-62 transfer.
- The NFT transfer uses `new_owner = buyer`, `response_destination = Escrow`, a non-zero `forward_amount`, and a binary payload binding the order ID and operation query ID.
- A release-specific query map is required. Do not reuse the deposit/refund query map or assume product IDs and order IDs occupy disjoint ranges.

### Escrow -> Marketplace

`EscrowReleased { queryId, orderId, escrowId, nftItem, buyer }`

- Sent only after an `excesses` response from the exact NFT Item matches the persisted pending release.
- Marketplace verifies sender == configured Escrow and matches every stored field.
- Duplicate callbacks are idempotent and re-ACK the same completed release without paying twice.

### Marketplace payout messages

Use separate, explicit payout messages and persisted payout state for:
- seller proceeds;
- platform fee.

Do not treat one successful payout as proof that the other succeeded. Each payout needs its own unique ID, destination, exact amount, status, bounce handling and retry path.

## 3. State transitions

### Product

`Active -> Reserved -> Sold`

Compensation paths:
- `Reserved -> Active` only when release is conclusively not performed and the buyer payment is safely returned.
- `Reserved -> ManualReview` when the chain outcome is ambiguous.
- Never restore Active merely because a timeout elapsed.

### Order

`DeliveryPending -> DeliveryConfirmed -> SettlementPending -> Completed`

Exceptional states:
- `RefundPending`
- `Refunded`
- `SettlementPartial`
- `ManualReview`

The order stores immutable snapshots: buyer, seller, product, NFT item, escrow ID, gross price, fee basis points, platform fee, seller proceeds, payment transaction/query ID, release query ID, timestamps and status.

### Escrow record

`Deposited -> ReleasePending -> Released`

A bounced NFT transfer can restore `ReleasePending -> Deposited` only when the bounce is authenticated from the stored NFT Item and contains the exact pending operation query ID. A successful `excesses` response moves it to Released. Do not infer ownership from an HTTP API response.

## 4. Payment and amount rules

- The order gross amount is the listed price in nanotons.
- Platform fee: `floor(gross * 300 / 10000)`.
- Seller proceeds: `gross - platformFee`.
- Rounding remainder belongs to the seller. The invariant is `platformFee + sellerProceeds == gross`.
- The attached message value must cover gross price and an explicitly budgeted processing reserve. The reserve is not part of gross price and must not silently reduce seller proceeds.
- Underpayment must revert before product/order state is committed.
- Overpayment must either be rejected or recorded as a separately refundable excess. Do not silently absorb it.
- A purchase is not complete until NFT delivery and both payout legs have independently reached terminal success.

## 5. Bounce and retry matrix

| Message | Expected bounce handling |
|---|---|
| Marketplace -> Escrow release request | Restore/retain order in a recoverable state; do not mark delivered |
| Escrow -> NFT Item transfer | Restore Escrow record to Deposited only for an authenticated matching bounce |
| NFT Item -> Escrow excesses | Treat as transfer success only when sender, query ID, buyer, order and pending record all match |
| Escrow -> Marketplace release callback | Keep callback record and permit bounded retry |
| Marketplace -> seller payout | Keep seller leg unpaid; retry only after checking chain state |
| Marketplace -> platform payout | Keep fee leg unpaid; retry only after checking chain state |
| Buyer refund | Persist refund intent and mark refunded only after authenticated chain confirmation |

Every retry must first inspect the on-chain record. Timeouts are not proof of failure.

## 6. Required tests before enabling purchases

- only Active products can be bought;
- two buyers racing for one product produce exactly one accepted order;
- buyer identity comes from message sender, not body fields;
- exact payment, underpayment, overpayment and reserve handling;
- order/query replay and duplicate callbacks;
- wrong Escrow, wrong NFT Item, wrong buyer, wrong order and wrong query ID;
- successful release with buyer notification and Escrow excesses;
- bounced release restores Deposited without losing the buyer's funds;
- ambiguous release never triggers an automatic refund or second delivery;
- seller payout bounce and platform payout bounce independently retry;
- duplicate payout messages never pay twice;
- pause, owner rotation, refund/purchase race and storage migration tests;
- full end-to-end emulation with an official NFT Item implementation, not only a permissive mock.

## 7. Storage and deployment gate

The current Marketplace and Escrow storage layouts are already in use by the prototype. Adding maps, order fields, release callbacks or payout records changes serialized storage. Before implementation:
1. freeze a storage version and explicit migration strategy;
2. test migration from the current serialized state;
3. test code upgrade and rollback on a disposable emulator/testnet deployment;
4. verify bytecode and getters against the exact source commit;
5. perform a testnet rehearsal with no mainnet assets.

No mainnet deployment or real-fund purchase is authorized by this specification.
