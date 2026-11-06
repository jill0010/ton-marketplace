# Marketplace V2 chain indexing — phase 1

## Scope

This phase adds a strict decoder and validator for the inbound `BuyProductV2` message. It is deliberately not an indexer and does not write to Supabase, create an order mirror, mark a reserve as reconciled, or authorize a refund.

## Verified ABI

The decoder follows the deployed source ABI declaration:

- opcode: `0x71b00100`
- `productId: uint64`
- `expectedPrice: coins`
- `queryId: uint64`
- `deadline: uint32`

The message body must have exactly one BOC root and no trailing bits or references. Numeric values remain BigInt so nanoTON precision is not lost.

## Candidate transaction gates

The validator additionally requires:

- destination equals the configured Marketplace V2 address after raw-address normalization;
- source address is present and parseable;
- transaction and inbound-message hashes are 256-bit hexadecimal hashes;
- a positive masterchain block sequence number;
- transaction is not emulated or aborted;
- compute and action phases both report success;
- inbound TON value equals decoded gross price plus exactly 200,000,000 nanoTON.

The returned `marketplaceTransactionHash` is the Marketplace contract transaction hash. It is intentionally not labelled as the buyer wallet's root payment transaction hash: TON Center message/transaction linkage must be followed and independently verified before populating `marketplace_orders.payment_tx_hash` or the reserve ledger.

## Next indexer gates — not implemented here

Before any write path is enabled, the indexer must:

1. Resolve the unique order ID through `orderIdForProductV2(productId)`; never infer it from transaction ordering.
2. Read and decode `orderV2(orderId)`, including nested party, asset, settlement and operations cells.
3. Verify buyer, seller, treasury, NFT Item, collection, escrow ID, gross amount, processing reserve, payment query ID and all payout/release query IDs against the immutable on-chain order.
4. Follow the inbound message's transaction linkage to the buyer wallet root transaction and then request exactly one complete, finalized trace for that root.
5. Verify the Marketplace, Escrow and NFT Item fee attribution and reconcile actual reserve cost without including unrelated wallet fees.
6. Upsert the order mirror and reserve ledger atomically and idempotently; conflicting snapshots must enter manual review, never overwrite the chain facts.
7. Keep all refunds disabled until a separate on-chain refund liability/dispatch design is audited and tested.

No transaction sending, signing, testnet deployment, mainnet deployment or database write is part of phase 1.
