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
| `0x71b00001` | `CreateEscrowV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00002` | `ReleaseEscrowV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00003` | `EscrowReleasedV2` | NFTEscrowV2 → MarketplaceV2 |
| `0x71b00004` | `EscrowDepositedV2` | NFTEscrowV2 → MarketplaceV2 |
| `0x71b00005` | `EscrowDepositAckV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00006` | `RetryDepositCallbackV2` | Operator → NFTEscrowV2 |
| `0x71b00008` | `EscrowReleaseAckV2` | MarketplaceV2 → NFTEscrowV2 |
| `0x71b00009` | `RetryReleaseCallbackV2` | Operator → NFTEscrowV2 |

Purchase and settlement messages use a separate range to avoid colliding with the already implemented escrow ABI:

| Opcode | Message | Direction |
|---|---|---|
| `0x71b00100` | `BuyProductV2` | Buyer → MarketplaceV2 |
| `0x71b00101` | `SellerPayoutV2` | MarketplaceV2 → Seller |
| `0x71b00102` | `PlatformPayoutV2` | MarketplaceV2 → Treasury |
| `0x71b00103` | `RetryPayoutV2` | Operator → MarketplaceV2 |
| `0x71b00104` | `BuyerRefundV2` | MarketplaceV2 → Buyer |
| `0x71b00105` | `PayoutSettledV2` | Reserved only; not used for ordinary wallets |
| `0x71b00106` | `DispatchPayoutV2` | Permissionless caller → MarketplaceV2 |

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
`PaymentAccepted → DeliveryPending → DeliveryConfirmed → SettlementPending → PayoutsDispatched`.

`PayoutsDispatched` means both independent outbound payout message actions succeeded. A later exact recipient bounce can move the affected leg back to Pending and the order back to SettlementPending. It is not an assertion that the recipient transaction has already reached finality. The application/indexer displays Completed only after it follows both message traces and verifies successful finalized recipient transactions.

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
7. MarketplaceV2 authenticates the callback and marks delivery confirmed. It creates two independent payout liabilities.
8. Each payout leg is dispatched in a separate transaction using its snapshotted beneficiary and exact amount. A permissionless dispatcher cannot change either field.
9. A bounce handler restores only the exact matching liability after checking beneficiary sender, opcode, order ID, operation ID, query ID, amount, and current Dispatched state. Retry reuses the same operation/query IDs.
10. On-chain status becomes PayoutsDispatched when both outbound actions succeed. The indexer follows each message to its recipient transaction and reports user-facing completion only after both recipient transactions are successful and finalized. No beneficiary acknowledgement is required.

No transaction should mark delivery or payout complete merely because an outgoing action was queued.

## Bounce and idempotency rules

- A bounced MarketplaceV2 → Escrow request must not imply NFT release.
- A bounced Escrow → NFT Item transfer restores Deposited only for exact NFT Item sender, release query, new owner, response destination, and current ReleasePending state.
- A duplicate EscrowReleasedV2 callback may re-ACK but must never create another payout.
- Seller payout and platform payout have distinct operation IDs and state. Dispatch each leg in a separate transaction; retrying one leg cannot resend the other.
- Ordinary TON wallets do not automatically send a custom `PayoutSettledV2` acknowledgement. Do not require one.
- A bounced payout remains unpaid. Restore only the exact matching Dispatched liability and retry with the same operation/query identity; never create a second liability.
- The on-chain contract records Dispatched and bounce recovery. The indexer must follow the sender → outgoing message → recipient transaction trace and check recipient compute/action success and finality before showing Completed.
- An ambiguous transaction outcome goes to ManualReview. No timeout-only automatic product reactivation or buyer refund.
- A future design requiring cryptographic beneficiary acknowledgement must restrict beneficiaries to wallets/contracts implementing a documented callback interface; that is not compatible with arbitrary standard wallet addresses.

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
- Phase D: implement independent payout liabilities, permissionless per-leg dispatch, exact RichBounce recovery, and indexer trace finality. Do not require ordinary wallet acknowledgements.
- Phase E: adversarial cross-contract integration tests and measured fee matrix.
- Phase F: fresh-address testnet deployment, code/hash verification, owner/treasury configuration rehearsal, and security review.
- Only after these gates may a separate explicit production deployment decision be considered.

## Current status and safety boundary

This document is a design artifact, not a deployed contract or authorization to receive funds. The current production/prototype Marketplace and NFTEscrow contracts remain unchanged. NFTEscrowV2 has an isolated, emulator-tested release handler, but MarketplaceV2 has no purchase/order/payment entrypoint and cannot invoke that release as a buyer flow. No buyer funds, seller/platform payouts, or buyer refunds are accepted or enabled. No database migration, Edge Function deployment, testnet/mainnet deployment, NFT transfer, or fund movement occurred.


