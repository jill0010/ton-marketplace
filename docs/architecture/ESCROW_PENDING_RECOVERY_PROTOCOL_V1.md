# Escrow Pending Recovery Protocol — V1 Design Gate

> Status: design-only. No ABI, contract state, or deployed contract is changed by this document. The design deliberately does not promise that every abandoned Pending listing can be cancelled. Asset safety takes precedence over reclaiming a listing slot.

## 1. Decision

Do not implement a timeout-based or message-only `CancelPendingProduct`.

The current contracts cannot synchronously query a TEP-62 NFT Item's `get_nft_data` from another contract. A missing `ownership_assigned` notification, a bounced `CreateEscrow`, or an off-chain indexer observation is not cryptographic proof that the NFT is still owned by the seller.

Therefore a cancellation message by itself cannot safely release `MarketplaceStorage.assetListings[nftItem]`.

The only currently provable release path is:
1. NFT custody by Escrow is confirmed from the exact NFT Item;
2. Escrow executes a TEP-62 transfer back to the recorded seller;
3. Escrow receives `excesses` from that exact NFT Item for the exact refund query ID;
4. Marketplace receives and authenticates `EscrowRefunded`;
5. Marketplace removes the index only if it still maps the NFT Item to that exact product ID.

This is the existing confirmed-refund path. Keep it as the only automatic index-release path until a stronger proof mechanism is specified and tested.

## 2. Why ordinary cancellation is unsafe

The following messages are asynchronous and may be processed in different transactions:

- Marketplace -> Escrow: `CreateEscrow`;
- seller -> NFT Item: TEP-62 `transfer`;
- NFT Item -> Escrow: `ownership_assigned`;
- seller -> Marketplace: a hypothetical cancellation request.

A cancellation can reach Escrow before the NFT Item notification even though the NFT Item has already changed its owner to Escrow. If Escrow deletes the pending record and Marketplace deletes the NFT index, a later notification can either be rejected (leaving the NFT at Escrow) or conflict with a newly created listing for the same NFT.

A timeout does not close this race: message delay and an absent callback do not establish that the NFT Item remains seller-owned.

A cancellation tombstone can prevent a late message from being mistaken for a fresh deposit, but it cannot by itself prove that the NFT was never transferred. Retaining tombstones indefinitely also does not make the original NFT safely re-listable.

## 3. Supported recovery cases

### R1 — Escrow record is Pending and seller has not transferred the NFT

There is no contract-verifiable proof of continued seller ownership. Keep the Marketplace product Pending and retain the NFT index. Surface an operator-visible `Pending / ownership unconfirmed` state in the off-chain projection, but do not mutate chain state based only on an indexer.

If a future protocol adds a seller-initiated probe transfer to Escrow, the probe must be an actual TEP-62 transfer with a unique query ID. The only safe terminal result is a confirmed return transfer using the same authenticated NFT Item / seller / query binding. A mere signed message or timeout is insufficient.

### R2 — NFT transfer is confirmed in Escrow

Use the existing `RequestRefund` flow. Do not introduce a second refund implementation. The record remains RefundPending until the exact NFT Item sends the expected `excesses` response. Marketplace only releases the NFT index after its authenticated `EscrowRefunded` callback.

### R3 — NFT transfer occurred but Escrow did not persist/recognize the ownership notification

This is an incident/manual-review case, not an automatic cancellation case. Before any recovery transfer, an operator must independently establish the exact NFT Item's current owner from chain state and reconcile the exact product, seller, collection, and query ID. Any rescue mechanism must be an explicitly reviewed on-chain path; an off-chain assertion must never cause Marketplace to free the index.

### R4 — Marketplace -> Escrow CreateEscrow bounced

Keep the product Pending and retain the NFT index. Owner retry remains idempotent. A bounce may be recorded for observability in a future storage version, but it must not be interpreted as proof that no NFT transfer occurred and must not authorize cancellation.

## 4. Proposed operational state model (projection only)

The current on-chain product status remains unchanged. An off-chain operational projection may distinguish:

| Projection state | Evidence | Permitted action |
|---|---|---|
| `CREATE_REQUEST_UNKNOWN` | PublishProduct accepted; no reconciled Escrow record yet | Reconcile; retry exact CreateEscrow if authorized |
| `ESCROW_PENDING` | Matching Escrow Pending record exists | Wait for seller transfer; retain reservation |
| `DEPOSIT_CONFIRMED` | Matching Escrow Deposited record and Marketplace Active callback | Listing may be exposed for sale |
| `REFUND_PENDING` | Escrow accepted RequestRefund | Wait; do not release reservation |
| `REFUND_CONFIRMED` | NFT Item excesses confirmed and Marketplace accepted EscrowRefunded | Listing index is released by contract |
| `MANUAL_REVIEW` | Conflicting, missing, or ambiguous chain evidence | Freeze listing and all automatic recovery |

This projection is advisory. The contract state and authenticated NFT Item messages remain authoritative.

## 5. Requirements before any recovery ABI is added

A future implementation proposal must answer all of the following with executable tests:

1. How is seller ownership proved without relying on an off-chain getter?
2. What happens if the NFT Item changes owner before a cancellation reaches Escrow?
3. What happens if `CreateEscrow`, cancellation, and `ownership_assigned` are delivered in every possible order?
4. How is an ownership notification handled if it arrives after a cancellation request?
5. How can a late notification never strand an NFT at Escrow?
6. How are duplicate, replayed, and mismatched query IDs rejected?
7. When exactly may Marketplace delete `assetListings[nftItem]`?
8. How is the old query permanently prevented from being recreated after terminal cancellation?
9. Which exact official NFT Item code versions are covered by the emulator tests?
10. What new storage layout version is required, and is deployment to a fresh address mandatory?

A proposal that answers question 1 only with “wait N minutes”, “check an indexer”, or “the callback did not arrive” is rejected.

## 6. Implementation order

1. Add read-only Escrow getters or an authenticated reconciliation interface only if they do not expose mutable trust assumptions. Getters improve observability but are not proof of NFT ownership.
2. Add a bounded, replay-safe `CreateEscrow` bounce/retry marker only after the exact bounce format and message identity can be authenticated. Preserve the current Pending reservation.
3. Design a seller-initiated probe/refund handshake, if technically viable with the supported NFT Item implementations.
4. Add adversarial message-order tests and delayed-notification tests.
5. Freeze the new Marketplace/Escrow storage layout and fresh-address deployment plan.
6. Only then consider purchase and delivery implementation.

## 7. Explicit non-goals

This document does not implement or enable:
- Pending listing cancellation or automatic reservation release;
- buyer purchase, payment verification, NFT buyer delivery, or seller/platform payout;
- production database migrations or Edge Function deployment;
- mainnet contract deployment or real NFT/TON movement.

The PR must remain Draft. Existing Pending reservations may remain stuck rather than risk losing custody or permitting duplicate listings.
