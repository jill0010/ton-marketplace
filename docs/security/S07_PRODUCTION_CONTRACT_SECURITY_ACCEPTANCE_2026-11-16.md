# S07 Production-contract security acceptance — preliminary source review
Date: 2026-11-16. Branch: `feature/reserve-refund-v3-audit`. **NOT an independent audit. NO-GO for mainnet.**

## 1. Production Escrow source and authorization
Inspected `contracts/marketplace/contracts/NFTEscrowV2.tolk` and contrasted `NFTEscrowV2Testnet.tolk`.

- **Collection administration:** `SetCollectionStatusV2` and `SetCollectionItemCodeV2` require `in.senderAddress == storage.owner`. Production whitelist is exactly `8b711e68…ea70b32` and `30dcd7d5…2d23251`; synthetic fixture `6118df7f…bac6f` is absent. This is a source-level positive control, **not a live mainnet bytecode assertion**.
- **Escrow creation:** only `storage.marketplace` can call `CreateEscrowV2`; requires approved collection, approved code, expected NFT item address derived from the item code/collection/index, and a unique item. Exact retries are idempotent only for pending/deposited records with matching identity.
- **Deposit:** `NftOwnershipAssigned` checks NFT sender, prior owner, query ID, pending status and exact forward payload marker. This limits forged deposit callbacks.
- **Release/refund:** `ReleaseEscrowV2` and `RefundEscrowV2` require marketplace sender, record matching, and status transitions; identical pending retries are idempotent, and release/refund cannot both start from deposited status after either moves to pending.
- **Privileged risk:** escrow owner can configure collections and retry callbacks. Auditor must review owner-key compromise and any deployment binding/rotation mechanism. Source inspection does not establish secure operational key custody.
- **Compatibility gap:** successful S07-04 NFT trade used `NFTEscrowV2Testnet`, not production `NFTEscrowV2`. Production bytecode hash was independently checked on an *isolated* Testnet instance in Actions 43700721551, but its full Marketplace↔Escrow end-to-end binding is **not demonstrated** by that check.

## 2. Reserve accounting and double-refund controls
Inspected `ReserveVaultV3.tolk` and `ReserveCoordinatorV3.tolk`.

- Vault `FundReserveV3` accepts only configured funding source, exact order/payment hash and initial status, and a minimum 0.2 TON principal plus operational budget.
- Vault `dispatchReserveRefundV3` requires available principal and sufficient contract balance; **sets available=0, inFlight=principal before sending**, with a unique operation/query ID. A duplicate dispatch while in-flight is rejected by state.
- `SubmitReserveAttestationV3` checks authorized sender, order, marketplace, Vault, buyer, operation/query ID, dispatch message hash and unused statement; verifier callback must come from configured verifier and match active statement.
- `SettlementAttestationVerifiedV3` consumes statement and transitions to paid (outcome 1) or partial-return recovery (outcome 2). Exact same statement cannot settle twice.
- Bounce alone **does not** restore principal: `onBouncedMessage` deliberately avoids crediting the Vault. A genuine bounced refund requires attested recovery and top-up; `RetryReserveRefundV3` limits retryCount to 1.
- Coordinator binds order to one Vault, buyer and payment hash, accepts only Marketplace allocation and a strict 0.28 TON funding message, and only acknowledges funding from the expected Vault.
- **Outstanding high-priority evidence:** emulator and on-chain failure-path demonstrations for forged bounce, duplicate settlement, partial-return/top-up, retry, gas exhaustion and refund vs. payout races. These must be verified against the pinned production candidate before launch.

## 3. Transaction finality evidence
- Fixture Order 1: https://github.com/jill0010/ton-marketplace/actions/runs/43844621546 ; receipt artifact https://github.com/jill0010/ton-marketplace/actions/runs/43844621546/artifacts/14214781336 .
- The successful receipt checker and 3/3 proof provide evidence for **that specific testnet order**; they do not constitute a separately conducted independent chain-trace/finality audit.
- Need independently resolve buyer NFT ownership, buyer 0.2 TON receipt, seller payout, platform fee, Vault outgoing dispatch, block identifiers, amounts, sender/destination, message hashes, and uniqueness of each transfer; preserve immutable JSON and endpoint metadata.
- On-chain contract state `PayoutsDispatched` alone does **not** prove a beneficiary was credited; recipient receipt must be verified independently.

