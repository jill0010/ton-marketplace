# S05-P002 — V3 release candidate source and bytecode lineage evidence

**Status: PARTIAL — baseline/candidate compiled hashes MATCH; deployed-chain binding and independent audit remain OPEN. No Mainnet authorization.** Parent: [fixed roadmap #7](https://github.com/jill0010/ton-marketplace/issues/7); tracked in [issue #9](https://github.com/jill0010/ton-marketplace/issues/9).

## Immutable candidate references
- Independently settled Testnet order-2 source baseline: `223cebcd0977d90486c71417645a6fe2cbaa4953`.
- Formatter-clean candidate: `4d97607a6bd22494e105852a3c375fc905a9d219`.
- Candidate PR: https://github.com/jill0010/ton-marketplace/pull/6 .
- GitHub compare: https://github.com/jill0010/ton-marketplace/compare/223cebcd0977d90486c71417645a6fe2cbaa4953...4d97607a6bd22494e105852a3c375fc905a9d219 .
- Compare result: 16 commits ahead, zero behind, 16 modified paths, including deployable `ReserveCoordinatorV3.tolk` and `ReserveVaultV3.tolk`, plus scripts, fixtures and tests. This is a **source diff**, not a compiled-code-hash equivalence proof.

## Verified CI evidence
- https://github.com/jill0010/ton-marketplace/actions/runs/42499582209 — both jobs passed; pinned candidate Acton build, full emulator tests, static checks and formatter all passed.
- https://github.com/jill0010/ton-marketplace/actions/runs/42499806374 — follow-up read-only readiness passed after fixing stale workflow comments.
- `contracts/marketplace/tests/v3-compiled-hashes.test.tolk` exports compiled production hashes, including MarketplaceReserveV3, ReserveCoordinatorV3, ReserveVaultV3 and SettlementAttestationVerifierV3. Independent same-toolchain baseline/candidate comparison has now passed (Actions run 42502022657); deployed Testnet code hashes remain separately unverified.

## Confirmed independent compile comparison (2026-11-08)
- [GitHub Actions run 42502022657](https://github.com/jill0010/ton-marketplace/actions/runs/42502022657): PASS. Both pinned revisions compiled and ran emulator suites; comparison gate passed for all five production hashes.
- [Immutable evidence artifact 13625962231](https://github.com/jill0010/ton-marketplace/actions/runs/42502022657/artifacts/13625962231): full baseline and candidate test logs, compiler version, and comparison.md; archive SHA256 `09ae42f967fa20599b46ea642e0a8e83b5a517487704c3228577640c89a21e2b`.
- Verified candidate log values (decimal TON cell hashes; baseline values equal by the successful fail-closed comparison):
  - MarketplaceReserveV3: `78359546161773769121804334657237004017492887152734900376191088699783038521579`
  - NFTEscrowV2: `81598614757632845067695927561143533301816638303328283688424659201933137039160`
  - ReserveCoordinatorV3: `66691359611383353754318373230718900986162645101604635612762337495115879334100`
  - ReserveVaultV3: `96403339264512730204843696723697573046015770335637526243123230074643027115550`
  - SettlementAttestationVerifierV3: `40137527310137199081220684777089428003119541313287351217810842336613359506965`
- This establishes equivalence **between these two local builds**, not that either compiled hash matches deployed Testnet bytecode. No wallet credentials or transactions were used.

## Remaining requirements before release
1. Independently verify deployed Testnet contract code hashes and bindings against the compiled candidate. Testnet success for a different code hash cannot be reused as proof for Mainnet.
2. Require an independent security audit, custody/settlement/reserve-refund fault tests, frontend/backend checkout integration, operational sign-off and explicit Mainnet approval.

## Deployed Testnet postflight — recorded mismatch and fix (2026-11-08)
- [Failed postflight run 42503092705](https://github.com/jill0010/ton-marketplace/actions/runs/42503092705): marketplace and coordinator hashes match the pinned candidate; deployed escrow matches the candidate's **Testnet fixture** code hash, NOT the production `NFTEscrowV2` hash. The mismatch was caused by comparing different escrow variants, not by a missing deployment.
- Marketplace observed/expected: `78359546161773769121804334657237004017492887152734900376191088699783038521579`.
- Coordinator observed/expected: `66691359611383353754318373230718900986162645101604635612762337495115879334100`.
- Escrow Testnet fixture observed: `101764511745891446825793649001643455668042447699317077464808806092838979242128`. This value is printed by the pinned candidate's `v3-compiled-hashes.test.tolk` test.
- Escrow production code hash (DIFFERENT): `81598614757632845067695927561143533301816638303328283688424659201933137039160`. **No conclusion about deployed production NFTEscrowV2 code is permitted from this Testnet fixture.**
- The read-only verifier has been updated to use the separately labeled Testnet fixture hash. The updated workflow still needs a fresh passing run and must never be treated as proof of production escrow deployment or independent security audit.
- Earlier missing script references were fixed by replacing them with `scripts/verify-v3-testnet-deployed-code.mjs` on `main`.

## Successful on-chain Testnet hash comparison (2026-11-08)
- [Run 42503318692](https://github.com/jill0010/ton-marketplace/actions/runs/42503318692) passed on `main` (commit `77f4c60ba1b11c78a8dc60857d055f95202f236f`).
- [Evidence artifact 13626043691](https://github.com/jill0010/ton-marketplace/actions/runs/42503318692/artifacts/13626043691), archive SHA256 `998b3e2d4afe2ac6d27af90421ff594d027ab9374f5aeb4489b570275a9d0567`.
- Live TON Testnet account-state code hashes matched the pinned compiled candidate for **MarketplaceReserveV3**, **ReserveCoordinatorV3**, and the historical **escrow Testnet fixture** (all active and code present).
- The production `NFTEscrowV2`, `ReserveVaultV3` and `SettlementAttestationVerifierV3` deployed-code verification is **NOT** established by this three-address check. Binding, custody, settlement, refunds and independent audit remain separate blockers.

## Current decision
**BLOCKED** for Mainnet deployment. Read-only CI success proves only the checks it actually ran. No new contract was deployed, no real customer checkout enabled and no funds moved in this evidence update.

## S07 live Testnet Vault and Verifier code proof (2026-11-10)
- [Read-only Actions 42865241709](https://github.com/jill0010/ton-marketplace/actions/runs/42865241709): the **Vault and Settlement Verifier checks PASSED** with active on-chain accounts and exact code-hash matches against the pinned candidate; the overall job is red **only because production NFTEscrowV2 was not supplied**.
- [Immutable run artifact 13787011643](https://github.com/jill0010/ton-marketplace/actions/runs/42865241709/artifacts/13787011643) contains the full JSON evidence.
- Vault: `kQB9H6xuScwj6Jn5jI_iSA8Zr5y-8gvweh6nQTTNvODz8f4u` — observed/expected decimal hash `96403339264512730204843696723697573046015770335637526243123230074643027115550`; active; match=true.
- Settlement Verifier: `kQB_3iLBqs2iW0qC2QbPeOisGfxPf46yGLZUOw3GgGxXZYO4` — observed/expected decimal hash `40137527310137199081220684777089428003119541313287351217810842336613359506965`; active; match=true.
- **Still OPEN**: production `NFTEscrowV2` deployment hash. The historic marketplace Testnet escrow is a distinct Testnet fixture and cannot satisfy this gate. Additionally, code-hash matches do not prove cross-contract bindings, code safety, current runtime correctness or independent audit.
- No Mainnet approval or transaction was given or performed by this read-only job.