## ABI implementation checkpoint — 2026-11-03

The shared Tolk type module now defines the first V2 release messages:
- `ReleaseEscrowV2` (`0x71b00002`)
- `EscrowReleasedV2` (`0x71b00003`)
- `EscrowReleaseAckV2` (`0x71b00008`)
- `RetryReleaseCallbackV2` (`0x71b00009`)
- `EscrowReleaseCallbackV2` durable callback snapshot
- `EscrowReleaseStatusV2` isolated V2 lifecycle enum

These are message/data declarations only. No contract currently accepts or emits them. They do not modify V1 serialized storage. The remaining proposed V2 opcode assignments are not frozen. A complete ABI collision scan, wrapper review, and serialization tests remain mandatory before ABI freeze.


## NFTEscrowV2 implementation checkpoint

The isolated contract now includes Marketplace-authorized escrow record creation, TEP-62 deposit notification handling, durable deposit callback + ACK/retry, Marketplace-authorized NFT release, authenticated NFT Item excesses confirmation, durable release callback + ACK/retry, and RichBounce recovery to the deposited state. The integration test uses the repository's MockNFTItem and exercises deposit, release to buyer, forged Marketplace request rejection, callback persistence, and ACK identity checks.

This implementation remains a first contract slice, not an end-to-end marketplace: MarketplaceV2 purchase/payment/order settlement handlers are not implemented. NFTEscrowV2 itself now enforces the configured Fragment Gift Collection allowlist, recognized Item Code hash, and deterministic Item address derivation before creating custody records. Official Fragment NFT Item emulator coverage has been added; testnet rehearsal against current live collection deployments, operational allowlist governance, and further bounce/low-gas adversarial coverage remain required. No V2 deployment or funds/NFT movement has occurred.


## V2 NFT Item custody uniqueness hardening — 2026-11-03

- Added `assetToEscrow: map<address, uint64>` to the isolated `NFTEscrowV2Storage`; a NFT Item cannot be registered under a second query ID while a custody record is active.
- The exact authenticated `NftExcesses` confirmation for the pending release deletes the NFT Item index only when it still points to that escrow ID. A failed release Bounce keeps the reservation because it restores the record to Deposited.
- Added an integration regression for duplicate registration with a different query ID, and for re-registration by the buyer after confirmed delivery.
- Added a read-only getter for test assertions. This changes only the not-yet-deployed V2 storage layout; it is not compatible with any previously serialized V2 state and requires a fresh V2 address if an earlier V2 deployment ever exists.
- The latest observed Contracts workflow run #150 failed in the pre-existing V2 integration-test initializer before this uniqueness patch was present. The latest source revision still requires a fresh Contracts CI run; no pass is claimed here.
- No MarketplaceV2 purchase/payment/settlement handlers, production migration, Edge Function deployment, contract deployment, testnet/mainnet transaction, NFT transfer, or fund movement was added.


## V2 release bounce recovery regression — 2026-11-03

- The Contracts #150 failure log identified a stale test initializer that supplied `depositCallbacks` as a direct `NFTEscrowV2Storage` field. The actual storage schema nests callback maps under `callbacks: Cell<NFTEscrowV2CallbackStorage>`; the test initializer now explicitly constructs both structs.
- Replaced the inconclusive low-balance experiment with a real NFT Item compute-phase rejection test using the test-only `RejectingNFTItem`.
- The NFT Item rejects transfer to the buyer and emits a real RichBounce to V2 Escrow. The test asserts the NFT remains owned by Escrow, the record returns to Deposited, and the NFT custody index remains reserved.
- The test controller then disables rejection and retries the exact same release query ID. The retry transfers the NFT to the buyer, authenticated excesses marks the record Released, and the custody index is cleared only after that confirmation. The exact Marketplace acknowledgement still gates callback cleanup.
- CI Contracts #159 on commit `565bc9d`: success — build, 96 tests in 9 files, linter, and formatter.
- The workflow now also runs on pushes to `architecture/unified-trading-v1`, so branch commits receive direct contract validation.
- No contract deployment, production migration, or NFT/fund movement was performed.


## V2 malformed release-bounce hardening — 2026-11-03

