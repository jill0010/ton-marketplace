# Marketplace V3 production reserve protocol

Status: design gate only. This document does not approve deployment or assert that the current experimental contracts implement this protocol.

## Non-negotiable boundary

The current `TestMarketplaceReserveV3`, `TestReserveCoordinator`, and `TestReserveVault` are simulation prototypes. They must not be deployed as production contracts by renaming files, changing metadata, or relaxing the release gate.

The current experimental vault now permits one owner-authorized `RetryTestReserve` after a protocol Rich Bounce is parsed and quarantined, but only when the retry message carries a separate order-local top-up of at least the recorded principal shortfall plus execution headroom. It increments the query ID and permits no second retry. This is prototype behavior only: it is not the production liability ledger, does not establish buyer receipt, and has not been independently audited. `ConfirmTestReserveReceipt` remains rejected (exit 706); an owner-supplied hash is never accepted as proof that the buyer received a refund. The pure JavaScript ledger separately requires an exact shortfall top-up and models outstanding liability, available funds, in-flight funds, and paid funds. These different prototype layers must be unified and proven in a production Tolk contract before release.

## Required per-order state machine

Each order has one immutable reserve identity:

- marketplace address and order ID;
- buyer address;
- exact reserve principal in nanoTON;
- unique reserve operation ID and payment hash;
- deterministic vault address and vault code hash;
- funding transaction identity and current reserve balance;
- refund operation ID, exact refund amount and beneficiary.

Required states:

1. `Unallocated`: no reserve liability exists.
2. `AllocationPending`: Marketplace has persisted the order and exact reserve liability before sending allocation.
3. `Funded`: Coordinator has authenticated the vault funding acknowledgement; Marketplace has matched order ID, buyer, payment hash, vault address and amount.
4. `Held`: reserve remains a liability and cannot be spent by seller or treasury payout logic.
5. `RefundPending`: one immutable refund operation is persisted; a unique query ID is assigned before dispatch.
6. `RefundBounced`: only a protocol-authenticated bounce of that exact refund operation can enter this state. The returned amount must be reconciled against the original message value and bounce fees.
7. `RefundRetryPending`: the original refund liability remains open; a new query ID is allocated, but the same liability and beneficiary are retained. Retry is permitted only against the reconciled returned balance, never against an owner-provided hash.
8. `RefundDispatched`: one dispatch is recorded. This is not proof of beneficiary receipt.
9. `Closed`: close only when the contract's accounting proves the liability is fully discharged or the reviewed residual is explicitly accounted for. A dispatched message alone is not finality.

Any malformed, stale, duplicated, wrong-sender, wrong-order, wrong-query, wrong-value, or underfunded message must leave the liability unchanged and must not enable a second principal payment.

## Authenticated retry requirements

A production vault must:

- verify the bounced-message envelope and exact original message opcode, order ID, query ID, amount, and destination;
- correlate the bounce to the currently pending refund operation, not merely to a reusable order ID;
- account for actual returned value and bounded protocol fees without arithmetic underflow;
- atomically persist the returned balance and transition before any retry can be dispatched;
- ensure old bounces cannot mutate a newer retry operation;
- cap retry dispatch to the reconciled returned principal, never the nominal original amount if the full principal did not return;
- retain a durable liability for any residual and expose it through getters;
- never accept an owner-supplied hash, manual review message, or buyer-supplied message as proof of receipt.

The team must verify with Acton emulator tests which bounce metadata is cryptographically/protocol-authenticated and which fields are attacker-controlled. If the VM does not expose enough information to distinguish a genuine bounce from a crafted candidate, the contract must not auto-retry; use a separately funded, explicitly accounted manual-resolution path and keep the buyer liability open.

## Coordinator and Marketplace invariants

- Coordinator accepts allocation only from the configured Marketplace.
- One order ID can bind to exactly one buyer, payment hash, vault address and allocation operation.
- Vault funding acknowledgement is accepted only from the deterministic vault address and only once for the exact binding.
- Marketplace accepts allocation confirmation/failure only from the configured Coordinator and only for the exact pending reserve binding.
- Allocation failure must not be mistaken for a completed buyer refund.
- Seller payout, platform fee, NFT release, reserve refund and operational gas subsidy are separate liabilities with separate operation IDs.
- No reserve principal may subsidize gas, fees, another order, or seller/treasury payouts.
- The Marketplace order state, Escrow custody state, payout ledger and reserve ledger must reconcile after every callback and bounce.
- Pause must prevent new purchases while preserving safe refund/retry processing.

