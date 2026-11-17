# S08-04 — Zero-budget internal security review (2026-11-17)

**Result: FAIL for mainnet readiness; S08-05 risk assessment may start, but S09 release must remain BLOCKED.** This is a preliminary source-level internal review, not an independent audit or proof that all vulnerabilities have been found.

## Exact source inspected
GitHub revision `85e84d29fcc58719e0ec351501fe1bf683e491b0`; five production Tolk contracts:
- `MarketplaceReserveV3.tolk` (1,473 lines)
- `NFTEscrowV2.tolk` (867 lines)
- `ReserveCoordinatorV3.tolk` (269 lines)
- `ReserveVaultV3.tolk` (320 lines)
- `SettlementAttestationVerifierV3.tolk` (247 lines)

Reviewed role authorization, refund state transitions, coordinator funding and bounced-message paths, verifier signature threshold and replay checks, and network binding. This is **not** a line-by-line formal audit of all ~3,176 lines; do not claim comprehensive coverage.

## Finding S08-04-F01 — BLOCKER: reserve Vault accepts only Testnet settlement statements
**File:** `contracts/marketplace/contracts/ReserveVaultV3.tolk`, line 194, `SubmitReserveAttestationV3` handler.
```tolk
assert (root.networkGlobalId == -3) throw 769;
```
**Impact:** Production Vault code proven in S08-03 is hardcoded to TON Testnet global ID -3. TON Mainnet is -239. Mainnet settlement attestations are rejected before verifier dispatch, potentially leaving an in-flight 0.2 TON reserve unresolved and making the mainnet settlement flow unusable. In contrast, `SettlementAttestationVerifierV3.tolk` line 128 compares statement network to configured `storage.networkGlobalId`, and line 162 allows -3 or -239. The Vault and Verifier network policies disagree.

**Required remediation:** Make the Vault network binding immutable and explicit, tied to the intended deployment network and verifier configuration; reject cross-network statements. Update Coordinator's per-order Vault state initialization, relevant scripts and focused tests; recompile, pin new code hashes and rerun only affected checks. Any new Vault bytecode **invalidates** previous Vault bytecode equality evidence for that new candidate and requires fresh read-only provenance verification. Do not blindly replace -3 with an unrestricted (-3 || -239) acceptance condition.

**Disposition:** OPEN. No code remediation or tests executed by this report.

## Observed existing controls (not certification)
- Coordinator `AllocateReserveV3` checks sender equals marketplace, unique order ID and exact 0.28 TON funding; on `ReserveFundedV3` checks the actual bound Vault address and payment hash.
- Vault `FundReserveV3` checks funding source, order ID/payment hash, initial status and 0.2 TON principal + 0.08 TON operational funding.
- Vault refund dispatch sets `inFlight`, clears `available` and increments operation/query IDs before sending; bounced messages alone do not restore funds.
- Vault settlement callback requires configured verifier address, active statement hash and matching operation/query IDs; consumes statement hash.
- Verifier checks network, vault caller, order identity, 3 distinct validator keys, threshold and signatures, plus consumed statement hash.
These controls have not been independently audited, and the off-chain receipt-finality trust model remains a residual risk.

## Other unresolved security review questions
- Independent finality: S07-09 recorded `INDEPENDENT TRANSFER FINALITY NOT ATTESTED`; assess signer independence, trusted RPC/finality assumptions, and how invalid/expired attestation is prevented.
- Operational liveness: verifier marks statements consumed before delivering callback; bounced callback handler is empty. Assess whether gas/bounce failures can strand an in-flight Vault with no safe retry/reconciliation.
- Confirm that final release source, build environment, deployment scripts and Mainnet network ID agree; re-evaluate production role hash proofs after any code change.
- Remaining Marketplace/Escrow lines require focused review before claiming the internal review complete.

## S08-05 risk gate
- **Current decision: NO-GO** for S09. Critical functional network mismatch F01 is open.
- Independent third-party audit not commissioned due to zero budget. Any future owner risk acceptance of unaudited release cannot waive known release-blocking defects.
- No wallet signing, Mainnet deployment, funds transfer, repeat testnet purchase or contract deployment was performed.
