# TON Marketplace V2 — Payout Finality and Bounce Recovery Decision

Date: 2026-11-03
Status: Architecture decision; no payout entrypoint is implemented or enabled.

## Decision

MarketplaceV2 must support ordinary TON wallet addresses for sellers and the platform treasury. It must not require either beneficiary to send a custom acknowledgement message after receiving Toncoin.

A normal wallet does not automatically call MarketplaceV2 with a `PayoutSettledV2` message. A beneficiary acknowledgement requirement would make settlement depend on custom beneficiary behavior and could leave ordinary wallet payouts permanently pending.

The contract will therefore use **independent push payouts with exact bounce recovery**:

1. After authenticated NFT delivery, MarketplaceV2 creates two separate immutable liabilities: seller proceeds and platform fee.
2. Each liability has its own order ID, operation ID, query ID, beneficiary, exact nanotons amount, and state.
3. A permissionless `DispatchPayoutV2` request may dispatch one pending liability. The beneficiary and amount are loaded from the stored liability; neither is caller-supplied.
4. MarketplaceV2 sends a bounceable internal Toncoin message to the recorded beneficiary. Its body carries the exact payout identity so a full RichBounce can be correlated.
5. The leg becomes `Dispatched` only when the MarketplaceV2 send action succeeds. A correlated RichBounce from the exact beneficiary restores that same leg to `Pending`; it never creates a second liability or changes the other payout leg.
6. A retry reuses the same operation ID and query ID. It cannot dispatch a leg already marked Dispatched.
7. Seller and platform legs are dispatched in separate transactions. A failure in one leg cannot block or duplicate the other.

The contract does not claim that a message is received merely because the sender transaction emitted it. An indexer follows the outgoing message to the beneficiary transaction and verifies the recipient transaction's compute/action result and finality. The indexer is read-only: it cannot authorize or trigger payment. The on-chain state remains authoritative for liability creation, dispatch attempts, and bounce recovery.

The on-chain terminal label is therefore `PayoutsDispatched`, not a beneficiary-acknowledged `Completed`. The application may display an order as completed only after both recipient transactions are observed successful and finalized in the chain trace. If a later correlated bounce is observed, the on-chain liability returns to Pending and the projection must reflect that state.

If the product requirement later demands an on-chain `Completed` state with a cryptographic recipient acknowledgement, it must require a beneficiary contract implementing a defined acknowledgement interface. That is incompatible with arbitrary standard wallet addresses and is not the default design.

## Why this is required by TON message semantics

TON internal messages are asynchronous. A bounce is generated only under defined conditions: the message must be bounceable, sufficient value must remain, and the receiver transaction must fail in the compute phase or an action failure must use the appropriate bounce flag. A successful sender transaction alone does not prove the recipient transaction succeeded.

Official references:

- [TON Docs — Internal messages and bounce behavior](https://docs.ton.org/foundations/messages/internal)
- [TON Docs — Blockchain transactions and message traces](https://docs.ton.org/v3/guidelines/dapps/transactions/foundations-of-blockchain)
- [TON Docs — Interacting with wallets](https://docs.ton.org/blockchain-basics/standard/wallets/interact)

## Required payout state

Each payout leg uses:

| State | Meaning |
|---|---|
| `NotCreated` | No liability exists yet |
| `Pending` | Liability exists and can be dispatched |
| `Dispatched` | Exact outgoing message action succeeded; recipient trace still needs off-chain finality observation |
| `Bounced` | A fully correlated bounce was received; the liability is retryable |
| `ManualReview` | Message outcome or identity is ambiguous; automatic retry is forbidden |

A bounce handler must require all of the following before restoring a liability:

- bounce sender equals the snapshotted beneficiary;
- original opcode is the expected seller/platform payout message;
- order ID, operation ID, and query ID match the stored liability;
- original amount and beneficiary match exactly;
- payout leg is currently Dispatched.

Malformed, truncated, stale, forged, duplicate, or mismatched bounces are safe no-ops. They must not mutate the liability or the other payout leg.

## Buyer refunds

Buyer refunds use the same independent-liability pattern. A refund is created only after a conclusive release failure and the exact order state authorizes compensation. The buyer is snapshotted from the original inbound sender. A refund dispatch cannot be authorized by a database status, a caller-supplied beneficiary, or a timeout alone.

## Atomicity and reserve requirements

- Delivery confirmation creates both payout liabilities but does not dispatch them in the same transaction.
- Each payout dispatch is a separate transaction to prevent one failed send action from coupling the two legs.
- The processing reserve is separate from gross price and is snapshotted at order creation.
- Send fees are budgeted from the reserve; seller proceeds and platform fee are not reduced to pay operational gas.
- Never use a send mode that transfers the contract's entire remaining balance.
- If a send action fails, the inbound dispatch transaction must roll back its state change; the liability remains Pending.
- A recipient bounce restores only the exact corresponding leg.

## Required tests before implementation is enabled

1. Seller payout reaches a standard wallet; verify the recipient transaction and balance in the emulator trace.
2. Platform payout reaches a standard wallet independently.
3. One payout leg can fail/bounce while the other remains independently dispatchable.
4. Exact RichBounce restores only the matching payout leg.
5. Wrong beneficiary, amount, order ID, operation ID, query ID, opcode, and stale status are rejected/no-op.
6. Duplicate dispatch cannot send a second payout while the first leg is Dispatched.
7. A failed dispatch action rolls back the liability state update.
8. A retry reuses the same operation and query IDs and cannot create a second liability.
9. No beneficiary-side `PayoutSettledV2` acknowledgement is required.
10. The indexer follows the complete sender → message → recipient trace and distinguishes sender success from recipient success/finality.
11. Reserve exhaustion leaves existing payout liabilities intact and retryable after a separately authorized top-up.
12. Buyer refund uses the same bounce/retry invariants and cannot race a successful NFT delivery.

## Scope boundary

This decision corrects the payout finality model only. MarketplaceV2 still has no buyer purchase/payment entrypoint, no payout dispatcher, no buyer refund handler, and no mainnet/testnet deployment. No buyer funds or real NFTs are accepted or moved.
