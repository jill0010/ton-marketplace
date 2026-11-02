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

## Implementation follow-up — RichBounce decode verified (2026-11-02)

The Marketplace implementation now uses `BounceMode.RichBounce` for both the initial `CreateEscrow` request and `RetryCreateEscrow`.

The Marketplace `onBouncedMessage` handler:
- accepts only bounced messages returned by the currently configured Escrow;
- accepts only the RichBounce envelope (`0xfffffffe`);
- parses the complete original `CreateEscrow` body from `RichBounceBody.originalBody`, including the referenced `CreateEscrowExtra` cell;
- matches the exact pending product ID, NFT Item, seller, kind, collection, query ID, and item index;
- deliberately performs no persistent state transition and never releases `assetListings`.

The NFT Escrow integration test now:
1. pauses Escrow before initial publication and verifies the bounced transaction returns to Marketplace;
2. verifies the bounced Marketplace transaction itself succeeds, exercising the RichBounce parser and referenced extra-cell decoding;
3. retries while Escrow remains paused and verifies the retry message uses the same full RichBounce format;
4. unpauses Escrow, retries the same product/query identity, and continues the real NFT deposit/activation/refund test.

Validation on the current PR head:
- `acton build`: success
- `acton test`: 94 passed in 7 files
- `acton check --output-format github`: success
- `acton fmt --check`: success
- Frontend Build: success
- Wallet Identity Audit (both jobs): success

This verifies full RichBounce body decoding and exact identity correlation in the emulator. It does **not** implement a persistent bounce marker, automatic cancellation, refund, or index release. Those remain gated behind a separately designed storage/state transition and adversarial race/replay tests.

No production deployment, migration, mainnet transaction, NFT transfer, or fund movement was performed.


## Follow-up regression coverage — reservation survives repeated bounces

The integration test now checks the listing invariant immediately after each failed request, not only after a later successful retry:

- After the initial CreateEscrow bounce, a second PublishProduct for the same NFT Item fails with `AssetAlreadyListed`, and product 1 remains Pending.
- After the retry request also bounces, product 1 is still Pending and a further duplicate publication again fails with `AssetAlreadyListed`.
- The existing successful retry, NFT deposit, activation, and refund path then continues unchanged.

This directly verifies that neither the initial nor retry RichBounce path releases the NFT reservation or changes the Pending state. It does not simulate forged/malformed bounced envelopes or a delayed bounce delivered after activation; those remain separate adversarial test gaps and must not be claimed as covered.


## Adversarial regression coverage — forged sender and unexpected opcode

The integration test now constructs an explicit bounced-message envelope using Acton's emulator API:

- A forged RichBounce envelope contains an exact, otherwise matching CreateEscrow identity, but is delivered from a non-Escrow treasury. The Marketplace accepts the bounced transaction without treating that sender as the configured Escrow.
- A bounced body delivered from the configured Escrow address with an unrelated opcode is ignored safely.
- After both cases, product 1 remains Pending and a duplicate publication of the same NFT Item still fails with AssetAlreadyListed.

Validation on commit `0ec3d3ddb747bb36662eccde8a6abfc627d5aa9a`:
- Contracts workflow #90: success — Acton build, all 94 tests in 7 files, linter, formatter.
- Frontend Build #32: success.
- Wallet Identity Audit #79 was still running at the time of this documentation update.

These tests cover a forged sender with a valid RichBounce body and an unexpected opcode. They do not yet cover malformed/truncated RichBounce serialization, a delayed valid bounce after product activation, or a spoofed sender whose body is valid but delivered through a lower-level chain simulation. No persistent bounce marker or bounce-driven state transition was added.


## Late-bounce regression coverage — Active state is monotonic

The integration test now replays a fully matching RichBounce from the configured Escrow after a later retry has successfully deposited the NFT and the Marketplace product is Active:

- The delayed bounce transaction is accepted by the Marketplace handler.
- Product status remains Active (2); it is not reverted to Pending.
- A duplicate publication still fails with `AssetAlreadyListed`, proving the NFT Item reservation remains held.
- The test then continues through the existing authenticated refund path.

Validation on commit `f656a953f7ee5a164be0d32dfe774ebe69c2ff9a`:
- Contracts workflow #92: success — Acton build, integration/unit tests, linter and formatter.
- Frontend Build #34: success.
- Wallet Identity Audit #81: both Deno/type-check and PostgreSQL 17 integration jobs succeeded.

The bounce handler remains informational and state-neutral. No persistent bounce marker, cancellation, ownership inference, or index release is introduced. No production or mainnet deployment was performed.


## Malformed RichBounce defensive parsing — implementation added (2026-11-03)

The Marketplace bounce handler now wraps RichBounce envelope decoding, original-body parsing, and referenced CreateEscrowExtra decoding in Tolk `try/catch`. A malformed or truncated body is ignored rather than allowed to abort the bounced-message transaction. The handler remains read-only/state-neutral; the catch path does not update product status or the NFT reservation map.

The NFT Escrow integration test now constructs a structurally valid RichBounce envelope whose original body contains only the CreateEscrow opcode and omits all required fields/references. It asserts:
- the bounced transaction to Marketplace succeeds (the malformed CreateEscrow parser failure is caught);
- the Pending product remains Pending;
- duplicate publication of the same NFT Item remains rejected with `AssetAlreadyListed`.

The implementation uses the Tolk `try { ... } catch { ... }` language construct. This does not catch out-of-gas conditions, and it is not a substitute for protocol-level validation; the test specifically covers a truncated original CreateEscrow body that causes typed parsing to fail.

Validation on formatted commit `170d7a5b6941bfd7b54d5e21055b17609523db62`:
- Contracts workflow #96: success — Acton build, 94 tests in 7 files, linter, and formatter.
- Frontend Build #38: success — TypeScript and Vite production build.
- Wallet Identity Audit #85: success — Deno/type checks and PostgreSQL 17 disposable-database integration tests.

No storage layout change, persistent bounce marker, cancellation, index release, production migration/deployment, mainnet deployment, NFT transfer, or fund movement was performed.


### Referenced extra-cell truncation regression (2026-11-03)

Extended the malformed-message coverage beyond a body truncated immediately after the CreateEscrow opcode. A second adversarial case now supplies all CreateEscrow root fields and a referenced extra cell containing only the first 64-bit field; decoding `CreateEscrowExtra` therefore fails when the handler attempts to load the missing timestamp and item index. The bounced transaction is required to succeed and the Pending product/NFT reservation must remain unchanged.

Validation on commit `a5f2fc64f5e78255c7256f698afcb96f35473caf`:
- Contracts workflow #99: success — build, 94 tests in 7 files, linter, formatter.
- Frontend Build #41: success.
- Wallet Identity Audit #88: success — Deno/type checks and PostgreSQL 17 integration tests.

This test exercises failure while decoding the referenced extra cell, not merely missing root fields. No storage layout or production state changed.
