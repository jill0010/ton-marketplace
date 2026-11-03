# TON Marketplace Contracts

This directory contains an experimental Tolk/Acton implementation of the TON marketplace escrow prototype.

## Contracts

- `contracts/Marketplace.tolk` — V1 product publication, pending/active/cancelled state, and callbacks from the V1 escrow contract.
- `contracts/MarketplaceV2.tolk` — isolated V2 listing registration, NFT Item uniqueness reservation, and authenticated NFTEscrowV2 deposit callback/ACK integration.
- `contracts/NFTEscrow.tolk` — official collection/item-code allowlisting, NFT deposit verification, seller refunds, and retryable callbacks.
- `contracts/types.tolk` — storage structures, message ABI and error codes.
- `wrappers/` — generated contract wrappers.
- `tests/` — emulation tests, including NFT deposit and refund integration.

## Current functionality

The V1 prototype supports:
1. seller submits a listing request;
2. Marketplace creates a pending product and asks Escrow to prepare a record;
3. seller transfers the NFT to Escrow using the TEP-62 ownership transfer flow;
4. Escrow verifies the NFT sender, previous owner, query ID and forward payload;
5. Marketplace marks the product active after the authenticated Escrow callback;
6. seller or Escrow owner can request a refund;
7. refund is marked complete only after the NFT transfer response, and Marketplace cancels the product after its callback;
8. Marketplace reserves each NFT Item address across Pending and Active listings, and releases that reservation only after the matching refund callback.

## Marketplace V2 listing status

The isolated MarketplaceV2 listing path is implemented and emulator-tested:
1. seller identity is taken from the inbound message sender;
2. MarketplaceV2 reserves the NFT Item address and stores a Pending product;
3. MarketplaceV2 asks the configured NFTEscrowV2 to create a custody record;
4. the seller must transfer the NFT Item to NFTEscrowV2;
5. MarketplaceV2 activates the product only after an authenticated callback matching product ID, query ID, NFT Item, seller, and escrow ID;
6. MarketplaceV2 sends the exact deposit ACK, allowing Escrow to clear its durable callback;
7. the seller (or Marketplace owner) can cancel an Active listing; MarketplaceV2 requests the NFT return from NFTEscrowV2, and only the authenticated NFT Item `excesses` confirmation can mark the listing Cancelled and release the NFT uniqueness index;
8. the exact refund callback is ACKed so NFTEscrowV2 can clear its durable callback record.

This is a listing/custody integration milestone only. V2 checks the approved Fragment Gift Collection, recognized Item Code hash, and Item address derived from the collection and index before creating custody. It also validates the TEP-62 forward-payload marker and exact escrow query ID before accepting an ownership notification. The dedicated `marketplace-v2-official-item-transfer.integration.test.tolk` now registers and deploys the allowlisted Fragment Item Code in the emulator through the collection deployment ABI, verifies the initial owner with `get_nft_data`, rejects a non-owner transfer attempt, executes the seller's standard TEP-62 transfer to Escrow, and verifies the Item getter reports Escrow as the new owner before asserting the deposit callback/ACK lifecycle. Other focused adversarial tests still inject malformed or forged notifications to exercise validation branches. This is emulator evidence for the recognized Item Code fixture, not a testnet/mainnet rehearsal or a guarantee covering every live Fragment collection version. V2 does not implement a buyer purchase/payment entrypoint, release NFTs through a MarketplaceV2 order, pay sellers/platform, or refund buyers. The seller cancellation/refund path is implemented and emulator-tested; bounced or uncorrelated refund requests remain fail-closed for operator review. It is not safe for production listing or purchasing.

## Important: buying and settlement are not implemented

This is **not yet a complete marketplace**. There is no buyer purchase message, payment/order state machine, NFT delivery to buyer, seller payout, or 97% / 3% fee split. The `Order` structures currently present in the types are not wired into a purchase flow.

The frontend NFT publish endpoint remains fail-closed. MarketplaceV2 is source/emulator-only and must not be exposed to real users until testnet rehearsal against current live official collections, deployment, cancellation/recovery, purchase, delivery, refund, and settlement controls are complete. Do not accept real buyer funds or list real NFTs using this prototype.

