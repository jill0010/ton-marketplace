# S07-04 — Production testnet safety and transaction acceptance

Status: **IN PROGRESS / NOT APPROVED FOR MAINNET**
Candidate source: `feature/reserve-refund-v3-audit` (pin exact SHA before executing transaction acceptance).
Network: **TON TESTNET ONLY**. No mainnet signing, deployment, purchase, or customer funds.

## S07-03 proven baseline (do not repeat deployment)
- Workflow: https://github.com/jill0010/ton-marketplace/actions/runs/43754276063
- Artifact: https://github.com/jill0010/ton-marketplace/actions/runs/43754276063/artifacts/14176958667
- Independent postflight: `candidateAccountsActive=true`, `codeHashesVerified=true`, `bindingsVerified=true`, `mainnetApproved=false`.
- Marketplace: `kQC_UhR2wStYmFmPl_W2acYW7aeLUMBWn7GgQN4b1GmxqCyA`
- Escrow: `kQBMWX9agczB5MGgqHQTBU2yhVS7ApWAjhgaeoFHdkQBRsCy`
- Coordinator: `kQAxUi7LTfvy02mzY_d3odgbIklni0lNtOn5VEwta4ZMFowc`
- Verifier: `kQB91R0ihPflIhFRFrfEKq0IhIQfzcoazsf6BPUa01_27Xu0`
- Reserve Vault is **per-order**: do not infer an actual deployed instance from its embedded code hash.

## S07-04 acceptance gates

| Gate | Required evidence | Status |
| --- | --- | --- |
| A. Exact candidate and privileges | Pinned source SHA; bytecode provenance; owners, authorized setters, 3-of-3 validator configuration, immutable role bindings | PARTIAL: deployed code/bindings verified; independent privilege review pending |
| B. Real payment | Fresh testnet order on the four addresses above; buyer transaction hash, amount, order ID, acceptance and finality evidence | NOT VERIFIED |
| C. NFT custody and delivery | Item address, escrow ownership before release, buyer ownership after, transaction traces | NOT VERIFIED |
| D. Seller/platform settlement | On-chain receipts, exact expected amounts, one-time execution/replay protection | NOT VERIFIED |
| E. 0.2 TON reserve | Concrete order-specific Vault address and code hash, funding, fees, final refund amount, buyer receipt, conservation check | NOT VERIFIED |
| F. Failure recovery | Failed purchase / failed NFT transfer / bounce and retry behavior with evidence that funds cannot be paid or refunded twice | NOT VERIFIED |
| G. Independent audit | External TON/Tolk reviewer identity, report, findings, remediation, independent re-review | BLOCKED: independent audit not performed |
| H. Release authorization | Explicit owner approval only after all mandatory gates pass | NOT APPROVED |

## Execution order (minimal mainline)
1. **Read-only baseline:** rerun existing S07-03 read-only verification on the exact four addresses; retain timestamped evidence.
2. **Fresh testnet-only transaction:** review any existing end-to-end workflow before running it. It must target **these exact four addresses**, use production `NFTEscrowV2` rather than fixture, require explicit testnet confirmation, and refuse any mainnet address. If not, adapt that workflow before execution. Do not reuse historical order evidence as proof of this candidate.
3. **Independent read-only receipts:** verify payment, NFT transfer, seller/platform amounts, per-order Vault code hash and refund, and 3-of-3 attestations. Save raw transaction IDs and JSON evidence.
4. **Safety review:** inspect privileged operations, authorization, bounce/replay, accounting invariants, and recoverability. Arrange independent review before declaring launch-ready.
5. **Gate decision:** fail closed on missing evidence; no mainnet action.

## Known scope boundary
Historical S07 audit handoff: `docs/security/S07_V3_INDEPENDENT_AUDIT_HANDOFF.md`. That handoff explicitly says it is **not** an independent audit or mainnet authorization. The earlier S07-03 postflight sets `fundedPurchaseVerified=false` and `settlementVerified=false`, so it cannot be used as a transaction-closure certificate.

## Outcome
S07-04 is **NOT COMPLETE** until the fresh candidate order, full reserve/refund accounting, failure recovery, and independent security review are evidenced.