## 4. Production release blockers
| Gate | Finding | Disposition |
| --- | --- | --- |
| Escrow access checks | Positive source controls; independent review outstanding | PARTIAL |
| Production code allowlist | Synthetic fixture hash excluded from production source | PASS (source only) |
| Production Escrow live code hash | Isolated Testnet instance verified in Actions 43700721551 | PASS (isolated instance only) |
| Production end-to-end custody | Successful run used fixture Escrow | BLOCKED |
| Independent receipt finality | Existing checker evidence; independent external replay not recorded | BLOCKED |
| Double refund and failure recovery | Code-level guards found; adversarial acceptance evidence incomplete | BLOCKED |
| External TON/Tolk audit | No independent signed report | BLOCKED |
| Mainnet approval | Not authorized | NO-GO |

## 5. Required next acceptance execution
1. Run non-transactional production-code compile, tests, source allowlist assertions and evidence inventory against a pinned commit.
2. Independently replay and document Testnet order 1 receipt verification using another RPC provider / independent trace method; do not resend any payment or settlement.
3. Exercise failure/replay tests in emulator and inspect any remaining untested failure scenario; do not reuse settled order 1.
4. Have an independent TON/Tolk auditor review exact production candidate and findings, then remediate/re-review.
5. Approve Mainnet only after all mandatory gates and explicit owner authorization.

**No mainnet transactions, no re-deployment, no new testnet purchases in this audit stage.**

## S07-05 evidence seal — 2026-11-16 (read-only, provisional)

**Source receipts:** [S07-05 Actions 43846903009](https://github.com/jill0010/ton-marketplace/actions/runs/43846903009), [immutable run artifact 14214914977](https://github.com/jill0010/ton-marketplace/actions/runs/43846903009/artifacts/14214914977). The independent read-only check found the four exact transaction hashes in returned history and validated expected incoming amounts (buyer 200000000 nanotons; seller 9700000; platform 300000). No RPC errors; all 15 checks true. It is a provider-history verification, **not cryptographic finality**, and does not prove canonical source/destination or NFT ownership.

**Production Escrow evidence:** [production-role proof 43700721551](https://github.com/jill0010/ton-marketplace/actions/runs/43700721551), [artifact 14155533907](https://github.com/jill0010/ton-marketplace/actions/runs/43700721551/artifacts/14155533907). Production Escrow address `kQBdX2PpCASy50dZOmspilaHrnPa6mgJ-DhuzBpNR4LJpQOP`; initialized with Marketplace `kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_`. Fixture order 1 Marketplace is `kQAU4RhS-YlpOickiI4iSGlM0da0B2s68xuFhqaRwDtDFGkF`, and fixture Escrow is `kQC0LGltRDIVp7FxjHZhYX-FBgHAD1MP1afFSgkYjkhuwycm`. **The production Escrow is not bound to the Marketplace used by successful fixture order 1.** Its standalone code-hash check must not be treated as production end-to-end acceptance.

**Failure-path evidence:** [static and emulator gate 43845676276](https://github.com/jill0010/ton-marketplace/actions/runs/43845676276) reports 155 tests passing. This supports emulator-level controls but is not independent adversarial review of a production-bound contract deployment.

**Seal status:** PARTIAL. Archived run links above; preserve copies of artifacts before expiry. Still open: independently confirm canonical sender/recipient and matching message hashes; verify NFT owner and receipt chain linkage; verify production code **cell hash** against pinned compiled artifact and inspect both sides of Marketplace↔Escrow binding; independent TON/Tolk security audit and signed findings. **MAINNET NO-GO.**
