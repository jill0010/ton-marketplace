# Marketplace V2 Purchase and Settlement Protocol

Status: V2 purchase, delivery, payout and compensation handlers are implemented in source; CI and testnet verification remain deployment gates. No mainnet deployment or production activation has occurred.

The V2 Marketplace and V2 NFT Escrow must be deployed as a fresh, paired deployment; V1 storage is not compatible. The isolated V2 deployment script is separate from the legacy V1 deploy script.

## Trust and custody model

**V2 custody clarification:** buyer purchase principal is sent to the Marketplace V2 contract and held there under the order/liability state machine. The separately designated external marketplace custody wallet is not used as the buyer-payment recipient in this contract flow. The deployer wallet is the contract owner; the immutable platform treasury wallet receives the 3% platform fee. Confirm these roles before mainnet deployment.

- Asset kind is explicit and versioned: `1` = collectible username, `2` = collectible +888 phone number, `3` = collectible gift. The Marketplace and Escrow accept only these three kinds, and the Escrow requires the configured collection Item Code kind to match the listing.
- Collection Item Code is still restricted to the two code hashes hardcoded in `NFTEscrowV2`; each official collection's actual on-chain code hash must be independently checked before the owner configures it. No collection is approved by the V2 deploy script.

- Wallet address is the sole marketplace identity. The buyer is always the authenticated internal-message sender; no frontend-supplied buyer address is trusted.
- A listing is purchasable only while Marketplace V2 has an authenticated Escrow deposit confirmation and the corresponding NFT is still reserved by Escrow.
- The immutable order snapshot records buyer, seller, treasury, NFT Item, collection, item index, escrow ID, exact gross price, fee policy version, and independent operation/query IDs.
- Funds are held by Marketplace V2 after a valid purchase message. The database and indexer are mirrors only; neither can authorize delivery or settlement.
- The NFT is released only by the configured Escrow, to the buyer address captured in the order snapshot.
- No owner/admin action may redirect an order's buyer, seller, NFT, price, treasury, or payout beneficiary after payment acceptance.

## Message protocol

Distinct opcodes are registered for the implemented purchase and settlement messages. `PublishProductV2` includes the seller's expected next product ID and query ID; the contract checks both against storage before creating the pending escrow record. The seller can read `nextProductIdV2` and `nextQueryIdV2` first, then use that exact query ID in the TEP-62 NFT transfer to Escrow. The publish ABI stores the variable-sized item details in a referenced cell to remain below TON's 1023-bit message-cell limit.
- Buyer purchase request: product ID, unique replay-protected query ID, expected price, and a deadline limited to 15 minutes. The buyer is derived from the internal-message sender; there is no client-supplied buyer field.
- Escrow release request: existing `ReleaseEscrowV2` ABI, with the order's immutable buyer and asset tuple.
- Escrow release success/failure callbacks: existing `EscrowReleasedV2` / `EscrowReleaseFailedV2` ABI, correlated against the exact order, product, escrow, query, NFT and buyer.
- Escrow callback acknowledgements: existing exact `EscrowReleaseAckV2` / `EscrowReleaseFailureAckV2` ABI.
- Independent seller and platform payout retry requests, each keyed to a persisted payout operation ID and query ID.
- Buyer refund dispatch after seller NFT return is confirmed, plus exact refund bounce/retry tracking through the same persisted payout-liability map.

Do not reuse a query ID across payment, release, seller payout, platform payout, or buyer refund. A duplicate request is accepted only if every immutable field matches the existing operation; otherwise it is rejected.

## Payment acceptance requirements

The contract must validate all of the following before creating an order:
1. Sender is not the seller and is not the Marketplace or Escrow contract.
2. Product exists, is active, and has a non-zero confirmed escrow ID.
3. Product price equals the buyer's expected price at execution time.
4. Attached TON value equals the exact gross price plus a fixed 0.2 TON execution reserve. The reserve is not counted as seller or platform proceeds. The current source retains any unused reserve as Marketplace operating balance; an unused-reserve return path is not yet implemented and must be resolved before mainnet activation.
5. The deadline is current and no more than 15 minutes ahead.
6. The payment query ID has not been consumed or reused across known V2 query indexes.
7. No existing order has reserved the product.

The implementation uses `in.valueCoins` from the pinned Tolk/Acton `InMessage`; it does not trust a client-supplied amount. Underpayment and overpayment both fail the exact-value check and bounce. There is no overpayment acceptance path.

A successful purchase atomically marks the product unavailable, creates the immutable order, two independent payout liabilities and a dormant buyer-refund liability, and records the payment operation before sending any cross-contract message. If the transaction cannot persist all of these changes, it must not emit an Escrow release request.

## Delivery and compensation state machine

Allowed forward path:

`Active listing -> PaymentAccepted -> DeliveryPending -> DeliveryConfirmed -> SettlementPending -> PayoutsDispatched`

- Marketplace sends `ReleaseEscrowV2` only after payment acceptance.
- Escrow must verify the Marketplace sender, escrow/product match, buyer destination restrictions, and exact idempotent release tuple.
- Escrow may mark the NFT released only after an authenticated response from the exact NFT Item contract for the exact transfer query. Its success callback remains durable until exact Marketplace ACK.
- Marketplace accepts success only if every callback field matches the order snapshot and current DeliveryPending state. Duplicate exact callbacks are ACKed without re-running settlement.
- A release bounce/failure is not a successful delivery. Marketplace enters RefundPending, requests the seller NFT return from Escrow, and only dispatches the buyer refund after Escrow confirms the NFT has returned to the seller. A bounced buyer refund is persisted and can be retried by its exact payout operation ID. Seller NFT return retry reuses the correlated listing refund operation.
- Never refund the buyer merely because a callback is delayed. If NFT ownership may have changed but confirmation is missing, move to ManualReview and do not issue a conflicting seller refund.
- If the NFT was confirmed delivered, the buyer refund path is permanently closed.

