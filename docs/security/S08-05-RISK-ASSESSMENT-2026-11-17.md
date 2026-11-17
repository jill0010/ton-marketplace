# S08-05 — Mainnet go/no-go risk assessment (initial, 2026-11-17)

**Decision: NO-GO.** This is a risk-gate assessment, not approval for Mainnet deployment.

## Verified evidence available
- S07-09 Testnet purchase/NFT transfer/seller and platform payouts/0.2 TON reserve settlement completed; see `docs/evidence/S07-09-TESTNET-CLOSURE-2026-11-16.md`.
- S08-01 baseline: 155 tests passed on implementation SHA `85e84d29fcc58719e0ec351501fe1bf683e491b0`.
- S08-03 historical production code hashes and actual order Vault on-chain code hash verified, before any subsequent changes.

## Unacceptable open risk
- **F01 / BLOCKER:** `ReserveVaultV3.tolk` line 194 only accepts network -3 while Mainnet is -239. See `docs/security/S08-04-INTERNAL-REVIEW-2026-11-17.md`. This can prevent mainnet settlement proof acceptance and leave reserve funds in flight.
- Mainnet-specific bytecode provenance and affected tests must be refreshed after the necessary code fix.
- The zero-budget internal review is not complete and no independent audit report exists; residual security and receipt finality assumptions remain to be assessed.

## Mandatory before changing to GO
1. Fix F01 with explicit immutable network binding across Vault, Coordinator and Verifier; test Testnet acceptance, Mainnet acceptance, and cross-network rejection.
2. Review and resolve any further critical/high issues found in the focused Marketplace/Escrow and callback/finality review.
3. Run targeted affected tests and reproducible final build; pin the exact source SHA/toolchain/new production code hashes.
4. Document unaudited release risk and explicit owner risk acceptance if proceeding without a third-party audit.
5. Obtain **separate explicit authorization** before any S09 Mainnet deployment, signing or real-funds activity.

**No-go is a security control, not a request for more purchases or contract redeployments.**
