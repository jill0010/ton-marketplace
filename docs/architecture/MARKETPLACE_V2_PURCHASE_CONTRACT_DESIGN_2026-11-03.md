# Marketplace V2 — Isolated Purchase Contract Design

Date: 2026-11-03
Status: design gate; not deployed and not yet an executable purchase implementation.

## Objective

Introduce a new, independently addressed Marketplace V2 contract rather than changing the serialized storage of the current Marketplace. The existing Marketplace and NFTEscrow remain untouched until a separately reviewed cutover. V2 must never accept buyer funds until NFT custody, release confirmation, and independently retryable payout legs are implemented and tested together.

## Contract boundaries

1. **MarketplaceV2** owns product reservations, immutable purchase orders, payment accounting, delivery state, and seller/platform payout liabilities.
2. **NFTEscrowV2** owns NFT custody and release operations. It authenticates the MarketplaceV2 address and accepts release only for an exact deposited NFT record.
3. **NFT Item** remains the ownership authority. MarketplaceV2 must not infer delivery from an outgoing message, a database row, or an indexer.
4. **Indexer/database** is a projection only. It cannot authorize a purchase, release, refund, or payout.
5. **Treasury** is an explicit configured address snapshot per order. A treasury rotation affects new orders only.

V2 uses fresh contract addresses and independent storage schemas. Do not point the existing Marketplace address at V2 code or deserialize legacy cells as V2.

## ABI namespace reservation

Use a new opcode namespace, subject to a final collision scan before code generation:

| Opcode | Message | Direction |
|---|---|---|
| `0x71b00001` | `BuyProductV2` | Buyer → MarketplaceV2 |
| `0x71b00002` | `ReleaseEscrowV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00003` | `EscrowReleasedV2` | NFTEscrowV2 → MarketplaceV2 |
| `0x71b00004` | `SellerPayoutV2` | MarketplaceV2 → Seller |
| `0x71b00005` | `PlatformPayoutV2` | MarketplaceV2 → Treasury |
| `0x71b00006` | `RetryPayoutV2` | Operator → MarketplaceV2 |
| `0x71b00007` | `BuyerRefundV2` | MarketplaceV2 → Buyer |
| `0x71b00008` | `PayoutSettledV2` | Beneficiary → MarketplaceV2 |
| `0x71b00009` | `RetryReleaseCallbackV2` | Operator → NFTEscrowV2 |

These values are proposed, not yet frozen. Do not release an ABI or deploy until a repository-wide opcode scan and generated-wrapper review are complete.

## Immutable order snapshot

Each order must store:

- order ID and product ID;
- buyer from `in.senderAddress` (never a body-supplied buyer);
- seller, NFT Item, collection, item index, Escrow record ID;
- gross price in nanotons;
- fee basis points (300) and rounding rule version;
- platform fee and seller proceeds;
- treasury address snapshot;
- payment query ID, release query ID, seller payout query ID, platform payout query ID;
- attached processing reserve and reserve accounting;
- delivery, refund, seller payout, and platform payout states independently;
- creation and terminal timestamps.

Use a monotonic uint64 order ID plus distinct per-operation query IDs. Do not assume order IDs and NFT escrow IDs share a namespace.

## State model

Product:
`Active → Reserved → Sold`
or, only after a conclusive and compensated failure,
`Reserved → Active`.

Order:
`PaymentAccepted → DeliveryPending → DeliveryConfirmed → SettlementPending → Completed`.

Independent exceptional states:
- `ReleaseBounced` (recoverable only after exact authenticated bounce);
- `SellerPayoutPending`;
- `PlatformPayoutPending`;
- `RefundPending`;
- `ManualReview`.

The order is Completed only when NFT delivery, seller payout, and platform payout are each confirmed. Partial payout is an explicit state, never represented as Completed.

Escrow:
`Deposited → ReleasePending → Released`.
An exact authenticated NFT Item bounce can return ReleasePending to Deposited. An exact authenticated NFT Item `excesses` confirmation moves it to Released. Timeouts do not establish either result.

## Payment acceptance

The first V2 implementation must make one decision and encode it in tests before ABI freeze:

- **Exact-value mode:** attached value must equal gross plus the published processing reserve; underpayment and overpayment both revert.
- Any future overpayment/refund mode must use an explicit refundable liability and a confirmed refund callback. It must not silently increase platform revenue.

The reserve is separate from gross. Seller proceeds are calculated from gross only. The reserve is used for specified contract messages and measured transaction costs; unused reserve is returned only through an explicit, authenticated excess/refund path.