## Settlement accounting

For gross price G in nanotons:

- Platform fee = floor(G * 300 / 10000).
- Seller proceeds = G - platform fee.
- Platform fee + seller proceeds must equal G exactly.
- Fee rounding policy is versioned and frozen in each order.
- Processing reserve and contract gas are not part of G and must not silently reduce seller proceeds.
- Seller, platform and buyer-refund liabilities are separate persisted records with distinct operation IDs, query IDs, beneficiaries, amounts and statuses. Buyer refund is dormant unless a proven release failure occurs.
- A successful dispatch of one leg must never cause the other leg to be skipped or repeated.
- A bounce changes only the matching leg to Bounced; it must not recreate or resend the other leg.
- Retry is permitted only from the exact Bounced state and uses the same liability/operation identity with a fresh transport query ID.
- Do not mark an order fully settled merely because outgoing messages were enqueued. Expose dispatched versus bounced/reconciled states distinctly.

## V2 storage versioning (implemented)

V2 uses an explicit schema version and durable maps/counters for:
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

No mainnet deployment is permitted until the complete purchase/delivery/refund/settlement path passes emulator tests, both contracts are built from the exact reviewed sources, testnet rehearsal succeeds with real official NFT collection items, contract addresses and code hashes are independently verified, and deployment uses a secure interactive signer. Never put production/mainnet seed phrases or private keys in GitHub, Supabase, chat, or CI secrets. Testnet keys, if used in automation, must belong to disposable low-value wallets only.


## Current implementation checkpoint (2026-11-06)

- `BuyProductV2` validates the internal sender, active escrowed listing, exact expected price, deadline, replay indexes and exact `gross + 0.2 TON` attached value.
- Marketplace persists an immutable order snapshot, seller/platform payout liabilities, and a dormant buyer-refund liability before sending `ReleaseEscrowV2`.
- `EscrowReleasedV2` is correlated against the complete order asset/buyer tuple, acknowledged, and dispatches seller 97% and treasury 3% as independent bounceable transfers.
- Seller/platform payout bounces update only the matching liability. `RetryPayoutV2` dispatches only a bounced liability with a fresh query ID.
- `EscrowReleaseFailedV2` and an exact request-level `ReleaseEscrowV2` RichBounce both enter the seller-return path. Buyer refund is dispatched only after the exact `EscrowRefundedV2` callback confirms the NFT return. A bounced buyer refund uses the same retry-safe payout path.
- The official NFT Item integration test exercises a real deployed allowlisted Item in the emulator, buyer payment, NFT transfer to the buyer, and dual payout dispatch; it also forces a real platform-payout bounce and verifies that only the platform liability is retried.
- The Marketplace compensation suite now includes a test-only rejecting Escrow that accepts listing registration, rejects the actual outbound `ReleaseEscrowV2` in compute phase, produces a real emulator RichBounce, receives the Marketplace `RefundEscrowV2` request, and returns the exact `EscrowRefundedV2` callback. The test verifies the resulting buyer refund liability and order state. This proves the Marketplace request-bounce branch, but the fixture is not the production NFT Escrow and does not prove a real NFT moved back to its seller.
- An earlier V2 build was deployed successfully to Testnet at commit `72bb97a` on 2026-11-05 (GitHub Actions run `42076455498`): Marketplace `kQAc2Wk5SFahaT8KkauB3_R5HZ5ETBZ1IYfh0ZuiAUNZ10Hx`, Escrow `kQBv-bIcUptKjfnvNK79vmUD9DguY0JXvW7JEMWUEOp7I18S`. That deployment approved no collections. The current source has changed since that deployment and must be redeployed/rehearsed on Testnet before any Mainnet release. No V2 contract is deployed to Mainnet.\n- CI confirms the official Fragment public libraries are available on Mainnet, but they are absent on Testnet. The official NFT Item code is registered directly in the local emulator for the provenance/transfer tests. Therefore a real official Fragment NFT Item cannot currently be rehearsed on Testnet with those libraries; do not describe emulator coverage as a real Testnet NFT rehearsal.
- The fixed 0.2 TON execution reserve is a current implementation parameter, not a finalized economic policy. The unused portion is not returned to the buyer. Mainnet activation remains blocked until this economic treatment is explicitly approved and documented.
- The public listing verifier currently enables only verified Fragment Gift Item code hashes (`kind=3`). Collectible usernames and +888 numbers remain fail-closed until their TeleMint Item code hashes are independently verified and added to the contract and publisher allowlists. The deployment script intentionally approves no collections.
- The storefront's escrow checkout remains disabled (`Coming Soon`); the V2 purchase ABI is implemented and emulator-tested, but a production TonConnect purchase/confirmation flow and chain-authoritative order indexing still need completion before customer sales.


## Mainnet signer and preflight boundary (2026-11-06)

- `.github/workflows/deploy-marketplace-v2-mainnet.yml` is a read-only preflight workflow. It no longer loads `DEPLOYER_MNEMONIC` and does not broadcast mainnet transactions.
- The actual deployment command is `acton script scripts/deploy-v2.tolk --net mainnet --tonconnect`, which must be run separately with the authorized deployer wallet connected interactively. Do not replace this with a mainnet mnemonic stored in GitHub Actions, Supabase, or repository files.
- A successful preflight is not authorization to deploy and is not proof that the public storefront is ready to accept customers.
