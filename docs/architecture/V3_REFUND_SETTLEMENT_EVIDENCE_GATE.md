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
