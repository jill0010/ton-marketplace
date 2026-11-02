# Marketplace Storage Layout V2 — Deployment Gate

Date: 2026-11-02

## Why this document exists

The Marketplace contract storage now contains an NFT Item uniqueness index:

`assetListings: map<address, uint64>`

The map is serialized as part of `MarketplaceStorage`, between `products` and `orders`. Adding this field changes the serialized storage cell layout. The new contract source must not be assumed compatible with an address initialized using the previous `MarketplaceStorage` definition.

## V2 semantics

- Key: canonical TON NFT Item address.
- Value: product ID reserved by that NFT.
- Missing key or value `0`: available for a new listing.
- Nonzero value: reserved by a Pending or Active product.
- Reservation is written atomically with creation of a Pending product.
- Reservation is released only when the configured Escrow's authenticated refund callback matches the product's query ID, NFT Item and seller, and the map still points to that exact product ID.
- A replayed refund callback for an already-cancelled product is ACKed without changing the map. It cannot clear a newer product's reservation.

## Compatibility rule

The current contract has no safe in-place migration handler. A prior storage cell cannot be loaded as V2 merely by deploying the updated source: field decoding may fail or interpret subsequent fields incorrectly. Existing products also cannot be assumed to have index entries.

Therefore:

1. Deploy V2 only to a fresh Marketplace address with `assetListings: []`.
2. Do not update code at a legacy Marketplace address.
3. If a legacy deployment is discovered, keep it unchanged while preparing a separately reviewed migration or new-address cutover. The migration must enumerate every Pending/Active product, reject duplicate NFT addresses, and construct the complete index before enabling V2 operations.
4. Do not synthesize an empty index for a non-empty legacy product map.
5. Test the exact serialized cells, deployment script, getter behavior, and callback lifecycle on a disposable chain/testnet before any production decision.

## Repository deployment status

This change only updates source, tests and documentation on the GitHub feature branch. It does not deploy a contract, change an existing contract address, move NFTs, or authorize mainnet use. Confirm whether any contract exists outside this repository workflow before choosing a deployment path.

## Required gates before any deployment

- [ ] Confirm the target address is new, or approve a separately reviewed migration plan.
- [ ] Verify V2 storage serialization and all initializers against the exact Acton/Tolk toolchain.
- [ ] Run the full Contracts workflow on the exact release commit.
- [ ] Complete testnet deployment and duplicate-listing/refund/re-listing rehearsal.
- [ ] Review bytecode, admin/owner controls, escrow address configuration and key custody.
- [ ] Obtain explicit operational approval for the target network and address.