- Wrapped RichBounce envelope and original TEP-62 `NftTransfer` decoding in a defensive try/catch. A truncated envelope or transfer body is ignored without failing the bounce transaction or mutating escrow state.
- Callback bounce handling now ignores a bounced callback-shaped message unless its sender is the configured Marketplace; the durable callback remains available for owner-authorized retry.
- Added regressions for a truncated RichBounce envelope and a valid RichBounce envelope containing a truncated original NFT transfer body. Both are sent as bounced messages from the configured NFT Item and must be accepted as safe no-ops.
- Contracts CI #162 on commit `cf89085`: success — build, 96 tests in 9 files, linter, and formatter.
- The same test suite also verifies a real NFT Item compute-phase rejection, bounce recovery to Deposited, reservation retention, and successful retry with the same query ID.
- No production deployment, database migration, or NFT/fund movement was performed.


## Opcode collision audit — 2026-11-03

- Added the canonical registry at `docs/architecture/TON_MARKETPLACE_OPCODE_REGISTRY_2026-11-03.md`.
- Repository Tolk message declarations show `0x71b00001` is already assigned to `CreateEscrowV2`; the prior design table incorrectly reused it for `BuyProductV2`.
- Kept every existing V1, TEP-62, and V2 escrow opcode unchanged. Reserved purchase and settlement messages in the non-overlapping `0x71b00100–0x71b00105` range.
- This is a protocol/documentation correction only. No purchase entrypoint, payment receiver, payout handler, or refund handler was implemented or enabled.
- A full pre-implementation scan of generated wrappers and deployment artifacts remains a required gate before ABI code generation.


## V2 release callback bounce and retry regression — 2026-11-03

- Extended the V2 release integration test to inject a bounced `EscrowReleasedV2` callback from the configured Marketplace address after NFT delivery.
- Verified the callback snapshot remains readable after the bounce and is not cleared by the bounce handler.
- Verified a non-owner cannot trigger `RetryReleaseCallbackV2`; the configured Escrow owner can retry it.
- Verified a successful retry dispatch still does not clear the durable callback. The exact Marketplace `EscrowReleaseAckV2` remains the only cleanup path.
- Contracts CI #169 on commit `fbb0f10`: success — opcode registry check (27 declarations, no collisions), build, 96 tests in 9 files, linter, formatter.
- This is an injected bounce regression, not a full action-phase failure against a rejecting Marketplace contract. A dedicated rejecting callback recipient and end-to-end action-phase bounce test remain a follow-up.
- No purchase entrypoint, fund acceptance, payout handler, deployment, migration, NFT transfer outside emulation, or production transaction was enabled.

## V2 real Marketplace callback Action-phase bounce verification — 2026-11-03

- Added a test-only Marketplace callback receiver that deliberately attempts an unaffordable outgoing message while processing `EscrowReleasedV2`.
- The rejecting action uses `SEND_MODE_BOUNCE_ON_ACTION_FAIL` in addition to regular send mode. This is required to make an Action-phase send failure bounce the inbound callback transaction; merely setting the inbound message's `BounceMode` is not sufficient for this case.
- The integration test verifies all of the following in one real emulator trace:
  - NFT ownership changes from Escrow to the buyer;
  - the callback receiver's transaction fails in Action phase with `noFunds`;
  - the failed callback produces a real bounced child transaction from the Marketplace fixture back to NFTEscrowV2;
  - the durable release callback remains stored after the bounce;
  - an owner-authorized retry succeeds after the receiver stops rejecting;
  - only the exact Marketplace `EscrowReleaseAckV2` clears the durable callback.
- The test does not decode the optional TLB bounce-phase field directly; it asserts the actual bounced transaction in the emulator trace, avoiding a brittle optional-field parser dependency.
- Contracts workflow #191 on commit `c3e1e368cd34a4ff5e2854b74dd3a263af159b6d`: success — opcode registry check, build, **97 tests in 10 files**, linter, and formatter.
- The test-only rejecting callback contract and its generated wrapper are registered in Acton. The production NFTEscrowV2 callback amount remains unchanged; no additional fixed-fee sufficiency claim is made.

This proves the isolated V2 release callback's Action-phase bounce/retry behavior in emulation only. It does not implement MarketplaceV2 purchase/payment, seller/platform payout, buyer refund, or production deployment. No production database migration, Edge Function deployment, testnet/mainnet contract deployment, NFT transfer, or fund movement occurred.

## Marketplace V2 listing integration checkpoint — 2026-11-03

