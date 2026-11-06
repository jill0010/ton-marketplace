# V3 refund settlement evidence gate (experimental)

This branch is **not** a production refund service. The read-only TON Center v2
responses are unauthenticated provider observations, not cryptographic
transaction proofs. Neither a reported `bounced` flag nor a matching
transaction/message hash permits settlement, vault state mutation or retry.

## Mandatory release evidence

1. Bind the original refund outbound message to its unique transaction and
   the receiving transaction using verified message hashes and transaction
   inclusion. Reject missing, duplicated or conflicting identities.
2. Independently validate the receiver transaction outcome, transaction
   finality and exact credited value; distinguish gas fees from principal.
3. Parse the *actual* rich-bounce envelope and embedded original refund
   body, including the TON `coins` field. Reject fabricated inbound messages
   and ambiguous transfer chains.
4. Demonstrate that a returned principal belongs to the specific vault,
   order and query ID and was not already credited to the buyer or allocated
   to another refund.
5. Prove conservation of reserve principal, operational funds and reviewed
   costs across funding, dispatch, bounce, retry and completion in emulator
   and testnet integration tests.
6. Reconcile any external compensation ledger before permitting further
   payment. **V2 order 1 was externally compensated with 0.2 TON and must
   never be paid again.**
7. Complete independent contract security review, mainnet readiness gates,
   deployment verification and emergency-stop procedures.

Until all gates pass, `auditV3RefundSettlement` always reports zero verified
credited/returned principal and denies receipt confirmation, bounce
confirmation, retry and fund release. It is intentionally not connected to
production payment code.

## Provider-reported execution status (investigative only)

The outbound refund matcher now excludes vault transactions explicitly reported
as aborted, compute-failed, or action-failed. If all three reported fields
indicate success, the candidate is labeled `REPORTED_SUCCESS`; otherwise
the execution status is `UNKNOWN`. Neither state is a cryptographic proof,
a confirmation of delivery, or authorization to retry. A provider can omit
or misreport these fields, so the accounting gate remains closed.

A valid rich-bounce BOC is likewise only a structural observation. Exact
order/query/amount matching does not establish that the message was emitted
by the TON protocol or that spendable principal returned to the vault.

## Offline conservation model

`v3-reserve-conservation.mjs` checks, using explicit nonnegative nanoTON
ledger values:

`funded = vault remaining + buyer credited + pending outbound + fees`.

`returnedToVaultNano` is an event-history amount, not an additional balance:
adding it to the right side would double-count returned principal already in
the vault. Gas is an explicit separate cost. External compensation triggers
an unconditional no-repayment barrier. Pending transfers and any inconsistent
amounts are quarantined. This model does not fetch chain state, authenticate
ledger inputs, or authorize payouts. Even a caller claiming
`evidenceVerified: true` cannot turn arithmetic into proof.

## Automated adversarial regression coverage

`v3-refund-invariants.test.mjs` enumerates 1,024 deterministic, balanced
principal partitions and 1,024 one-nano accounting mismatches, in addition
to compensation/pending-outbound combinations. The tests assert that
balanced arithmetic never grants payment or deployment permission, and
a one-nano mismatch is quarantined. These are offline property-style
checks, not a replacement for contract-level adversarial tests or
independent mainnet security review.

## Explicit remaining blockers

- Reconcile transaction inclusion, execution, and buyer/vault balance deltas
  against independent, trustworthy TON chain evidence.
- Run funded testnet end-to-end dispatch, bounce, retry, and compensation
  scenarios with auditable transaction hashes and costs.
- Complete contract-level value conservation and concurrency/failure tests,
  plus an independent security review.
- Produce reviewed production contracts and verified mainnet deployment
  procedures. Keep the fail-closed mainnet readiness gate active until then.

V2 order 1's 0.2 TON external compensation is already completed. It is not
a V3 test liability and must not be transferred or repaid again.
