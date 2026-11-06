# Reserve refund design model — Testnet prototype, 2026-11-06

The deployed Marketplace V2 has no processing-reserve refund operation and no exposed upgrade operation. Its buyer-price compensation excludes the 0.2 TON processing reserve. Updating repository source does not add functionality to that deployed address.

Order 1 has completed delivery and both payout receipts were independently checked. Its 0.2 TON reserve has not been refunded. Observed contract-account fees of 6,615,339 nanotons are a diagnostic, not evidence that this exact reserve funded those fees. No refundable amount is approved.

## Added prototype

`contracts/marketplace/experiments/reserve-refund-model.mjs` defines pure, immutable state transitions only:

- unreconciled -> approved (or closed-zero);
- approved -> in-flight;
- in-flight -> paid, or bounced after exact returned principal is verified;
- bounced -> in-flight with a new attempt and new message hash.

Ten local test cases cover conservation, order/buyer/payment binding, terminal-state and evidence requirements, rejection of pooled V2 funding, pending Escrow excesses, amount substitution, duplicate dispatch, wrong receipts and bounce/retry identity.

**This is not deployed contract code, an authentication system, a proof verifier, persistent replay protection or a transaction sender.** Its input events represent checks that a future protocol must actually perform. Calling a function or setting an evidence field does not establish authenticity, funding isolation or on-chain proof. Do not wire this module to a live refund endpoint.

## Integration work still required

1. Versioned on-chain per-order reserve liabilities and genuinely isolated/reconciled funding. Keep seller gross and platform liabilities outside the refund budget.
2. Return or account for each Escrow/NFT excess with exact order/query/message linkage; cover callback and acknowledgement costs.
3. Specify the trust model: an owner-reviewed ledger attestation is not a cryptographic proof. No public caller may supply an arbitrary fee or refund amount.
4. Record buyer, immutable order/payment identity, reviewed evidence hash, exact approved amount and one-time operation state on chain.
5. Correlate recipient credit or genuine bounce/returned principal before final status or retry. A bounce usually incurs fees; any shortfall needs separately verified funding rather than an inferred full return.
6. Enforce durable replay protection and reserve all existing principal liabilities before sending.
7. Build and test the new contract layout, including incomplete settlement, insufficient funds, action failure, bounce, duplicate callbacks and concurrent orders; then deploy fresh Testnet contracts.
8. Rehearse the new flow end to end. None of these changes upgrade or release funds from the old deployed order-1 contract.

No Mainnet deployment, refund signing or broadcasting is authorized or performed by this prototype.
