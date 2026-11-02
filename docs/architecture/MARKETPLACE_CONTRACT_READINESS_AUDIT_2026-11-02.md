# Marketplace Smart Contract Readiness Audit — 2026-11-02

## Scope

Read-only review of the branch's Tolk contracts and test sources:
- `contracts/marketplace/contracts/Marketplace.tolk`
- `contracts/marketplace/contracts/NFTEscrow.tolk`
- `contracts/marketplace/contracts/types.tolk`
- `contracts/marketplace/tests/marketplace.test.tolk`
- `contracts/marketplace/tests/nftescrow.test.tolk`
- `contracts/marketplace/tests/nftescrow.integration.test.tolk`

No contract source or deployed contract was changed by this audit.

## Implemented contract behavior

### Marketplace

- Owner can configure the Escrow address.
- Seller-originated `PublishProduct` creates a pending product and sends a `CreateEscrow` message.
- Product becomes active only after an authenticated callback from the configured Escrow.
- Owner can retry a pending escrow creation.
- Refund callback is authenticated against the configured Escrow and the stored product/query/NFT/seller tuple.
- Product is marked cancelled only after the escrow refund callback is processed.

### NFT Escrow

- Only the configured Marketplace can create escrow records.
- Official collection allowlisting and item-code hash checks are required.
- Initial NFT item address is re-derived from the registered code and item index.
- Deposit confirmation requires an NFT `OwnershipAssigned` message from the exact NFT item, the seller as previous owner, and the expected forward-payload marker/query ID.
- Refunds are limited to the original seller or Escrow owner.
- Refund completion waits for the NFT item's `Excesses` response, then notifies Marketplace.
- Deposit/refund callbacks are persisted and can be retried; ACKs are checked against stored callback identity fields.

## Blocking gaps: this is not yet a trading marketplace

The current contract does **not** implement:
- buyer purchase messages or order creation;
- buyer TON payment verification or payment payload binding;
- atomic product/order state transition on purchase;
- NFT release from Escrow to the buyer wallet;
- buyer delivery confirmation and delivery retry;
- seller proceeds payout;
- platform fee accounting or the agreed 97% / 3% split;
- seller settlement retry/reconciliation;
- a unique active-listing index by NFT item address;
- cancellation/expiry handling for pending escrow deposits beyond administrative retry/refund paths.

Although `Order`, `OrderExtra`, `nextOrderId`, and `orders` exist in storage types, the current `Marketplace.tolk` message union has no buy/purchase message and does not create orders.

Therefore the present contracts implement an escrow-deposit and seller-refund prototype, not end-to-end buying/selling. No buyer funds can safely be accepted and no NFT can be delivered to a buyer through the current contract code.

## Important integration boundary

The current `nft-wallet-assets` function reads NFTs from the connected wallet and validates ownership/official collection metadata. The publish Edge Function is intentionally fail-closed. The current Supabase production `products` table does not have the proposed NFT listing columns, and the old Auth-UUID listing migration has been removed.

Do not re-enable NFT publishing until the chain escrow flow and DB mirror are implemented together.

## Required next implementation sequence

1. Freeze the escrow message ABI and storage version; add explicit versioning/migration strategy before changing deployed storage.
2. Add NFT-address uniqueness in Marketplace storage so one NFT cannot create multiple pending/active listings.
3. Implement a purchase state machine with a unique order ID and replay-protected query ID.
4. Specify payment semantics: buyer wallet, exact nanotons, order payload, expiry, finality, and over/underpayment handling.
5. Implement escrow release to the buyer wallet only after payment is confirmed by the contract state machine.
6. Verify the NFT item's authenticated ownership notification to the buyer and make delivery idempotent.
7. Implement seller 97% and platform 3% settlement using integer arithmetic, explicit rounding, and retry-safe payout records.
8. Add exhaustive emulation tests: duplicate listing, fake NFT callback, wrong seller, wrong item, replayed payment, wrong amount, expired order, bounced release, duplicate delivery, payout bounce, pause/unpause, owner rotation, and refund/purchase races.
9. Only after all tests pass, review bytecode, deployment configuration, admin key custody, and testnet rehearsal. Mainnet deployment requires a separate explicit operational approval.

## Deployment status

This audit is source-level only. No Marketplace or NFTEscrow contract was deployed, upgraded, or called on mainnet/testnet by this work.
