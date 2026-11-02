# CreateEscrow Bounce Handling Audit — 2026-11-02

> Status: source-level audit and implementation gate. No contract behavior or storage is changed by this document.

## Scope and source evidence

Reviewed the current Marketplace message construction, `onBouncedMessage`, `CreateEscrow` ABI, Marketplace storage/product structures, and the Tolk standard-library definition of bounced messages.

Current source facts:
- Both initial `PublishProduct` and owner `RetryCreateEscrow` send `CreateEscrow` with `BounceMode.Only256BitsOfBody`.
- `CreateEscrow` is serialized as opcode (32 bits), `nftItem: address`, `collection: address`, `seller: address`, `productId: uint64`, `kind: uint8`, and a referenced `extra` cell.
- The Marketplace `onBouncedMessage` handler is empty.
- Marketplace currently persists no CreateEscrow bounce marker or retry outcome.
- The Marketplace product remains Pending and the NFT Item index remains reserved when the CreateEscrow message bounces. This is conservative and must remain so.

## Finding B1 — The current 256-bit bounce body cannot identify a CreateEscrow request

Tolk documents `BounceMode.Only256BitsOfBody` as the 0xFFFFFFFF bounced prefix followed by only the first 256 bits of the original body.

The current `CreateEscrow` body starts with a 32-bit opcode followed by a full TON address for `nftItem`. The opcode plus the full address cannot fit inside those 256 bits. The remaining identity fields (`collection`, `seller`, `productId`, and the referenced `extra`) are not available in this truncated bounce body.

Consequently, the Marketplace cannot safely parse the current bounced body to correlate a bounce with a specific product/query or verify the NFT Item identity. It must not infer a product from a partial address, message ordering, or the most recently published product.

## Finding B2 — The handler currently discards all bounce information

`onBouncedMessage(_in: InMessageBounced) {}` does not record or expose the failure. The Pending product and NFT reservation remain unchanged. This is safe with respect to asset uniqueness but leaves operators without an on-chain failure marker.

## Tolk-supported full-body format

The Tolk standard library defines:
- `BounceMode.RichBounce`: bounce body is `RichBounceBody`, which contains `originalBody: cell`, original message information, bounce phase, and exit code.
- `BounceMode.RichBounceOnlyRootCell`: the original body root is retained without its references.
- `InMessageBounced.senderAddress`: the internal address from which the message was bounced.
- For ordinary 256-bit bounce mode, the standard helper is `skipBouncedPrefix()`.

Because the `CreateEscrow.extra` field is a referenced cell and the exact product/query correlation must be retained, a future implementation should evaluate `RichBounce`, not `RichBounceOnlyRootCell`, and decode the complete `CreateEscrow` from `RichBounceBody.originalBody`.

This is a format-level recommendation only. The exact Acton compiler version and generated Tolk ABI must be validated by the repository's build and emulator before shipping code.

## Required validation before implementing a handler

A safe handler proposal must:

1. Parse the RichBounce envelope and reject malformed or unexpected envelopes without changing storage.
2. Require `in.senderAddress == storage.escrow`; a bounce from any other destination must not mutate a listing.
3. Decode the original complete `CreateEscrow` body, including its referenced extra cell.
4. Require the exact `CreateEscrow` opcode and validate the full NFT Item, collection, seller, product ID, kind, query ID, and item index against the stored Pending product.
5. Treat initial and retry sends as the same logical request only after verifying all immutable identity fields. Do not use message time or arrival order as identity.
6. Be idempotent under duplicate bounces and harmless when a late bounce arrives after the product has become Active or Cancelled.
7. Never delete `assetListings`, cancel a Pending product, authorize an NFT refund, or infer NFT ownership from a bounce.
8. Preserve the existing owner retry path and prove that a retry after a bounce still reaches Escrow idempotently.
9. Test malformed RichBounce bodies, unrelated bounced opcodes, wrong bounce sender, truncated/missing refs, mismatched product identity, duplicate bounces, and late bounce after a successful deposit.

## Storage decision

A persistent `CREATE_REQUEST_BOUNCED` / retry-required marker needs a deliberate storage representation. The current `Product` and `MarketplaceStorage` layouts do not contain such a field.

Do not overload `Product.status` without a complete state-transition specification: a bounced retry can arrive after an earlier request or deposit callback, and Active/Cancelled states must never regress to a retry state.

Preferred next design:
- Add an explicit operational bounce field or a dedicated map keyed by the immutable query ID.
- Define whether the field means “at least one exact CreateEscrow attempt bounced” or “latest attempt bounced”; the latter requires an attempt nonce, which the current message ABI does not carry.
- Keep the marker informational. It must not alter ownership, listing eligibility, or NFT index reservation.
- Add the new field only in a new, documented storage layout version and initialize it in every fixture/deployment script.
- If exact attempt-level attribution is required, add an attempt ID to the CreateEscrow ABI and persist it at both contracts. That is a separate ABI/storage revision and must be replay-tested.

## Implementation decision

Do not add an on-chain bounce state transition in this change. The current 256-bit bounce mode is insufficient for exact correlation, and the repository has not yet validated RichBounce decoding in its pinned Acton toolchain.

The next implementation slice should be:
1. Add emulator coverage proving the actual RichBounce body shape under the pinned Acton toolchain.
2. Verify complete original-body decoding, including the referenced extra cell.
3. Add an exact identity matcher and adversarial tests.
4. Only then introduce an informational bounce marker in a new storage version.
5. Re-run contract build/tests/linter/formatter and frontend/wallet identity CI.

## Safety boundary

A bounced `CreateEscrow` only proves that a particular message failed to be accepted at its destination. It does not prove that the NFT is still owned by the seller, that no NFT transfer notification is in flight, or that the Escrow has no corresponding record from another successful attempt.

Therefore:
- Never release the NFT listing index on CreateEscrow bounce.
- Never auto-cancel a Pending listing on CreateEscrow bounce.
- Never initiate a refund solely because CreateEscrow bounced.
- Keep NFT publishing and buyer checkout fail-closed until the complete custody and purchase protocols are implemented and tested.

No production migration, Edge Function deployment, contract deployment, mainnet transaction, NFT transfer, or fund movement is authorized or performed by this audit.