- Added `MarketplaceV2.tolk` with a fresh, independent storage layout. It does not change or reuse V1 Marketplace storage.
- Added seller-originated `PublishProductV2` and owner-only `SetMarketplaceV2Escrow` messages.
- MarketplaceV2 derives the seller from `in.senderAddress`, reserves each NFT Item address before sending `CreateEscrowV2`, and allocates product IDs and escrow query IDs from separate monotonic counters.
- Product state remains Pending until NFTEscrowV2 sends an authenticated `EscrowDepositedV2` callback. The callback must match the configured Escrow sender, product ID, query ID, NFT Item, seller, and nonzero escrow ID.
- MarketplaceV2 sends an exact `EscrowDepositAckV2`; duplicate exact callbacks are idempotently re-ACKed.
- The configured V2 Escrow address is immutable after initial owner configuration; owner rotation is rejected to avoid stranding custody callbacks.
- Integration tests reject a forged `EscrowDepositedV2` callback even when its body contains otherwise exact product fields.
- An exact RichBounce for a pending `CreateEscrowV2` request cancels that pending listing and releases only its matching NFT Item index. Malformed, stale, or mismatched bounces are no-ops.
- Added an end-to-end emulator test covering owner-only Escrow configuration, pending listing creation, NFT custody transfer, callback-authenticated activation, duplicate NFT listing rejection, and deposit callback ACK cleanup.
- Opcode registry check reports 33 Tolk declarations with no collisions.
- Contracts workflow #201 on commit `431923431dcefd378c43ccff9736c32063fa7776`: success — build, **98 tests in 11 files**, linter, and formatter.
- Security hardening: Escrow binding is one-time/immutable and forged callback rejection is tested. Contracts workflow #205 on commit `d1c77c9eb167fb0da6c0e72d0a895d7d680ccce9`: success — opcode check (33 declarations, no collisions), build, **98 tests in 11 files**, linter, and formatter.

### Explicit limits

- V2 Escrow validates the configured Fragment Gift Collection allowlist, recognized Item Code hash, and deterministic Item address derived from collection + item index before accepting custody. The official Item Code fixture is now deployed and transferred in emulator integration tests. This is not yet a testnet rehearsal against live Fragment deployments, and it does not prove every future collection/code revision; allowlist governance and testnet verification remain release gates.
- `BuyProductV2` and payout/refund messages remain reserved and are not accepted by MarketplaceV2.
- No buyer funds are accepted; no NFT release from MarketplaceV2, seller/platform payout, buyer refund, production database migration, Edge Function deployment, testnet/mainnet deployment, or real NFT/fund movement occurred.
- The V2 contract is not approved for production listing or purchase. It remains isolated source/emulator work pending official collection verification and the complete purchase/delivery/refund/settlement lifecycle.


## Official Fragment Item provenance and transfer verification — 2026-11-03

- Added `marketplace-v2-official-item-transfer.integration.test.tolk`, which registers the recognized Fragment Item Code fixture, deploys the actual Item code through the collection deployment ABI, and checks `get_nft_data` before and after the seller's standard TEP-62 transfer.
- The test verifies the seller is the initial owner, a non-owner transfer is aborted without changing ownership, the seller can transfer to NFTEscrowV2, and the Item getter then reports Escrow as owner.
- The same integration trace checks MarketplaceV2's authenticated deposit activation and exact deposit callback ACK lifecycle.
- Additional parser-focused tests continue to inject forged, malformed, replayed, wrong-query, and trailing-data notifications; these are intentionally separate from the real Item transfer trace.
- Contracts workflow #281 on commit `661aed9`: success — opcode registry check (**35 declarations, no collisions**), build, **99 tests in 12 files**, linter, and formatter.
- The emulator test uses the recognized Item Code fixture; a testnet rehearsal against live Fragment Collection deployments and explicit allowlist operations remain required.
- No buyer purchase/payment entrypoint, payout/refund handler, database migration, Edge Function deployment, testnet/mainnet deployment, NFT transfer outside emulation, or fund movement was enabled.


## Escrow release destination hardening — 2026-11-03

- During release-path review, identified that a trusted Marketplace request could still name the Escrow contract or the NFT Item contract itself as the buyer. Either destination could leave the NFT trapped while the release state machine marked the record Released.
- `NFTEscrowV2` now rejects buyer addresses equal to the Escrow's own address, the NFT Item address, or the original seller before it persists ReleasePending or sends a TEP-62 transfer.
- The release integration test asserts all three invalid destinations fail and that the NFT remains owned by Escrow, the record remains Deposited, and the NFT custody index remains reserved.
- Contracts workflow #282 on commit `a122ed2ba9081b7d35d13d09ee8dbf4f732af4f8`: success — opcode registry check (35 declarations, no collisions), build, **99 tests in 12 files**, linter, and formatter.
- This closes a destination-validation edge case in the isolated escrow release handler. It does not implement MarketplaceV2 purchase/payment, payout/refund, or authorize testnet/mainnet deployment.