See [Marketplace Contract Readiness Audit](../../docs/architecture/MARKETPLACE_CONTRACT_READINESS_AUDIT_2026-11-02.md) for the full blockers and required implementation order.

## Build and test

Install the Acton toolchain described by the official Acton documentation, then run from this directory:

```bash
acton build
acton test
acton fmt --check
```

The GitHub Contracts workflow runs the contract build, emulation tests, linter and formatter. Check the latest workflow result for the exact commit before treating a change as verified.

## Storage compatibility and deployment safety

- `MarketplaceStorage` now includes `assetListings: map<address, uint64>` between `products` and `orders`; an absent key means the NFT is available. This changes the serialized storage layout; it is not a drop-in compatible update for a contract initialized with the prior structure.
- The current contract has no on-chain migration/upgrade handler that can safely reconstruct this index from existing products. Do not send the new code to an existing Marketplace address.
- Treat this storage shape as a fresh-deployment schema only. If an older Marketplace was deployed outside this repository workflow, preserve it and design/test a separate migration or deploy a new address with an explicit user-facing cutover. Never assume an empty index for old products.
- A fresh deployment must initialize `assetListings` as an empty map. The deployment script and test fixtures now do so.
- Current source review does not authorize mainnet deployment.
- Use a testnet rehearsal only after the contract ABI, storage layout, upgrade plan and security tests are reviewed.
- Never put signing keys or mnemonic phrases in this repository.
- Mainnet deployment or upgrade requires a separate explicit operational approval.


Latest observed Contracts CI for the architecture branch: workflow #281 succeeded on commit `661aed983cdd0d173e7b4bd3d4e9f474bf0b3766` — opcode registry check (35 declarations, no collisions), build, **99 tests in 12 files**, linter, and formatter. This validates the source/emulator state only; it does not authorize deployment or real-asset use.


Latest observed Contracts CI for the architecture branch: workflow #282 succeeded on commit `a122ed2ba9081b7d35d13d09ee8dbf4f732af4f8` — opcode registry check (35 declarations, no collisions), build, **99 tests in 12 files**, linter, and formatter. This includes regressions rejecting release destinations equal to the seller, Escrow itself, and the NFT Item contract. This validates the source/emulator state only; it does not authorize deployment or real-asset use.


Latest observed Contracts CI for the architecture branch: workflow #297 succeeded on commit `5f13f31a613905cd399f9f7878e5635d0022a3e1` — opcode registry check (35 declarations, no collisions), build, **100 tests in 12 files**, linter, and formatter. The additional test round-trips the V2 immutable order snapshot and separate seller/platform payout liability records. These are serialization-only types; MarketplaceV2 still has no buyer purchase entrypoint and accepts no buyer funds.


NFTEscrowV2 now also has an emulator-tested seller refund primitive: a Marketplace-authorized request transfers the NFT back to its recorded seller, only authenticated NFT Item `excesses` marks it Refunded, a correlated transfer bounce restores Deposited, and the durable callback remains until exact ACK. This is not yet wired to a MarketplaceV2 seller-cancel action; users cannot cancel V2 listings through the Marketplace contract yet.

Latest observed Contracts CI: workflow #322 succeeded on commit `cbc1306c0ba70dd3577b069a1bceeb3d76a8fb1c` — opcode registry check (39 declarations, no collisions), build, **100 tests in 12 files**, linter, and formatter. This validates emulator/source behavior only; no deployment or real-asset use is authorized.


Latest observed Contracts CI: workflow #336 succeeded on commit `4a0261879a0d3be5de4a1bab5859a90dfce82d7d` — opcode registry check (**40 declarations, no collisions**), build, **100 tests in 12 files**, linter, and formatter. The official Item integration test now also exercises unauthorized cancellation rejection and the complete seller NFT return/callback/ACK lifecycle. This is emulator/source verification only; live testnet rehearsal, full purchase/payment/settlement, and production security review remain release gates.
