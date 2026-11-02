# TON Marketplace Contracts

This directory contains an experimental Tolk/Acton implementation of the TON marketplace escrow prototype.

## Contracts

- `contracts/Marketplace.tolk` — product publication, pending/active/cancelled state, and callbacks from the escrow contract.
- `contracts/NFTEscrow.tolk` — official collection/item-code allowlisting, NFT deposit verification, seller refunds, and retryable callbacks.
- `contracts/types.tolk` — storage structures, message ABI and error codes.
- `wrappers/` — generated contract wrappers.
- `tests/` — emulation tests, including NFT deposit and refund integration.

## Current functionality

The current prototype supports:
1. seller submits a listing request;
2. Marketplace creates a pending product and asks Escrow to prepare a record;
3. seller transfers the NFT to Escrow using the TEP-62 ownership transfer flow;
4. Escrow verifies the NFT sender, previous owner, query ID and forward payload;
5. Marketplace marks the product active after the authenticated Escrow callback;
6. seller or Escrow owner can request a refund;
7. refund is marked complete only after the NFT transfer response, and Marketplace cancels the product after its callback.

## Important: buying and settlement are not implemented

This is **not yet a complete marketplace**. There is no buyer purchase message, payment/order state machine, NFT delivery to buyer, seller payout, or 97% / 3% fee split. The `Order` structures currently present in the types are not wired into a purchase flow.

The frontend NFT publish endpoint remains fail-closed until escrow is fully integrated. Do not accept real buyer funds or list real NFTs using this prototype.

See [Marketplace Contract Readiness Audit](../../docs/architecture/MARKETPLACE_CONTRACT_READINESS_AUDIT_2026-11-02.md) for the full blockers and required implementation order.

## Build and test

Install the Acton toolchain described by the official Acton documentation, then run from this directory:

```bash
acton build
acton test
acton fmt --check
```

The repository Contracts workflow currently has a separate formatter failure. Do not treat the contract suite as green until the formatter and full build/test workflow pass.

## Deployment safety

- Current source review does not authorize mainnet deployment.
- Use a testnet rehearsal only after the contract ABI, storage layout, upgrade plan and security tests are reviewed.
- Never put signing keys or mnemonic phrases in this repository.
- Mainnet deployment or upgrade requires a separate explicit operational approval.
