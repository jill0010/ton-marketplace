# Reserve allocation coordinator — simulation-only integration

Status: compiled with Acton 1.2.1; 14 local emulator tests pass across coordinator and vault suites. Not deployed. No existing Marketplace V2 state, balances or orders were modified.

## Implemented message flow

1. An immutable configured marketplace address submits order ID, buyer and payment hash to TestReserveCoordinator. The integration test currently uses a treasury to emulate this caller; it is not a modified Marketplace purchase handler.
2. Each allocation must attach exactly 0.28 TON: 0.2 buyer reserve, 0.05 separately funded vault operations and 0.03 separately funded coordinator operations. The extra 0.08 is a candidate platform-funded budget, not a new buyer charge.
3. The coordinator records the derived vault address and immutable identity before sending 0.25 TON with the funding/deployment message. Vault code is immutable coordinator configuration; real deployment must pin/review its code hash.
4. The vault verifies its funding source and order, records funding, and sends a 0.005 TON acknowledgement from its operational budget.
5. Only the exact recorded vault address and payment hash can confirm funding. Exact ACK duplicates are idempotent. Owner-only ACK retry is available while the vault remains unreviewed and the 0.2 reserve is protected by a balance floor.
6. A failed funding/deployment message is recorded as manual review, including returned message value. It is not marked funded and cannot be blindly reallocated under the same order ID. There is no automatic returned-funds withdrawal/refund in this prototype.
7. The existing owner-reviewed vault flow can then dispatch the residual to the immutable buyer. The integration test exercises that transfer with synthetic costs, not measured fees for live order 1.

## Tests

Five coordinator tests cover allocation -> actual vault deployment -> funding -> genuine callback -> owner-reviewed refund transfer; wrong source/amount and duplicate order; forged ACK and genuine idempotent callback retry; distinct order vaults; actual failed vault execution and returned allocation. Nine existing vault tests still pass after adding funding callbacks.

## Remaining gates

The new Marketplace purchase handler must be implemented and tested, with authenticated order/payment commitment, atomic operational funding, explicit allocation-failure compensation and callback/retry liveness. No NFT release should be triggered solely by allocation dispatch. The existing coordinator exposes no NFT release operation.

A vault funding ACK proves that vault accepted the configured allocation; it does not prove a buyer paid the marketplace, that an NFT was delivered, or that external costs are attributable. Owner-reviewed evidence remains a trust requirement. A supplied payment hash alone is not cryptographic proof.

Still outstanding: custody/excess accounting, retained-cost reimbursement, lost ACK/funding-bounce recovery and returned-principal ownership, admin/operator recovery policy, adversarial interleavings and action-phase failure, fresh Testnet deployment and end-to-end rehearsal. These prototypes cannot recover the 0.2 TON in deployed V2 order 1. Do not deploy them to Mainnet.
