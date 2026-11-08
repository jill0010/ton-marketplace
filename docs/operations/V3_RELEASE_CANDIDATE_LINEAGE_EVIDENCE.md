# S05-P002 — V3 release candidate source and bytecode lineage evidence

**Status: OPEN — no Mainnet authorization.** Parent: [fixed roadmap #7](https://github.com/jill0010/ton-marketplace/issues/7); tracked in [issue #9](https://github.com/jill0010/ton-marketplace/issues/9).

## Immutable candidate references
- Independently settled Testnet order-2 source baseline: `223cebcd0977d90486c71417645a6fe2cbaa4953`.
- Formatter-clean candidate: `4d97607a6bd22494e105852a3c375fc905a9d219`.
- Candidate PR: https://github.com/jill0010/ton-marketplace/pull/6 .
- GitHub compare: https://github.com/jill0010/ton-marketplace/compare/223cebcd0977d90486c71417645a6fe2cbaa4953...4d97607a6bd22494e105852a3c375fc905a9d219 .
- Compare result: 16 commits ahead, zero behind, 16 modified paths, including deployable `ReserveCoordinatorV3.tolk` and `ReserveVaultV3.tolk`, plus scripts, fixtures and tests. This is a **source diff**, not a compiled-code-hash equivalence proof.

## Verified CI evidence
- https://github.com/jill0010/ton-marketplace/actions/runs/42499582209 — both jobs passed; pinned candidate Acton build, full emulator tests, static checks and formatter all passed.
- https://github.com/jill0010/ton-marketplace/actions/runs/42499806374 — follow-up read-only readiness passed after fixing stale workflow comments.
- `contracts/marketplace/tests/v3-compiled-hashes.test.tolk` exports compiled production hashes, including MarketplaceReserveV3, ReserveCoordinatorV3, ReserveVaultV3 and SettlementAttestationVerifierV3. It is not yet evidence of equivalence across two independently compiled revisions.

## Required comparison before release
1. Run the *same pinned Acton toolchain* against both exact revisions in isolated clean checkouts, with no signing keys and no network transaction.
2. Record full compiled code hashes for MarketplaceReserveV3, ReserveCoordinatorV3, ReserveVaultV3, SettlementAttestationVerifierV3 and NFTEscrowV2. Preserve complete logs and toolchain versions as immutable artifacts.
3. Compare **hashes**, not just source whitespace. If any hash differs, treat the new binary as a new release candidate requiring full review and fresh Testnet end-to-end evidence; never assert equivalence from formatter output alone.
4. Independently verify deployed Testnet contract code hashes and bindings against the approved candidate. Testnet success for a different code hash cannot be reused as proof for Mainnet.
5. Require an independent security audit, custody/settlement/reserve-refund fault tests, frontend/backend checkout integration, operational sign-off and explicit Mainnet approval.

## Current decision
**BLOCKED** for Mainnet deployment. Read-only CI success proves only the checks it actually ran. No new contract was deployed, no real customer checkout enabled and no funds moved in this evidence update.
