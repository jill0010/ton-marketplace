# NFT refund transfer Bounce audit — 2026-11-03

## Current handler behavior

`NFTEscrow.onBouncedMessage` accepts RichBounce messages whose original opcode is TEP-62 `transfer` (`0x5fcc3d14`). It resolves the record through the original transfer query ID, then requires all of the following before changing state:

- the bounced message sender is the exact NFT Item recorded for the escrow;
- the original transfer query ID equals the record's stored query ID;
- the original `newOwner` equals the recorded seller;
- the original `responseDestination` equals this Escrow contract;
- the record is still `RefundPending` (status 6).

Only then does it restore the record to `Deposited` (status 2). It does not create a refund callback, notify Marketplace, or release the Marketplace NFT listing index.

## Regression added

The NFT Escrow integration test now uses Acton's `testing.processSingleTraceStep` to execute the seller's `RequestRefund` at the Escrow only, leaving its outgoing NFT transfer undelivered. It verifies the persisted record reached RefundPending (6), then delivers a synthetic RichBounce from the exact NFT Item address carrying the matching TEP-62 transfer body. The test verifies the handler restores Deposited (2). It then submits a fresh refund request and continues through the existing end-to-end NFT Item return, exact `excesses` confirmation, Marketplace callback rejection/retry, ACK, and index-release assertions.

This deliberately isolates the Escrow Bounce handler and verifies its state transition without requiring a custom malicious NFT Item implementation. The bounced message body is constructed from the exact transfer fields emitted by the current refund path (query ID, seller destination, Escrow response destination, forward amount, and empty payload).

## Higher-fidelity automatic Bounce regression

A separate integration test now uses a dedicated test-only contract:

- Added `contracts/RejectingNFTItem.tolk`, registered only in the Acton test project, plus its generated test wrapper. It is not added to the production Collection code-hash allowlist.
- The test seeds one Pending Escrow record directly (so it intentionally bypasses Marketplace `CreateEscrow` and the production Collection Item Code verification path), then performs a real TEP-62 transfer from the seller to the test NFT Item's new owner, the Escrow. The NFT Item emits a real `NftOwnershipAssigned` notification and Escrow reaches Deposited (2).
- The seller requests a refund. Escrow emits its actual RichBounce TEP-62 transfer. The test NFT Item deliberately throws exit code 402 before changing ownership or sending callbacks. Acton's transaction emulator automatically generates and delivers the Bounce back to Escrow; the test asserts the bounced transaction's exact NFT Item sender and Escrow destination.
- The test verifies NFT ownership remains with Escrow and the record returns from RefundPending (6) to Deposited (2).
- The test then disables the rejection switch and retries. The NFT transfers to the seller, the real `excesses` callback is processed, and the Escrow record reaches Refunded (4).

The earlier synthetic-message test remains useful for isolating exact sender/query/recipient/status matching. The new test complements it by exercising a genuine failed NFT Item transaction and automatically generated Bounce in the emulator.

## Remaining limitations

This validates the Escrow refund Bounce path against a deliberately rejecting TEP-62 test contract, not every official Fragment NFT Item implementation or every possible compute/action-phase failure. The test deliberately seeds the Escrow record because the production CreateEscrow path only accepts the configured official Item code hashes; the test-only code is not trusted by production. It does not prove mainnet bounce-fee sufficiency, network timing under load, or all message-order permutations. Production recovery still relies on exact sender/query/identity/status validation.

## Validation

Latest code commit `c0a74257766bd0a5055c38bd07b2588891ea9e56`:

- Contracts workflow #41553409712: success — build, all contract tests including the new automatic-bounce test, linter, formatter.
- Frontend Build #41553409710: success.
- Wallet Identity Audit #41553409717: success — Deno/type checks and PostgreSQL 17 integration tests.

No production Collection allowlist, production ABI, serialized Escrow/Marketplace storage layout, production database, Edge Function deployment, deployed contract, mainnet transaction, real NFT, or funds were changed or moved.
