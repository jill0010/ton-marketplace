# Escrow refund callback retry audit — 2026-11-03

## Scope

This audit verifies the asynchronous boundary between the NFT Item refund confirmation (`excesses`), the Escrow's `EscrowRefunded` callback, Marketplace index release, and the Escrow's final `EscrowRefundAck` cleanup.

## Existing state transition reviewed

1. `RequestRefund` is accepted only for a Deposited record and changes Escrow status to RefundPending (6) before sending the TEP-62 transfer back to the seller.
2. Only an `excesses` message from the exact recorded NFT Item with the exact stored query ID and RefundPending status changes the record to Refunded (4).
3. In the same Escrow transaction, the complete refund callback identity is persisted in `callbackStorage.refundCallbacks` before `EscrowRefunded` is sent to Marketplace.
4. Marketplace authenticates the configured Escrow sender and matches query ID, product ID, NFT Item, seller, and the current product state. It only cancels an Active product and deletes the NFT listing index when the index still belongs to that exact product.
5. Marketplace sends `EscrowRefundAck`. Escrow deletes the persisted callback only after authenticating the Marketplace sender and matching every callback identity field.
6. If the `EscrowRefunded` callback bounces, Escrow's bounce handler recognizes the callback opcode and leaves the persisted callback intact. The owner can resend it with `RetryRefundCallback`. Marketplace's already-cancelled path is idempotent and re-ACKs without clearing a newer listing.

## Regression added

The NFT Escrow integration test now forces a real callback rejection at the Marketplace boundary without faking the NFT transfer:

- After the product is Active, the test temporarily changes Marketplace's configured Escrow address to the deployer address.
- The seller requests a refund. The real NFT Item transfer succeeds and returns ownership to the seller; Escrow reaches Refunded (4) and sends its callback.
- Marketplace rejects the callback because the sender is not the temporarily configured Escrow. The callback bounce returns to Escrow; the callback record must remain available for retry.
- Before retry, Marketplace product remains Active (2), and a duplicate publication of the same NFT is still rejected with `AssetAlreadyListed`. This proves that NFT return alone does not release the Marketplace listing index.
- The test restores the correct Escrow address and invokes owner-only `RetryRefundCallback`.
- Marketplace then accepts the exact callback, changes the product to Cancelled (5), releases only that product's NFT index, and sends the ACK.
- The existing stale-callback/new-listing regression continues afterward, proving an old callback cannot release the newly created listing.

This is an integration test of the real NFT return and the callback retry path; it is not a production incident simulation or a test of every possible TON action-phase failure.

## Validation

Code commit `1bc3c03e941869123c38f50b6eea2cb94ca37bc6`:

- Contracts workflow #106: success — Acton build, 94 tests in 7 files, linter, formatter.
- Frontend Build #48: success.
- Wallet Identity Audit #95: success — Deno/type checks and PostgreSQL 17 integration tests.

## Remaining boundary

This test covers a bounced Marketplace `EscrowRefunded` callback and the owner retry/ACK completion path. It does not yet force the NFT Item's TEP-62 refund transfer itself to bounce, nor does it exhaustively enumerate all NFT Item action-phase and notification-order permutations. The existing safety rule remains: Escrow must not mark a refund complete until the exact NFT Item returns the exact query-bound `excesses` message; Marketplace must not release the NFT index until it accepts the authenticated `EscrowRefunded` callback.

No storage layout, contract ABI, production database, deployed Edge Function, contract deployment, mainnet transaction, NFT transfer outside the emulator, or funds were changed or moved by this test slice. PR remains Draft and unmerged.
