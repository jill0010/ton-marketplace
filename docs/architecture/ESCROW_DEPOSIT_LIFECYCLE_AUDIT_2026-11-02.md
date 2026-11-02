# Escrow Deposit Lifecycle Audit — 2026-11-02

> Status: audit and implementation gate only. This document does not change contract behavior and does not authorize deployment, storage migration, NFT movement, or production transactions.

## Scope

Reviewed the current `Marketplace.tolk`, `NFTEscrow.tolk`, `types.tolk`, the purchase/settlement protocol, and the NFT escrow integration test on `architecture/unified-trading-v1`.

The review is intentionally limited to the lifecycle between a seller's listing request and confirmed NFT custody. Purchase, buyer payment, release, and payout remain unimplemented.

## Current lifecycle observed

1. `PublishProduct` creates a Marketplace product in `Pending`, reserves `assetListings[nftItem]`, and sends `CreateEscrow`.
2. Escrow accepts `CreateEscrow` only from the configured Marketplace. It validates the collection and the expected NFT Item address, then creates a `Pending` escrow record indexed by query ID.
3. The seller must separately send a TEP-62 transfer to the Escrow address, with the expected notification payload.
4. Escrow accepts `NftOwnershipAssigned` only from the recorded NFT Item and checks the query ID, seller, and payload marker. It then records `Deposited` and notifies Marketplace.
5. Marketplace authenticates the callback, changes the product to `Active`, and sends an ACK.
6. The Marketplace's `RetryCreateEscrow` can resend the create request while the product is still Pending. Escrow treats a matching existing Pending/Deposited record as an idempotent retry.

## Findings

### E1 — Pending listings have no safe seller cancellation/recovery path

**Severity: High operational risk; fail-closed asset safety behavior.**

A listing can remain Pending indefinitely if the seller never transfers the NFT, if the NFT notification is never successfully processed, or if the initial Marketplace-to-Escrow create message bounces.

The current `RequestRefund` handler only accepts an Escrow record in status `Deposited` (status 2). A Pending record (status 1) cannot be refunded or cancelled. Marketplace has no seller cancellation message, and its bounced-message handler is empty.

Consequences:
- The Marketplace product remains Pending.
- The NFT Item address remains reserved in `assetListings`.
- The seller cannot publish that NFT again through the same Marketplace while the reservation remains.
- An owner can retry `CreateEscrow`, but that does not resolve a seller who no longer wants to proceed or prove whether the NFT transfer has happened.

This is safer than releasing the index on a timeout: a delayed TEP-62 ownership notification could arrive after an unsafe cancellation and leave the NFT in Escrow while Marketplace believes the asset is available.

**Required design before implementation:**
- Introduce an explicit, replay-protected deposit handshake/recovery protocol spanning Marketplace, Escrow, and the NFT Item.
- A cancellation must be authorized by the original seller and tied to the exact product ID, escrow ID, NFT Item, and query ID.
- It must prove on-chain that the NFT is still owned by the seller before removing the pending reservation, or complete a verified return transfer if the NFT has already reached Escrow.
- A timeout, missing callback, bounced message, or off-chain indexer observation alone is not proof that the NFT remains with the seller.
- Define and test the race where the seller's NFT transfer and cancellation messages are delivered in either order.
- Preserve a terminal, replay-safe record so a delayed duplicate message cannot recreate or consume a cancelled listing.

Until this protocol exists, retaining Pending reservations indefinitely is the correct fail-closed behavior. Do not add a simple `CancelPendingProduct` that deletes `assetListings`.

### E2 — Marketplace does not persist an explicit CreateEscrow delivery/bounce outcome

**Severity: Medium operational observability/recovery risk.**

Marketplace sends `CreateEscrow` with bounce enabled, but `onBouncedMessage` is currently empty. The pending product and NFT reservation remain, which is conservative, and an owner can manually call `RetryCreateEscrow`. However, the contract does not record whether the create request bounced, nor expose a distinct retry-required state.

Required design:
- Parse only the exact bounced `CreateEscrow` opcode and expected destination/identity fields.
- Persist a bounded, replay-safe failure/retry marker associated with the product/query ID.
- Do not delete the listing reservation or assume that no Escrow record exists merely because a bounce is observed; reconcile against the Escrow record first.
- Keep owner retry idempotent and prevent retries from changing seller, NFT Item, collection, kind, or product identity.
- Add tests for a bounced create request, repeated bounce, retry after configuration/funding correction, and a late callback.

### E3 — Existing idempotency boundary is useful but not a cancellation proof

Escrow's existing-query branch accepts only matching identity fields and records in Pending or Deposited state. This supports safe create retries. It does not prove that a Pending record can be discarded, and it must not be repurposed as a cancellation mechanism.

## Required test matrix before changing this lifecycle

- Marketplace-to-Escrow `CreateEscrow` succeeds and produces exactly one record.
- `CreateEscrow` bounces; Marketplace keeps the NFT reservation and exposes a recoverable retry state.
- Duplicate create requests with identical fields are idempotent.
- Duplicate create requests with any mismatched seller, NFT Item, collection, product ID, item index, kind, or query ID fail.
- Seller never transfers the NFT; no automatic timeout cancellation occurs.
- Seller transfer reaches NFT Item but the notification is delayed; a concurrent cancellation cannot release the reservation.
- Notification is processed before cancellation; cancellation cannot undo Deposited custody.
- Cancellation is processed before a delayed notification; the delayed notification cannot strand or silently accept the NFT.
- NFT transfer bounce restores a recoverable state only when sender, destination, original opcode, and query ID all match the persisted operation.
- Duplicate ownership notifications and callbacks are idempotent.
- A cancelled old product cannot delete or overwrite a newer product's NFT Item index.
- All race cases are exercised with an official supported NFT Item implementation, not only a permissive mock.

## Gate for purchase implementation

Do not implement buyer purchase/release/payout handlers on top of an unresolved escrow deposit lifecycle. The following must be completed first:

1. Specify and freeze the deposit cancellation/recovery handshake and exact message ABI.
2. Add explicit persisted operation states and bounce/retry semantics.
3. Add adversarial race and replay tests from the matrix above.
4. Decide the storage version and migration strategy. Existing Marketplace/Escrow storage layouts are already serialized; adding fields/maps requires a fresh deployment or a separately tested migration. Do not overwrite an existing contract's data layout.
5. Pass contract build, tests, linter, formatter, frontend build, and wallet identity audit on the resulting commit.

## Non-goals and deployment safety

- No purchase message or buyer order is implemented by this audit.
- No payment verification, NFT release to buyers, seller payout, or platform payout is implemented.
- No mainnet deployment, production database migration, or live NFT/TON transfer is performed.
- The PR must remain Draft until the complete protocol, storage strategy, tests, and testnet rehearsal are reviewed.

## Follow-up recovery protocol

The detailed fail-closed recovery decision and implementation gates are maintained in [`ESCROW_PENDING_RECOVERY_PROTOCOL_V1.md`](./ESCROW_PENDING_RECOVERY_PROTOCOL_V1.md). In particular, a timeout, missing notification, or CreateEscrow bounce is not proof of seller ownership and must never release the NFT listing index.
