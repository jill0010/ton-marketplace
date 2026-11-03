# TON Marketplace V2 — NFT Delivery Failure and Buyer Compensation

Date: 2026-11-03
Status: Architecture decision; no buyer payment or refund entrypoint is implemented.

## Decision

A MarketplaceV2 purchase must not infer NFT delivery failure from a timeout or from the absence of an `EscrowReleasedV2` callback. TON messages are asynchronous; absence of a callback does not prove that the NFT transfer failed.

Before buyer funds are accepted, NFTEscrowV2 must provide a durable, authenticated failure callback for a release attempt whose NFT Item transfer is conclusively bounced. The buyer compensation path must then return the still-escrowed NFT to the seller and refund the buyer as two separate, independently retryable liabilities.

The listing is cancelled after the NFT has been returned to the seller. It is not automatically reactivated while a buyer refund is outstanding. The seller may publish again through the normal deposit flow after receiving the NFT back.

## Two distinct failure cases

### A. MarketplaceV2 → NFTEscrowV2 release request itself bounces

A fully correlated RichBounce of the original `ReleaseEscrowV2` request from the configured Escrow proves that the Escrow transaction did not accept the request. The Marketplace may begin compensation only after matching the original order ID, product ID, escrow ID, release query ID, buyer, and NFT Item against the stored order.

### B. NFTEscrowV2 → NFT Item TEP-62 transfer bounces

This is a separate asynchronous message hop. NFTEscrowV2's existing bounce handler already verifies the NFT Item sender, transfer query ID, intended buyer, response destination, pending release snapshot, and escrow identity before restoring the record to Deposited and clearing the pending release.

That custody recovery alone is not enough for a purchase: MarketplaceV2 cannot read another contract's getter and must not infer failure from silence. NFTEscrowV2 must additionally persist and send a durable `EscrowReleaseFailedV2` callback.

## Required failure callback protocol

Reserve these opcodes without implementing them until the callback and compensation tests are ready:

| Opcode | Message | Direction |
|---|---|---|
| `0x71b00013` | `EscrowReleaseFailedV2` | NFTEscrowV2 → MarketplaceV2 |
| `0x71b00014` | `EscrowReleaseFailureAckV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00015` | `RetryReleaseFailureCallbackV2` | Operator → NFTEscrowV2 |

The callback snapshot must include order ID, product ID, escrow ID, release query ID, NFT Item, buyer, and seller. NFTEscrowV2 creates it only after an exact NFT Item RichBounce restores the record to Deposited. The callback is stored durably until an exact ACK from the configured MarketplaceV2.

The Marketplace accepts the callback only from its immutable configured Escrow and only when every field matches the order snapshot and the order is currently DeliveryPending. A duplicate exact callback is idempotently re-ACKed and must not create a second refund liability.

## Compensation sequence

1. MarketplaceV2 authenticates the release failure (either the exact request bounce in case A or the durable Escrow failure callback in case B).
2. The order moves to RefundPending. The product remains Reserved; no second buyer can purchase it.
3. MarketplaceV2 creates one immutable buyer-refund liability for the exact gross payment. The buyer address is the original `in.senderAddress` snapshot, never a callback/body-supplied replacement.
4. MarketplaceV2 requests NFTEscrowV2 to return the NFT to the recorded seller using the existing seller-refund mechanism and a new independent refund query ID.
5. The seller NFT return and buyer Toncoin refund are independent operations. Each has its own query/operation ID, exact beneficiary, amount, state, bounce recovery, and retry. Failure of one cannot duplicate or erase the other.
6. The product becomes Cancelled only after the exact seller NFT-return callback confirms the NFT Item's ownership has returned to the seller. Its NFT listing index is then released.
7. The order is not considered user-facing Refunded until the buyer refund recipient transaction is observed successful and finalized in the chain trace. A bounced buyer refund remains Pending and retryable; it does not reactivate the product.
8. If either outcome is ambiguous, retain liabilities and product reservation in ManualReview. Do not use timeouts to release custody or re-list the asset.

The on-chain state records request, dispatch, exact callback, and bounce transitions. An indexer follows the recipient transaction trace for finality; it is a read-only projection and cannot authorize compensation.

## Required storage

NFTEscrowV2's release callback storage must add a separate durable map for release-failure callbacks. Do not overwrite the success callback map: a release success and release failure are mutually exclusive outcomes, and each must be ACKed with a different exact message type.

MarketplaceV2's order snapshot must retain:
- immutable buyer, seller, NFT Item, collection, item index, escrow ID, and gross payment;
- distinct release, seller NFT-return, and buyer-refund query IDs;
- delivery status, NFT-return status, buyer-refund status, and order status independently.

The order must never be marked Completed/Refunded merely because a refund message was queued.

## Required adversarial tests

1. Exact ReleaseEscrowV2 request bounce triggers one compensation path; wrong/stale/malformed request bounce is a no-op.
2. Real official NFT Item transfer to buyer fails and produces an actual RichBounce; NFTEscrowV2 restores Deposited and emits the durable failure callback.
3. Failure callback bounce preserves the callback; owner retry resends it; only exact Marketplace ACK clears it.
4. Forged sender, wrong order/product/escrow/query/NFT/buyer/seller fields are rejected.
5. Duplicate exact failure callback re-ACKs without duplicating buyer refund or seller NFT-return liabilities.
6. Seller NFT return succeeds; the real NFT Item getter reports the seller as owner; Marketplace cancels the product and releases only its matching asset index.
7. Buyer refund succeeds independently; verify recipient transaction and exact amount.
8. Buyer refund bounce restores only the buyer-refund liability; NFT return state remains unchanged.
9. Seller NFT-return bounce restores only the NFT-return path; buyer refund state remains unchanged.
10. Release success and release-failure callbacks cannot both be accepted for the same order/query.
11. A delayed/stale release failure callback after successful delivery is rejected.
12. Concurrent duplicate release/refund/retry messages cannot produce duplicate transfers.
13. ManualReview prevents automatic relisting and additional buyer purchases.

## Scope boundary

This decision is a prerequisite for MarketplaceV2 buyer payment. NFTEscrowV2 currently restores its custody record on a correlated NFT release bounce, but it does not yet send the durable release-failure callback described here. MarketplaceV2 has no buyer purchase entrypoint or buyer refund handler. Do not accept buyer funds until this protocol and the full cross-contract tests are implemented.