## Required test matrix before production implementation is accepted

1. Correct funding; duplicate funding; wrong funding source; wrong amount.
2. Forged/stale/wrong-sender/wrong-order/wrong-query bounce candidates.
3. Genuine refund bounce with full, fee-reduced, dust, and zero returned value.
4. Retry after a genuine bounce; retry with insufficient returned balance; top-up without changing liability.
5. Delayed old bounce after a newer retry has been dispatched.
6. Duplicate refund dispatch and duplicate callback replay.
7. Two or more concurrent orders with isolated balances and liabilities.
8. Allocation callback bounce and recovery without claiming the buyer was refunded.
9. Marketplace pause while refund liabilities remain open.
10. Full purchase -> NFT delivery -> seller payout -> platform fee -> reserve close.
11. Full purchase -> delivery failure -> NFT return -> buyer refund -> reserve reconciliation.
12. Storage serialization, cell-size limits, getter decoding and deterministic deployment address/code hash.

Every test must assert both transaction outcomes and post-transaction balances/state. A passing unit test alone does not establish mainnet safety.

## Release gates

Production deployment remains blocked until all of the following exist and are independently checked:

- deployable production Marketplace V3, Coordinator V3, Vault V3 and required Escrow integration;
- reproducible trusted code hashes from a pinned compiler/toolchain and source commit;
- independent review of the bounce/retry trust boundary and accounting invariants;
- real testnet purchase, NFT delivery, settlement, failed-delivery refund and retry evidence;
- reconciliation proving no double payout and no unaccounted reserve liability;
- pause, upgrade/immutability, key custody, operational funding and rollback/recovery procedures;
- explicit release approval after review.

The current testnet binding and read-only inspection evidence does not satisfy these gates. No mainnet deployment or funded transaction is authorized by this document.

## TON Rich Bounce protocol findings (verified against Tolk/TON message semantics)

The production implementation must distinguish the following values:

- `InMessageBounced` is delivered to the dedicated `onBouncedMessage` entrypoint for protocol-generated bounced internal messages. A normal wallet-originated internal message is not equivalent to this entrypoint.
- `RichBounceBody.originalInfo.valueCoins` is the value of the original outbound message. It is not the amount that returned to the sender.
- `in.valueCoins` is the actual value carried by the bounced message back to the original sender, after the destination-side processing and bounce fees. It is the value that must be reconciled against the still-open liability.
- The Rich Bounce envelope uses prefix `0xfffffffe`; the handler must parse the exact original opcode/body and correlate the sender (the original destination), order ID, query ID, and original amount to the currently pending refund operation.

Consequences for the current prototype:

- `TestReserveVault.onBouncedMessage` already checks the protocol-specific handler, buyer sender, Rich Bounce prefix, original refund opcode/body, order ID, query ID, original value, and a minimum returned-value threshold.
- The current experimental handler stores `in.valueCoins` in `returnedNano` and changes `status = 4` only after matching the Rich Bounce envelope, buyer sender, original refund opcode, order ID, query ID, original amount, and minimum returned-value threshold.
- The current experimental retry accepts a top-up message value greater than or equal to the measured shortfall plus 0.03 TON execution headroom, stores that value in `topUpNano`, and dispatches the original nominal refund amount. This is deliberately a test prototype; it does not yet expose a complete on-chain residual-debt/fee ledger or prove every balance component against the production reserve identity.
- The pure JavaScript model enforces an exact top-up equal to the uncovered shortfall, but is not connected to contract execution or chain authentication. It is an accounting specification/test aid, not production enforcement.
- The production implementation must reconcile returned principal, top-up principal, execution fees, remaining buyer liability, and operation consumption as distinct fields before it can be considered safe. It must prove that no order's funds can satisfy another order's liability or operational fees.
- The original refund operation must be marked consumed before dispatching a retry. A retry must use a fresh query ID, and a delayed bounce from an earlier operation must not mutate the newer operation.

Official protocol references:
- https://docs.ton.org/v3/documentation/smart-contracts/tolk/tolk-vs-func/message-handling
- https://docs.ton.org/v3/documentation/smart-contracts/func/docs/internal-messages
- https://ton-blockchain.github.io/acton/docs/tolk_standard_library/common

These findings clarify the implementation boundary; they do not approve deployment or claim that the current prototype supports safe retry.