Fee calculation:
`platformFee = floor(gross × 300 / 10000)`
`sellerProceeds = gross - platformFee`.
Rounding remainder belongs to seller. Assert exact conservation before persisting the order.

## Critical transaction ordering

1. Validate product Active, exact buyer sender, exact payment mode, nonzero gross, valid seller/NFT/Escrow binding, and available processing reserve.
2. Persist product Reserved and immutable order/payment snapshot in one MarketplaceV2 transaction.
3. Send exact ReleaseEscrowV2 to NFTEscrowV2 with a separately budgeted value.
4. Escrow persists ReleasePending before sending TEP-62 NFT transfer.
5. NFT Item sends ownership notification to buyer and `excesses` to Escrow. Escrow authenticates exact NFT Item, query ID, and pending release snapshot.
6. Escrow persists Released and sends EscrowReleasedV2 callback.
7. MarketplaceV2 authenticates callback and marks delivery confirmed. It creates two independent payout liabilities.
8. Seller and platform payouts are separate outgoing messages with unique IDs and exact amounts. Each leg has its own success acknowledgement, bounce recovery, and retry.
9. Mark Completed only after both payout legs are confirmed.

No transaction should mark delivery or payout complete merely because an outgoing action was queued.

## Bounce and idempotency rules

- A bounced MarketplaceV2 → Escrow request must not imply NFT release.
- A bounced Escrow → NFT Item transfer restores Deposited only for exact NFT Item sender, release query, new owner, response destination, and current ReleasePending state.
- A duplicate EscrowReleasedV2 callback may re-ACK but must never create another payout.
- Seller payout and platform payout have distinct operation IDs and state. Retrying one leg cannot resend the other.
- A bounced payout remains unpaid. A retry must inspect persisted state and use the same operation identity; it must not create a second liability.
- An ambiguous transaction outcome goes to ManualReview. No timeout-only automatic product reactivation or buyer refund.
- All beneficiary acknowledgements must be authenticated. A beneficiary cannot claim a payout for another address or operation.
- Payout completion must be based on a carefully specified on-chain confirmation model; mere message dispatch is insufficient.

## Gas and solvency model

Do not hardcode a claim that one fixed TON amount is sufficient on mainnet. For each message hop, record:
- attached value;
- compute gas;
- action fees;
- forward fees;
- storage reserve implications;
- bounce fees and bounce payload size;
- required minimum remaining balance;
- excess destination and excess handling.

A release or payout must fail closed if the contract cannot preserve the liabilities already recorded. The contract must never spend gross purchase principal on operational gas in a way that reduces seller proceeds. If the reserve is inadequate, keep the order recoverable and require an explicit top-up/retry flow.

## Required test plan

Before enabling the buyer entrypoint:
1. exact-value payment, underpayment, overpayment, and insufficient processing reserve;
2. two buyers racing for one product; exactly one order is accepted;
3. product reservation and order creation rollback on action-phase failure;
4. wrong NFT Item, wrong buyer, wrong collection, wrong escrow record, wrong query and forged callback;
5. release success, release bounce, duplicate release request and stale release bounce;
6. buyer ownership notification plus Escrow excess confirmation;
7. callback bounce/retry without duplicate payout creation;
8. seller payout bounce while platform payout succeeds;
9. platform payout bounce while seller payout succeeds;
10. duplicate acknowledgements and duplicate retry messages;
11. payout reserve depletion, bounce fees, storage fees, and replenishment;
12. refund versus release race and pause/owner rotation;
13. official Fragment NFT Item end-to-end emulator test;
14. full testnet rehearsal with disposable wallets and no valuable NFTs.

## Implementation sequence

- Phase A: freeze opcode table, V2 storage structs, exact payment mode, query-ID allocation, and versioned deployment manifest.
- Phase B: implement NFTEscrowV2 release lifecycle and official NFT Item release/bounce tests.
- Phase C: implement MarketplaceV2 purchase reservation and payment accounting, still without payout enablement.
- Phase D: implement independent payout liabilities and acknowledgement/bounce/retry logic.
- Phase E: adversarial cross-contract integration tests and measured fee matrix.
- Phase F: fresh-address testnet deployment, code/hash verification, owner/treasury configuration rehearsal, and security review.
- Only after these gates may a separate explicit production deployment decision be considered.

## Current status and safety boundary

This document is a design artifact, not a deployed contract or authorization to receive funds. The current production/prototype Marketplace and NFTEscrow contracts remain unchanged. No purchase, release, payout, or refund V2 handler is enabled. No database migration, Edge Function deployment, testnet/mainnet deployment, NFT transfer, or fund movement occurred.
