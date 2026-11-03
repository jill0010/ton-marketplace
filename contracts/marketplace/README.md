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
6. MarketplaceV2 sends the exact deposit ACK, allowing Escrow to clear its durable callback.

This is a listing/custody integration milestone only. V2 checks the approved Fragment Gift Collection, recognized Item Code hash, and Item address derived from the collection and index before creating custody. It also validates the TEP-62 forward-payload marker and exact escrow query ID before accepting an ownership notification. The dedicated `marketplace-v2-official-item-transfer.integration.test.tolk` now registers and deploys the allowlisted Fragment Item Code in the emulator through the collection deployment ABI, verifies the initial owner with `get_nft_data`, rejects a non-owner transfer attempt, executes the seller's standard TEP-62 transfer to Escrow, and verifies the Item getter reports Escrow as the new owner before asserting the deposit callback/ACK lifecycle. Other focused adversarial tests still inject malformed or forged notifications to exercise validation branches. This is emulator evidence for the recognized Item Code fixture, not a testnet/mainnet rehearsal or a guarantee covering every live Fragment collection version. V2 does not implement a buyer purchase/payment entrypoint, release NFTs through a MarketplaceV2 order, pay sellers/platform, or refund buyers. It is not safe for production listing or purchasing.

## Important: buying and settlement are not implemented

This is **not yet a complete marketplace**. There is no buyer purchase message, payment/order state machine, NFT delivery to buyer, seller payout, or 97% / 3% fee split. The `Order` structures currently present in the types are not wired into a purchase flow.

The frontend NFT publish endpoint remains fail-closed. MarketplaceV2 is source/emulator-only and must not be exposed to real users until official collection verification, deployment, cancellation/recovery, purchase, delivery, refund, and settlement controls are complete. Do not accept real buyer funds or list real NFTs using this prototype.

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
