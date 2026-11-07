# V3 Vault Receipt and Retry Trust Boundary

Status: **experimental design note; not a security sign-off and not release approval**.

## Scope

The current `TestReserveVault`, `TestReserveCoordinator`, and
`TestMarketplaceReserveV3` contracts are simulation-only. Their owner-supplied
review fields and hashes are operator attestations, not cryptographic evidence
of external delivery, external fees, buyer receipt, or settlement.

This document records the trust boundary so that testnet readiness cannot be
mistaken for production readiness.

## Current reserve-vault retry invariants

For each reserve liability:

1. The vault dispatches a refund with a monotonically increasing query ID.
2. A retry is considered only after a rich protocol bounce is received from
   the expected buyer and its original message body, order ID, query ID,
   original value, and refund amount match the in-flight operation.
3. The returned value must meet the configured bounded fee allowance.
4. The vault records the actual returned value and quarantines the liability.
5. An owner-triggered retry is allowed at most once. It requires the quarantined
   state and positive returned value, consumes the retry allowance, clears the
   old returned-value marker, and dispatches with a fresh query ID.
6. A stale bounce cannot authorize a later operation because its query ID does
   not match the active query.
7. A second retry is rejected, including after the retried payment itself
   bounces. That liability remains quarantined for manual reconciliation.

These invariants limit duplicate dispatches in the emulator model. They do not
prove that a buyer has received funds, that all TON bounce edge cases are
covered, or that a production implementation is safe.

## Untrusted evidence

The following are not independent proofs and must never alone authorize
settlement, buyer credit, or a second payout:

- an owner/admin-supplied evidence hash;
- an owner/admin-supplied attributed-cost amount or terminal reason;
- a getter result showing an order or reserve exists;
- an account being active or containing code;
- a successful emulator test;
- an explorer screenshot or manually copied transaction hash.

## Required production evidence

Before a funded testnet trial or mainnet release, reviewers must obtain and
retain reproducible evidence for all of the following:

- production contract source, compiler/toolchain versions, build inputs, and
  independently reproduced code hashes;
- authenticated transaction traces linking buyer payment, NFT custody,
  escrow release/return, seller/platform payout, and buyer refund;
- proof of recipient-side credit / successful settlement, not merely outbound
  message dispatch;
- idempotency across duplicate, delayed, reordered, malformed, forged, and
  post-retry bounce messages;
- accounting reconciliation proving liabilities never exceed controlled
  balances and that reserve principal cannot be paid twice;
- independent security review of production contracts and deployment scripts;
- tested operational pause, recovery, key rotation, and rollback procedures.

Evidence must identify the network, contract addresses, code hashes, order IDs,
transaction hashes, and reviewer. Redact secrets; never store mnemonics or
private keys in evidence artifacts.

## Release decision

The current experimental contracts are **not deployable production contracts**.
No mainnet transaction, funded trial, or release is authorized by this document.
The mainnet release gate must remain closed until every required proof above is
independently reviewed and explicitly approved.
