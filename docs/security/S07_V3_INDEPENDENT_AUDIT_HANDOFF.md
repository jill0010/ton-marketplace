# S07 — Independent security audit handoff and production bytecode evidence

Status: **BLOCKED / independent audit not performed**. This is a scope and evidence handoff, **not** an audit report, certification, or Mainnet approval.

## Frozen candidate and known evidence
- Pinned production candidate: `4d97607a6bd22494e105852a3c375fc905a9d219`.
- Historical independently settled Testnet source: `223cebcd0977d90486c71417645a6fe2cbaa4953`.
- Baseline/candidate local compiled hash equality: Actions 42502022657 (five production hashes).
- Live Testnet hash comparison: Actions 42503318692; verifies MarketplaceReserveV3 and ReserveCoordinatorV3, **plus the Testnet-only escrow fixture**, not production NFTEscrowV2.
- Release checks: Actions 42783589597, 42785685031, 42791119760; passing CI is not a security audit.

## Production contract scope for independent auditor
1. `contracts/marketplace/contracts/MarketplaceReserveV3.tolk`: payment acceptance, replay prevention, settlement authorization, custody and seller/platform amounts.
2. `contracts/marketplace/contracts/ReserveCoordinatorV3.tolk`: reserve routing, validator authorization, replay and partial-failure recovery.
3. `contracts/marketplace/contracts/ReserveVaultV3.tolk`: exactly-once reserve refund, bounce handling, forged messages, accounting invariants.
4. `contracts/marketplace/contracts/SettlementAttestationVerifierV3.tolk`: 3-of-3 receipt attestation, network/order binding, signer independence and equivocation.
5. `contracts/marketplace/contracts/NFTEscrowV2.tolk`: NFT deposit, release, bounce and failed-delivery recovery.
6. Cross-contract trace: buyer payment → NFT release → seller/platform payout → reserve finalization; also failures, partial execution, timeouts, reentrancy/replay, gas exhaustion and recoverability.

## Production bytecode proof gaps
| Role | Expected pinned candidate hash (decimal) | On-chain evidence status |
|---|---|---|
| MarketplaceReserveV3 | 78359546161773769121804334657237004017492887152734900376191088699783038521579 | Testnet matched |
| ReserveCoordinatorV3 | 66691359611383353754318373230718900986162645101604635612762337495115879334100 | Testnet matched |
| NFTEscrowV2 production | 81598614757632845067695927561143533301816638303328283688424659201933137039160 | **Verified** on isolated production-code Testnet instance `kQBdX2PpCASy50dZOmspilaHrnPa6mgJ-DhuzBpNR4LJpQOP` (Actions 43700721551); historical escrow remains fixture |
| ReserveVaultV3 | 96403339264512730204843696723697573046015770335637526243123230074643027115550 | **Verified** on a real Testnet instance (`kQB9H6xuScwj6Jn5jI_iSA8Zr5y-8gvweh6nQTTNvODz8f4u`); see Actions 42865241709 |
| SettlementAttestationVerifierV3 | 40137527310137199081220684777089428003119541313287351217810842336613359506965 | **Verified** on Testnet (`kQB_3iLBqs2iW0qC2QbPeOisGfxPf46yGLZUOw3GgGxXZYO4`); see Actions 42865241709 |

Do not equate an embedded Vault code cell with a separately deployed Vault instance; derive a concrete instance address from an actual order and compare its on-chain code hash. Do not use the Testnet escrow fixture hash as evidence for production NFTEscrowV2. Collect address, workchain, code hash, active state, network, immutable binding getter results, block identifiers, RPC endpoint, UTC observation time, candidate compiler/toolchain versions and immutable logs for each verified role.

## Audit acceptance and launch gate
- Independent reviewer **not** the implementer; reviewer identity, scope, commit, date, findings, severity, remediation commits and re-review must be recorded.
- All critical/high findings resolved and independently retested; unresolved issues explicitly risk-accepted by authorized owner if permitted by release policy.
- Confirm deployment bytecode provenance for the exact final Mainnet candidate, not just local build equality.
- Production wallet checkout/backend order evidence must be separately verified; historical Testnet traces do not certify new Mainnet code.
- **No Mainnet signing, deployment, customer funds or checkout activation** without completed evidence and explicit authorization.

## Next owner actions
1. Appoint an independent Tolk/TON contract auditor and give them the pinned source, tests and this scope.
2. Vault and Verifier read-only code hashes are now recorded in Actions 42865241709; retain the evidence artifact and repeat against the final candidate if bytecode changes. Identify or deploy a **distinct production-code NFTEscrowV2 on Testnet**, then provide its actual address to `.github/workflows/s07-v3-production-roles-proof.yml`. Do not use the fixture Escrow address. Record deployment transaction, candidate source, owner/marketplace binding, code hash, and independent read-only verification. Until then production Escrow remains **NOT VERIFIED**.
3. Track findings and close only after independent re-review.

## S07 production role code proof — 2026-11-15
- Isolated production-code Escrow deployment: [Actions 43700458809](https://github.com/jill0010/ton-marketplace/actions/runs/43700458809), address `kQBdX2PpCASy50dZOmspilaHrnPa6mgJ-DhuzBpNR4LJpQOP`, configured marketplace `kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_`.
- Independent read-only chain-state/code-hash check: [Actions 43700721551](https://github.com/jill0010/ton-marketplace/actions/runs/43700721551), [artifact 14155533907](https://github.com/jill0010/ton-marketplace/actions/runs/43700721551/artifacts/14155533907). Vault, Verifier, production Escrow each active, each matching pinned compiled hash; `allProductionRolesVerified=true`, `missingRoles=[]`, `mainnetApproved=false`.
- **Important scope boundary:** Escrow's `marketplace` storage field was verified against its supplied initialization address by the deployment script. This does NOT demonstrate that the historical Marketplace itself is bound to the newly deployed Escrow, nor that the two can complete NFT custody/settlement. Verify the Marketplace-side escrow binding and callback compatibility separately, without changing historical orders. Do not label the overall S07 audit or Mainnet release gate complete.
