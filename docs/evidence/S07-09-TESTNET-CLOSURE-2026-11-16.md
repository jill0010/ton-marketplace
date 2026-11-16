# S07-09 — Testnet transaction closure evidence (2026-11-16)

Status: **S07 testnet functional transaction loop complete; S08 security release review pending.**

## Scope and immutable identifiers
- Repository: https://github.com/jill0010/ton-marketplace
- Network: TON **testnet only**. No mainnet deployment or payment is authorized by this record.
- Product ID: **2**; Escrow ID: **1**; Order ID: **1**.
- NFT item: `0:24ef755d50c766fc7f5160b3557e31da1007c30be7d59b6b386dcfd7ebaf5764`
- NFT collection: `0:010fe0bc01673c3e796bb19620f9a0d6ac1dcc86c0747ad5c8f7528eea566cdc`
- Marketplace: `kQCjpxlAc67afGlrC27CGbZzQxjOg8ME42URSFyY3aEL5gCg`
- NFT Escrow V2: `kQBxNyuqr-Ab5_LUzCc6KsXUEN9Q7vGT-HlDslDvBEuEDLK8`
- Reserve Coordinator V3: `kQCUs3jh8gTQtlAE3FgLVsiM5_j9TOTLKZUJgqacUFiO5_je`
- Settlement Verifier: `kQALNPtOZ5AIkaEwf4hoDTdJwgVttAwDq2ONZwuJTTzrZy-k`
- Order-specific Reserve Vault: `kQCFPrbZgKoPgZlBCmWDxWgyfHJdS18-rvkE-PkrzlCcGRu_`
- Buyer/treasury: `0QASRB4XGtN81Pwaef6fWnSJyRwwJEvbbPn-ksz0KQI-bFa0`
- Seller/deployer: `0QDQEewIr69mGcq6uDIlAtibxW37gm7rJfKWru7o4_hSPbzu`

## Original GitHub Actions evidence
| Evidence | Run | Observed job result |
| --- | --- | --- |
| Compatible NFT scan | https://github.com/jill0010/ton-marketplace/actions/runs/43893077380 | success |
| Compatible NFT preflight | https://github.com/jill0010/ton-marketplace/actions/runs/43894250921 | success |
| Initial listing workflow (historical diagnostic) | https://github.com/jill0010/ton-marketplace/actions/runs/43896681410 | failure |
| Initial purchase attempt (compile failed; no payment submitted) | https://github.com/jill0010/ton-marketplace/actions/runs/43898911309 | failure |
| Product 2 one-time testnet purchase | https://github.com/jill0010/ton-marketplace/actions/runs/43900405862 | success |
| Order 1 final settlement and read-only postcheck | https://github.com/jill0010/ton-marketplace/actions/runs/43902102867 | success |

**Primary settlement artifact:** https://github.com/jill0010/ton-marketplace/actions/runs/43902102867/artifacts/14243695165
Artifact name: `s07-09-product2-final-settlement-43902102867`.
GitHub Actions artifacts may expire under repository retention policy; this Markdown manifest is persistent in Git history, but is **not a replacement for the original log files**. Preserve/download the original artifact separately before expiry.

## Observed final-settlement evidence (run 43902102867)
- Network: `testnet`
- Product ID: `2`; order ID: `1`
- Reserve principal: `200000000` nanoTON (0.2 TON)
- Buyer NFT ownership: verified by the read-only on-chain postcheck
- Seller/platform payout: independent recipient transaction hashes recorded by attestor
- Validator quorum: `3/3`
- Vault status: `3` (paid)
- Paid: `200000000` nanoTON
- Vault in-flight: `0`; available: `0`
- `mainnetTransactionsSent: false`
- Attestor tests: `7/7` passed

### Transaction evidence (TON Center Base64 transaction hashes)
- Reserve dispatch: `rO/csHXgSoZne53QCfpDqst15IqTyoeyH0/+a2kIDd0=`
- Buyer reserve receipt: `WFCtLFmTTPjO6vq6sR+T11VmevTDLHOxqewKpi3puBw=`
- Seller payout receipt: `sir8YLnjtSnP0uZLczZhZtywSwp5Mp99cfviBqLvm2Q=`
- Platform payout receipt: `0UhCIBjgvogal0Z6nX6FLvF+cgg+yaILaJ4KTgE22bc=`
- Masterchain seqno recorded by attestor: `98361604`

### Evidence interpretation and S08 boundaries
The final read-only script reports:
`PRODUCTION V3 TESTNET ON-CHAIN STATE CHECK PASSED; INDEPENDENT TRANSFER FINALITY NOT ATTESTED.`

Its output explicitly states seller/platform payout contract status is dispatched and that independent recipient traces and validator quorum must be audited separately. The attestor step independently found buyer reserve and payout receipts and reported 3/3 quorum. These are **separate evidence layers**, not an independent external security audit or proof of mainnet readiness.

S08 must verify:
1. Exact production code hashes and deployed code against reviewed source.
2. Admin/owner/validator permissions and binding consistency for Marketplace, Escrow, Coordinator, Verifier, and per-order Vault.
3. Purchase, NFT custody, payout, reserve/refund and replay protections.
4. Independent transaction finality and receipt audit (including hashes above).
5. Security release gates, secrets, emergency pause, rollback/incident controls and mainnet deployment authorization.

## Operational guardrails
- **Never re-run** the product 2 purchase or order 1 final settlement workflow.
- Reuse the existing deployed testnet contracts and evidence; no redundant redeployment.
- S08 checks should be **read-only** unless a separately reviewed action is explicitly authorized.
- No mainnet transactions, deployment or safety-gate bypass from this evidence record.
