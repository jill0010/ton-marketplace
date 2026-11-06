# Experimental per-order reserve vault

Status: compiled and exercised in Acton 1.2.1 emulator only. No deployment script or live Marketplace integration exists. It cannot refund deployed V2 order 1.

## Implemented

TestReserveVault is a distinct contract instance for one immutable order, buyer, funding source and payment hash. The funding source deposits at least 0.25 TON: 0.2 reserve and at least 0.05 separate operational funding. This is a candidate future funding layout, not the current buyer-payment flow.

Only its owner can review costs and terminal delivery/compensation, choose the reviewed evidence hash and initiate the first refund. The beneficiary comes only from immutable storage. The residual is exactly 0.2 minus reviewed costs, bounded to 0..0.2. Costs are retained and locked: this prototype has no cost-reimbursement withdrawal.

Dispatch marks the refund in-flight before sending. It does not label dispatch as receipt. Exact RichBounce body/sender/order/query/amount matching marks a bounce candidate. Retry requires an owner-reviewed return-evidence hash, a new query ID and enough balance to protect retained costs plus a 0.03 TON operational buffer. An owner-reviewed exact order/query receipt hash closes an in-flight refund or a bounce candidate, allowing independently verified recipient credit to resolve a forged buyer-controlled bounce without another payment. Duplicate review, dispatch while in-flight, stale receipt and retry after closure are rejected.

## Trust and limitations

The owner is trusted to independently verify fee attribution, order terminal state, returned funds and recipient credit. The contract does not prove these facts and cannot query external trace databases. A nonzero evidence hash is a record of the review, not a proof. Do not automate owner approval from an unauthenticated event or a bounced message alone. A buyer-controlled contract can manufacture messages; bounce authenticity and actual returned funds still require review before owner retry.

Nine emulator scenarios cover wrong/duplicate funding, underfunding, unauthorized review, wrong order, empty evidence, excessive fees, zero residual, exact buyer payment, replay rejection, stale confirmation, actual rejected recipient execution and RichBounce retry correlation. Added coverage includes wrong sender, order, query and amount, malformed bounce payload, matching late bounce after closure, depleted operational funds and top-up recovery, independent order-1/order-2 vaults, and a buyer-controlled matching bounce candidate that cannot authorize its own retry.

Remaining: atomic integration with the future Marketplace and Escrow reserve ledger; derivation of actual attributable costs; reimbursement of retained costs; persistent indexing and receipt verification; insolvency and long-term storage coverage; action-phase failure and further adversarial interleaving coverage; reviewed Testnet deployment. Incoming operational donations are not treated as buyer reserve.

There is no upgrade or recovery entrypoint in the currently deployed V2 Marketplace. Its order-1 reserve remains there. Funding a new vault cannot extract that reserve or constitute its refund.

The source does not enforce network identity on chain. It must not be deployed to Mainnet. No Mainnet deployment, signature or transaction is performed by adding this prototype to compilation/CI.
