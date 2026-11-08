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

## Current decision
**BLOCKED** for Mainnet deployment. Read-only CI success proves only the checks it actually ran. No new contract was deployed, no real customer checkout enabled and no funds moved in this evidence update.
