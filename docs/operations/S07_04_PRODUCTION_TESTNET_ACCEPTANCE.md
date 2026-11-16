# S07 — Mainnet pre-release acceptance (evidence ledger)

Status: **BLOCKED / NO MAINNET AUTHORIZATION**. Network: **TON TESTNET ONLY**.

## Verified successful fixture testnet order (2026-11-16)

- Settlement workflow: https://github.com/jill0010/ton-marketplace/actions/runs/43844621546
- Settlement evidence artifact: https://github.com/jill0010/ton-marketplace/actions/runs/43844621546/artifacts/14214781336 (30-day retention; archive before expiry).
- Candidate source checked out in this run: `47c4e56620b41cf49c033bb006ceedd4190a8958`.
- Marketplace: `kQAU4RhS-YlpOickiI4iSGlM0da0B2s68xuFhqaRwDtDFGkF`.
- Escrow: `kQC0LGltRDIVp7FxjHZhYX-FBgHAD1MP1afFSgkYjkhuwycm` (**NFTEscrowV2Testnet fixture variant, NOT production NFTEscrowV2**).
- Coordinator: `kQByrR9dHWfBsVYsF-F_G5zXk8xnp2T1gI6hQ-NHl6kjeVmQ`.
- Verifier: `kQDH2CEuo0bVVQm35V15cD75fm1kb3bXJH8TSXEdfR_Y8C4h`.
- Item: `kQADbJlooYUmz6-iT8a9tQ3nJJIq3vO7gdnAFmdgNOu0FJpr`; product 1, order 1.
- Per-order Vault: `kQAEE6nrpZDqAReQQLgqPwxvP17dmiEO3bgsSY6U-x4nn0PY`.
- Attestor output: `validatorQuorum=3/3`, `vaultStatus=3`, `paidNano=200000000`.
- Buyer reserve receipt hash (TON Center Base64): `B5CJbAf4ibz/cKJIxvYItMF7J2D4E0N9dlqk30VOhYM=`.
- Vault reserve dispatch hash: `BA1meAxcnBo1lm/2RLVl8MMA5XaYZFgEtw7ywd05Na4=`.
- Seller payout receipt hash: `1dJEcuRK0/5oOk74jPAczYZGoU7qOVyd9elDODapfQg=`.
- Platform payout receipt hash: `OUAyMw6JksgMDo5GwlmCS+2vpSFxkkFGzVXpq4MYluk=`.
- Final on-chain state verifier reports buyer NFT ownership, reserve paid, in-flight 0, available 0. Its own output explicitly states **independent transfer finality not attested**; do not misrepresent this as an independent external audit.

## Mandatory mainnet gates

| Gate | Status | Remaining action |
| --- | --- | --- |
| A. Exact production source/bytecode/roles | PARTIAL | Pin release SHA, reproduce hashes and review privileged setters/validator authority independently |
| B. Fixture testnet purchase | PASS FOR FIXTURE ONLY | Do not generalize to real Fragment item |
| C. Fixture NFT custody and delivery | PASS FOR FIXTURE ONLY | Production Escrow and authentic item compatibility remain unverified end-to-end |
| D. Seller/platform settlement | PASS FOR FIXTURE RECEIPTS | Independent trace/finality review remains |
| E. 0.2 TON reserve refund | PASS FOR THIS FIXTURE ORDER | Verify conservation/fees across failure paths and other orders |
| F. Failure recovery / bounce / replay | NOT ACCEPTED | Evidence for failed purchase, failed NFT transfer, double refund and retry protection; do not send funds until scenario reviewed |
| G. Independent security audit | BLOCKED | Independent TON/Tolk reviewer, findings, remediation and re-review report |
| H. Explicit release authorization | BLOCKED | Owner approval after A–G; no mainnet deployment or transfer before that |

## Next actions (minimal S07 path)

1. Archive the run artifact and exact transaction receipts before 30-day retention expires; record source commit and deployed code hashes.
2. Independently validate NFT transfer and all three recipient receipts against chain transaction traces; reconcile order-specific Vault principal and fees.
3. Review production `NFTEscrowV2.tolk` separately from `NFTEscrowV2Testnet.tolk`; synthetic code hash `0x6118df7fb1be9e18008b31600472fe22b8e1d26339fe54099cb5f868736bac6f` must not be allowed in production.
4. Produce failure-path evidence without replaying settled order 1; complete independent audit and remediation.
5. Issue a signed-off go/no-go decision; until then **NO-GO**.

This record supersedes stale S07-04 candidate addresses in earlier draft acceptance notes; historical S07-03 testnet candidate remains separate evidence, not proof for the fixture order above.
