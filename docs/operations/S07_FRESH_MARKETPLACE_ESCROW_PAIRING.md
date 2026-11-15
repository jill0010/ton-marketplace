# S07 Fresh Marketplace V3 + production Escrow Testnet pairing

## Verified blocker (2026-11-15)
- [Read-only Marketplace binding proof](https://github.com/jill0010/ton-marketplace/actions/runs/43701118264): existing Marketplace `kQB9Q03obJYKG84bfXFrpL6OtUcX41z54A3m4LFGf_0a14D_` returns bound escrow `0:29e52aa1a818f52cadeaf661e9043b15cd49ccc960621fe9efb5307bab4bdd3f`.
- Isolated production Escrow `kQBdX2PpCASy50dZOmspilaHrnPa6mgJ-DhuzBpNR4LJpQOP` is NOT this address.
- Marketplace contract's first-time escrow configuration checks `!storage.escrowConfigured`; no administrative rebind path is present. Do not attempt to mutate historical contracts or reprocess existing orders.

## Fresh-pair deployment requirements (not yet deployed)
1. Use **production** `MarketplaceReserveV3.tolk` and `NFTEscrowV2.tolk` code, never `TestMarketplaceReserveV3.tolk` or the test-only escrow fixture.
2. Build a fresh deterministic Marketplace address and Escrow address. Account for the circular address dependency: Escrow initialization includes Marketplace address; Marketplace escrow address must be configured once after both contracts are deployed. Confirm the Marketplace init code/storage and coordinator initialization independently.
3. Fail closed if either candidate address matches an existing deployment or the network is not Testnet. Require explicit testnet opt-in and wallet funds. No mainnet actions.
4. Deploy fresh Marketplace and fresh Escrow, then set Marketplace escrow exactly once and check both `marketplace.escrowV2() == escrow.address` and `escrow.marketplace() == marketplace.address` plus `escrowConfiguredV2()`.
5. Independently verify both contracts' on-chain code hashes against pinned production candidate hashes and check callback message compatibility. Record deploy transaction hashes, code hashes, state and getter evidence as CI artifacts.
6. Keep Marketplace paused/non-public until S04 refund evidence, S05 independent security audit and S06 settlement/payment integration acceptance are completed. Do not repeat historical purchases or settlements.

## Status
**Blocked pending fresh-pair deployment implementation and real Testnet proof.** This file is a deployment specification, not evidence of deployment, binding, audit completion or release approval.

## Existing source located on feature branch (2026-11-15)
- Production `MarketplaceReserveV3.tolk` and `deploy-v3-production-testnet.tolk` exist on `feature/reserve-refund-v3-audit`, **not** on current `main`.
- Existing deployment script uses `@wrappers/NFTEscrowV2Testnet.gen`, `NFTEscrowV2Testnet.fromStorage` and `build("NFTEscrowV2Testnet")`: it deploys the **fixture escrow** despite its production-sounding filename. Never run it unchanged to satisfy S07 production escrow proof.
- Next code change must be on the feature branch (or a carefully reviewed integration branch): switch the script to the production `NFTEscrowV2` wrapper and compiled hash, preserve the Marketplace V3 initialization and fresh nonce, and verify all four role getters. Merge production source and CI only after review. Existing `main` lacks the production V3 source and Acton manifest entries.
