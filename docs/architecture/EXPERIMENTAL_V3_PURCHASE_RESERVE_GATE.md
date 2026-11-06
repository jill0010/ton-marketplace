# Experimental V3 purchase reserve gate

Status: simulation-only, not deployable. Existing V2 deployment and order 1 are unchanged.

## Implemented integration

TestMarketplaceReserveV3 is a fresh-layout experimental fork of MarketplaceV2. Existing V2 purchase/delivery message definitions are reused for emulator fixtures, but purchase storage is schema 3 with a one-time coordinator binding and per-order reserve records. No V2 storage migration or upgrade is provided.

A buy reserves its product/order and records a commitment before sending AllocateTestReserve with 0.28 TON. Unlike V2, it does not request NFT release in that transaction. The field named paymentHash in this experimental allocation carries the buy body cell hash, NOT the transaction hash; it must be joined to authenticated sender, immutable buyer/order and indexed actual transaction identity by the future indexer. It is not an external payment proof.

The coordinator deploys/funds the dedicated vault. After the vault's genuine funding ACK, the coordinator sends TestReserveAllocationConfirmed. V3 verifies coordinator sender, order and commitment, records the vault and only then requests Escrow release. Exact duplicate callbacks do not release again. The coordinator address is owner-configured exactly once before orders exist.

The buyer still attaches gross plus 0.2 TON. The extra 0.08 TON allocation operations budget, NFT release/callback and payout processing costs are subsidized by prefunded experimental Marketplace balances; this does not prove per-order actual cost attribution.

## Local verification

The stepwise Acton cursor confirms the NFT is still in Escrow immediately after the buy transaction while the funding record is pending. A forged funding callback is rejected. Advancing the genuine trace funds the vault, confirms allocation, transfers the actual allowlisted Item code fixture to the buyer and dispatches seller/platform payouts. A genuine duplicate funding ACK is harmless.

The same rehearsal then performs an owner-reviewed synthetic example: cost 0.006 TON, refund 0.194 TON, followed by owner-recorded receipt confirmation. These amounts are test inputs, not a refund calculation or quote for the already deployed V2 order.

A bad-vault-code fault injection proves failed allocation does not release NFT. The coordinator records manual review; Marketplace remains awaiting funding. Automatic failure compensation is NOT implemented.

Both full rehearsals pass locally, along with the 14 focused reserve coordinator/vault tests and format checking. CI now runs both rehearsals.

## Blocking work before any deployment

- Funding-failure return/compensation, lost callback recovery and cancellation deadlines; currently a failed allocation leaves funds and NFT awaiting manual intervention.
- Per-order accounting across Marketplace, coordinator, vault, Escrow and NFT, including excesses; isolate all outstanding gross and reserve liabilities before spending operational funds.
- Concurrent orders, failed release, failed payout retries and insolvency/interleaving tests against this fork, not merely inherited V2 tests.
- Actual fee attribution and an explicitly reviewed owner-attestation policy; the prototype owner can attest external facts but cannot cryptographically prove them on chain.
- Versioned payment/message commitments, authenticated receipt indexing and complete returned-principal ownership records.
- Governance/code-hash review, cost reimbursement and fresh Testnet deployment only after all gates pass.

No deployment workflow is added. Do not point production or old V2 clients at this experiment, deploy it to Mainnet, or claim it can recover/refund the old V2 order-1 reserve.
