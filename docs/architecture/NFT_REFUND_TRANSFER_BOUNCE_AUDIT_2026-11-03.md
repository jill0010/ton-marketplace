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

## What this test does not prove

This is a synthetic bounced-message delivery to the Escrow, not an actual NFT Item transaction that failed its compute or action phase and automatically generated the Bounce. It does not prove every official NFT Item implementation's failure modes, bounce fees, or every message-order permutation. A future higher-fidelity test can use a deliberately rejecting TEP-62 test Item or a forked NFT Item implementation to force a genuine transaction-level Bounce. Until then, production recovery remains dependent on the exact sender/query/identity checks described above.

## Validation

Code commit `82f766c5635cd2f2a6cf27b323101b1b1dcac85c`:

- Contracts workflow #109: success — Acton build, 94 tests in 7 files, linter, formatter.
- Frontend Build #51: success.
- Wallet Identity Audit #99: success — Deno/type checks and PostgreSQL 17 integration tests.

No contract implementation, ABI, serialized storage layout, production database, Edge Function deployment, contract deployment, mainnet transaction, NFT transfer outside the emulator, or funds were changed or moved.
