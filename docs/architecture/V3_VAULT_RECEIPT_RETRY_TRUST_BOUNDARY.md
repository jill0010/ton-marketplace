# V3 reserve vault: unresolved receipt and retry trust boundary

Status: **BLOCKING** — experimental emulator contract only; no testnet or mainnet funded deployment.

## Confirmed from contract code

- `ConfirmTestReserveReceipt` accepts an owner-supplied nonzero `receiptHash` and transitions status 2 to status 3. It checks sender, order, query and inequality with other hashes, but **does not verify a transaction on-chain**. A unique random hash is enough for an authorized owner to assert receipt.
- `RetryTestReserve` accepts an owner-supplied `returnEvidenceHash` and transitions status 4 to a new refund dispatch. A unique random hash is enough; the contract cannot independently establish whether the previous attempt credited the buyer.
- `onBouncedMessage` validates sender, original order/query/amount and returned amount, but the experimental emulator result is not an independent proof of a specific finalized buyer credit.
- The per-order vault's liability cannot be safely released on the strength of these owner attestations alone.

## Required before funded deployment

1. Specify a chain-evidence verifier that binds **network, vault, buyer, order, query, outgoing message hash, destination transaction hash, value, execution success, and finality**. Reject missing, duplicated, ambiguous and conflicting evidence.
2. Define a trust-minimized receipt protocol or an explicit independently audited oracle/attestation trust model. Do not rename owner attestations as cryptographic proof.
3. Make a verified *not credited / returned* determination mandatory before any retry. If ambiguous, hold the liability; never send again.
4. Establish reserve accounting, maximum fees, and insolvency handling for partial bounces. Test actual testnet transactions only after review.
5. Keep legacy order 1 permanently excluded from retries and payments; its external 0.2 TON compensation has already been recorded.
6. Require independent code review, deterministic deploy verification, transaction evidence collection, and explicit testnet approval before funded trial; mainnet approval is separate.

**CI green only means that tested emulator behaviors pass. It does not clear these blockers.**