## V2 immutable order and payout snapshot schema — 2026-11-03

- Added serialization-only types for `MarketplaceV2Order`, its immutable snapshot, and independent `MarketplaceV2Payout` liabilities. No purchase message handler or buyer-fund acceptance was added.
- The order snapshot captures buyer/seller/treasury, NFT Item/collection/index/Escrow ID, gross amount, fee basis points and rounding version, platform fee, seller proceeds, processing reserve, and distinct payment/release/seller-payout/platform-payout/buyer-refund query IDs.
- The seller and platform payout legs each have their own operation ID, query ID, beneficiary, amount, kind, and status; a retry of one leg can be modeled without resending the other.
- The snapshot is split into bounded nested cells (parties, asset, settlement, operations) so each serialized cell remains below TON's 1023-bit cell limit. A round-trip test verifies every field and conservation of gross = seller proceeds + platform fee.
- These declarations are not yet wired into `MarketplaceV2Storage`, and no order map, purchase entrypoint, payout handler, or refund handler is enabled. This intentionally keeps the current listing storage and behavior unchanged while the schema is reviewed.
- Contracts workflow #297 on commit `5f13f31a613905cd399f9f7878e5635d0022a3e1`: success — opcode registry check (35 declarations, no collisions), build, **100 tests in 12 files**, linter, and formatter.


## NFTEscrowV2 seller refund lifecycle — 2026-11-03

- Added `RefundEscrowV2`, `EscrowRefundedV2`, `EscrowRefundAckV2`, and `RetryRefundCallbackV2` messages in the registered V2 opcode range.
- The refund request is accepted only from the configured Marketplace and must match the existing escrow ID, product ID, and recorded seller. The Escrow sends a standard TEP-62 transfer back to that seller.
- The NFT Item's authenticated `excesses` confirmation is the only success signal: the record becomes Refunded and the NFT custody index is cleared only after that confirmation. A correlated RichBounce restores Deposited and retains the index, allowing retry with the same query ID.
- Refund callbacks persist until an exact Marketplace ACK. A bounced callback remains retryable by the Escrow owner; forged callers and mismatched ACK fields are rejected.
- Callback storage is split into nested release/refund cells to stay within TON's maximum four references per cell. The V2 storage layout changed and requires fresh deployment addresses if ever deployed; no V2 deployment exists.
- Contracts workflow #322 on commit `cbc1306c0ba70dd3577b069a1bceeb3d76a8fb1c`: success — opcode registry check (**39 declarations, no collisions**), build, **100 tests in 12 files**, linter, and formatter.
- MarketplaceV2 now exposes `CancelProductV2` (opcode `0x71b00012`) for the recorded seller or Marketplace owner. It stores a distinct refund query ID, transitions the product to RefundPending, and asks NFTEscrowV2 to return the exact escrowed Item to its recorded seller.
- MarketplaceV2 accepts `EscrowRefundedV2` only from the configured Escrow and only when escrow ID, product ID, refund query ID, NFT Item, and seller all match. It then marks the product Cancelled, releases only the matching NFT listing index, and sends an exact `EscrowRefundAckV2`.
- The real official Item integration test now rejects cancellation from an unrelated wallet, executes seller cancellation, verifies `get_nft_data` reports the seller as the new owner, checks Escrow status Refunded and both custody/listing indexes cleared, and confirms the durable refund callback was ACKed.
- Contracts workflow #336 on commit `4a0261879a0d3be5de4a1bab5859a90dfce82d7d`: success — opcode registry check (**40 declarations, no collisions**), build, **100 tests in 12 files**, linter, and formatter.
- Scope boundary: seller cancellation and seller NFT return are now implemented and emulator-tested. Buyer purchase/payment, buyer refund, seller/platform payment settlement, testnet rehearsal, and production deployment remain unimplemented. The refund messages do not accept buyer funds.


## Payout finality decision — ordinary TON wallets

The payout confirmation model has been corrected in [TON Marketplace V2 — Payout Finality and Bounce Recovery Decision](TON_MARKETPLACE_PAYOUT_FINALITY_DECISION_2026-11-03.md). Ordinary wallet beneficiaries do not automatically send a custom acknowledgement. Each payout leg is independently dispatched to its immutable beneficiary, and an exact RichBounce restores only that leg. On-chain state records `Dispatched`; an indexer verifies the recipient transaction and finality before displaying user-facing completion. `PayoutSettledV2` remains reserved but is not used in the arbitrary-wallet model. The order enum uses `PayoutsDispatched`, not a false on-chain claim of beneficiary-acknowledged completion.
