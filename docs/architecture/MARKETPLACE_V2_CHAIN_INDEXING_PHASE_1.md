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
- transaction, inbound-message and parent hashes decode to exactly 32 bytes (TON Center V3 base64/base64url or hexadecimal forms are normalized to canonical hex);
- a positive masterchain block sequence number;
- transaction is not emulated or aborted;
- compute and action phases both report success;
- inbound TON value equals decoded gross price plus exactly 200,000,000 nanoTON.

The returned `marketplaceTransactionHash` is the Marketplace contract transaction hash. It is intentionally not labelled as the buyer wallet's root payment transaction hash: TON Center message/transaction linkage must be followed and independently verified before populating `marketplace_orders.payment_tx_hash` or the reserve ledger.

## TON Center V3 observation parser

The shared read-only parser now scans a V3 transaction page and extracts only candidate inbound `BuyProductV2` messages that pass the decoder and transaction-success gates. It requires a parent transaction hash and returns it as `parentTransactionHash` only. This is a linkage hint, not proof that the parent is the buyer wallet's root transaction.

TON amounts are accepted only as decimal strings. Numeric JSON values are rejected to avoid JavaScript precision loss for nanoTON values.

Automated Deno tests cover a valid V3 fixture, unrelated rows, failed and unfinalized transactions, missing parent linkage, incorrect reserve payment, and imprecise numeric amounts. The tests and type checks are included in the frontend workflow.

## Next indexer gates — not implemented here

Before any write path is enabled, the indexer must:

1. Resolve the unique order ID through `orderIdForProductV2(productId)`; never infer it from transaction ordering.
2. Read `orderCellV2(orderId)` to obtain the exact persisted order Cell rather than assuming a flattened TVM stack layout; decode the root and its nested party, asset, settlement and operations references against the declared `MarketplaceV2Order` structs. The existing typed `orderV2(orderId)` getter remains available for contract-side callers and tests.
3. Verify buyer, seller, treasury, NFT Item, collection, escrow ID, gross amount, processing reserve, payment query ID and all payout/release query IDs against the immutable on-chain order.
4. Follow the inbound message's transaction linkage to the buyer wallet root transaction and then request exactly one complete, finalized trace for that root.
5. Verify the Marketplace, Escrow and NFT Item fee attribution and reconcile actual reserve cost without including unrelated wallet fees.
6. Upsert the order mirror and reserve ledger atomically and idempotently; conflicting snapshots must enter manual review, never overwrite the chain facts.
7. Keep all refunds disabled until a separate on-chain refund liability/dispatch design is audited and tested.

No transaction sending, signing, testnet deployment, mainnet deployment or database write is part of phase 1.


## Admin read-only transaction page

The `admin-observe-marketplace-v2` Edge Function is an administrator-only, read-only endpoint. It queries the fixed TON Center mainnet V3 `/transactions` endpoint for the configured Marketplace V2 account and returns candidate observations only. It does not create or update database rows.

Pagination is bounded: `limit` defaults to 100 and must be 1–1000; `offset` defaults to 0 and is capped at 100,000; optional `start_lt` must be a decimal uint64 string. Requests are sorted ascending by logical time. The caller may not query an arbitrary account: the supplied account must normalize to the configured Marketplace V2 address. TON Center's documented offset pagination is used; the response returns the next offset and last logical time so an operator can continue a bounded scan.

The endpoint requires the configured TON Center API key and an authenticated, non-anonymous administrator session. No API key is exposed to the browser. Automated tests cover request bounds, defaults, cursor validation and URL construction. The function remains un-deployed until its configuration and deployment are separately reviewed.


## Buyer wallet root transaction verification

TON Center V3 exposes `GET /transactionsByMessage`, which accepts a message hash and a direction filter. The admin-only `admin-resolve-marketplace-v2-payment-root` endpoint uses `direction=out` for the observed Marketplace inbound message hash. A candidate is accepted only if exactly one returned transaction:

- belongs to the exact buyer address decoded from the Marketplace inbound message;
- is finalized, non-emulated, non-aborted, and has successful compute and action phases;
- contains an outbound message with the exact same 256-bit message hash;
- has that outbound message sourced from the buyer and destined for the configured Marketplace V2 contract.

Zero matches remain unmatched; multiple exact matches are ambiguous and rejected. The resolved value is explicitly named `buyerWalletRootTransactionHash`. This is a read-only verification endpoint and does not persist anything. The upstream `in_msg_tx_hash` field is retained as a hint only; it is not trusted as the root hash.

Tests cover the exact URL, unique valid match, wrong wallet, wrong message, failed transaction, no match and ambiguous matches.


## Admin read-only order Cell inspection

The `admin-inspect-marketplace-v2-order` Edge Function accepts one positive decimal uint64 `order_id`, authenticates the configured administrator, and calls TON Center V3 `POST /api/v3/runGetMethod` for the fixed configured Marketplace V2 address and the `orderCellV2` getter. The request encodes the ID as a hexadecimal TVM number stack entry. The response decoder accepts only a single documented cell stack entry (legacy V3 `type: cell, value: <base64 BOC>` or the typed TVM cell `tvm.stackEntryCell` form), then decodes the BOC against the exact MarketplaceV2Order layout and checks that the returned order ID equals the requested ID.

This endpoint is read-only: it performs no database writes, signing, or transactions. It is not expected to work against the earlier Testnet deployment because that deployment predates the `orderCellV2` getter. It is not deployed yet. The function must be deployed only after confirming the current contract address and getter version; no deployment or chain action is part of this change.


The admin order inspection endpoint also accepts a `product_id`. In that mode it first calls `orderIdForProductV2(productId)`, then calls `orderCellV2(orderId)`, and verifies that the decoded immutable order still contains the requested product ID. TON Center V3 number stack arguments and results are encoded as decimal strings; the implementation and tests follow that documented format. A null product-to-order result is reported as not found, not guessed from transaction ordering.
