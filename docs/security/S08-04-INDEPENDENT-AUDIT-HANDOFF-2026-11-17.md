# S08-04 — Independent security audit handoff (2026-11-17)

**Status: READY FOR EXTERNAL REVIEW; NOT AUDITED. Mainnet release is BLOCKED.**

## Review target
- Repository: `jill0010/ton-marketplace`
- Implementation revision evidenced by S08-01/S08-03: `85e84d29fcc58719e0ec351501fe1bf683e491b0`
- Earlier pinned candidate: `4d97607a6bd22494e105852a3c375fc905a9d219`; source differences in Coordinator and Vault were documented in S08-03, with matching compiled hashes in S08-01.
- **Audit reviewer must explicitly approve the exact final release revision and toolchain**. This packet does not designate a final mainnet release commit.

## In-scope production contracts
1. `contracts/marketplace/contracts/MarketplaceReserveV3.tolk` — buyer payment/order binding, duplicate prevention, seller/platform payout and authorization.
2. `contracts/marketplace/contracts/NFTEscrowV2.tolk` — NFT custody, release and bounce/failed delivery.
3. `contracts/marketplace/contracts/ReserveCoordinatorV3.tolk` — per-order reserve routing, callback authenticity, replay and partial failure.
4. `contracts/marketplace/contracts/ReserveVaultV3.tolk` — 0.2 TON reserve accounting, refund once-only, bounce, forged callback and retry.
5. `contracts/marketplace/contracts/SettlementAttestationVerifierV3.tolk` — signer quorum, order/network/epoch binding, signature replay, receipt finality assumptions.

Review cross-contract state machine and adversarial transaction ordering; payment finality versus dispatched messages; unauthorized admin/validator actions; bounce/gas exhaustion, paused states, double payment/refund, and stranded funds/NFT.

## Existing evidence (reuse, do not repeat)
- [S07 independent audit scope and production role proof](S07_V3_INDEPENDENT_AUDIT_HANDOFF.md)
- [S07-09 testnet closure](../evidence/S07-09-TESTNET-CLOSURE-2026-11-16.md) and [settlement run 43902102867](https://github.com/jill0010/ton-marketplace/actions/runs/43902102867)
- [S08-01 baseline run 43912675179](https://github.com/jill0010/ton-marketplace/actions/runs/43912675179): 155 tests passed and binding verification, but NOT independent audit
- [S08-03 closure](../evidence/S08-03-CLOSURE-2026-11-17.md): actual settled Vault hash matches production; changed Coordinator and Vault compiled hashes match pinned values
- [S08-03 read-only run 43989657002](https://github.com/jill0010/ton-marketplace/actions/runs/43989657002) and [artifact 14287375657](https://github.com/jill0010/ton-marketplace/actions/runs/43989657002/artifacts/14287375657)

## Independent auditor deliverables
1. Auditor identity, organization, independence/conflict declaration, scope and exact commit/toolchain.
2. Threat model and reviewed transaction flows with assumptions and exclusions.
3. Findings table with ID, severity, exploitability, affected file/function, reproduction/evidence and remediation.
4. Remediation commit references and independent re-review outcome for each finding.
5. Final signed or attributable report, residual risks and explicit pass/fail assessment. Record any limitations and unresolved issues.

## Release conditions
- No unaudited critical/high vulnerabilities; all such findings fixed and independently re-reviewed.
- Evidence and compiled bytecode tied to exact immutable final release revision and compiler version.
- Separate S08-05 go/no-go approval required before S09.
- **Do not place mnemonic, wallet private key, API secrets or production signing material in audit issues, reports or artifacts.**
- No mainnet deployment, signing, transfer or customer-funds acceptance is authorized by this handoff.

## Current blockers
- No independent auditor or attributable report recorded.
- No auditor findings or independent re-review recorded.
- Mainnet release gate remains closed.

This document is an audit brief, **not** a certification or security-audit result.
